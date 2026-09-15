-- =========================================================================================
-- MIGRACIÓN: AÑADIR HISTORIAL DE EVENTOS (TIMELINE)
-- =========================================================================================

-- 1. Crear la tabla de historial de eventos
CREATE TABLE IF NOT EXISTS historial_eventos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudiante_cedula VARCHAR REFERENCES estudiantes(cedula),
    camara_id VARCHAR REFERENCES camaras(id),
    estado_consolidado VARCHAR(50) NOT NULL,
    fecha DATE NOT NULL,
    timestamp_evento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Modificar el Stored Procedure
CREATE OR REPLACE FUNCTION reportar_deteccion(
    p_cedula VARCHAR,
    p_camara_id VARCHAR,
    p_timestamp TIMESTAMP WITH TIME ZONE
) RETURNS void AS $$
DECLARE
    v_fecha DATE := (p_timestamp AT TIME ZONE 'America/Guayaquil')::DATE;
    v_hora TIME := (p_timestamp AT TIME ZONE 'America/Guayaquil')::TIME;
    v_hora_entrada TIME;
    v_hora_salida TIME;
    v_recreo_inicio TIME;
    v_recreo_fin TIME;
    v_estado_llegada VARCHAR(50);
    v_estado_ubicacion VARCHAR(50);
    v_estado_consolidado VARCHAR(50);
    v_ultimo_estado VARCHAR(50);
    v_zona_tipo VARCHAR(50);
    v_zona_curso_id TEXT;
    v_estudiante_curso_id TEXT;
    v_is_first_detection BOOLEAN := FALSE;
BEGIN
    -- 1. Obtener curso del estudiante
    SELECT curso_id INTO v_estudiante_curso_id FROM estudiantes WHERE cedula = p_cedula;
    IF NOT FOUND THEN RETURN; END IF;

    -- 2. Obtener horarios ESPECÍFICOS basados en la jornada del curso
    SELECT j.hora_entrada, j.hora_salida, j.recreo_inicio, j.recreo_fin 
    INTO v_hora_entrada, v_hora_salida, v_recreo_inicio, v_recreo_fin
    FROM cursos c
    JOIN jornadas j ON c.jornada_id = j.id
    WHERE c.id = v_estudiante_curso_id;
    
    -- Fallback si un curso no tiene jornada
    IF v_hora_entrada IS NULL THEN
        v_hora_entrada := '07:00:00';
        v_hora_salida := '13:00:00';
    END IF;

    -- 3. Obtener la zona de la cámara oficial
    SELECT tipo, curso_id INTO v_zona_tipo, v_zona_curso_id FROM zonas_camaras WHERE camara_id = p_camara_id;
    IF v_zona_tipo IS NULL THEN v_zona_tipo := 'PATIO'; END IF;

    -- 4. Determinar ubicación basándose EXCLUSIVAMENTE en el horario y la cámara
    IF v_hora < v_hora_entrada THEN
        v_estado_ubicacion := 'En transito (Antes de clases)';
    ELSIF v_hora > v_hora_salida THEN
        v_estado_ubicacion := 'En transito (Despues de clases)';
    ELSE
        -- DURANTE HORAS DE CLASE (Aplicar lógica Fugado/Intruso)
        IF v_zona_tipo = 'AULA' THEN
            IF v_zona_curso_id = v_estudiante_curso_id OR v_zona_curso_id IS NULL THEN
                v_estado_ubicacion := 'En clase';
            ELSE
                v_estado_ubicacion := 'Intruso';
            END IF;
        ELSIF v_zona_tipo = 'PATIO' THEN
            -- ¿Es hora de recreo?
            IF v_recreo_inicio IS NOT NULL AND v_hora >= v_recreo_inicio AND v_hora <= v_recreo_fin THEN
                v_estado_ubicacion := 'En recreo';
            ELSE
                v_estado_ubicacion := 'Fugado';
            END IF;
        ELSE
            v_estado_ubicacion := 'En transito';
        END IF;
    END IF;

    -- 5. LÓGICA DE REGISTRO EN ASISTENCIA_DIARIA (OVERVIEW)
    IF EXISTS (SELECT 1 FROM asistencia_diaria WHERE estudiante_cedula = p_cedula AND fecha = v_fecha) THEN
        UPDATE asistencia_diaria
        SET 
            ultima_actualizacion = p_timestamp,
            ultima_camara_id = p_camara_id,
            estado_ubicacion = v_estado_ubicacion,
            hora_salida = CASE 
                            WHEN v_hora >= v_hora_salida 
                            THEN p_timestamp 
                            ELSE hora_salida 
                          END
        WHERE estudiante_cedula = p_cedula AND fecha = v_fecha;
    ELSE
        v_is_first_detection := TRUE;
        IF v_hora <= v_hora_entrada THEN
            v_estado_llegada := 'Presente';
        ELSE
            v_estado_llegada := 'Atrasado';
        END IF;

        INSERT INTO asistencia_diaria (
            estudiante_cedula, fecha, hora_llegada, estado_llegada, estado_ubicacion, ultima_camara_id, ultima_actualizacion
        ) VALUES (
            p_cedula, v_fecha, p_timestamp, v_estado_llegada, v_estado_ubicacion, p_camara_id, p_timestamp
        );
    END IF;

    -- 6. LÓGICA DE TIMELINE INDEPENDIENTE (HISTORIAL_EVENTOS)
    
    -- Determinar el estado consolidado a guardar en el timeline
    IF v_is_first_detection THEN
        v_estado_consolidado := v_estado_llegada;
    ELSE
        IF v_estado_ubicacion = 'En clase' THEN
            v_estado_consolidado := 'Presente';
        ELSE
            v_estado_consolidado := v_estado_ubicacion;
        END IF;
    END IF;

    -- Consultar el último evento guardado hoy para este estudiante
    SELECT estado_consolidado INTO v_ultimo_estado FROM historial_eventos 
    WHERE estudiante_cedula = p_cedula AND fecha = v_fecha 
    ORDER BY timestamp_evento DESC LIMIT 1;

    -- Insertar un NUEVO evento SOLAMENTE si el estado cambió (debounce)
    IF v_ultimo_estado IS DISTINCT FROM v_estado_consolidado THEN
        INSERT INTO historial_eventos (estudiante_cedula, camara_id, estado_consolidado, fecha, timestamp_evento)
        VALUES (p_cedula, p_camara_id, v_estado_consolidado, v_fecha, p_timestamp);
    END IF;

END;
$$ LANGUAGE plpgsql;
