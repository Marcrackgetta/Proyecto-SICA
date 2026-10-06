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
    v_previous_ubicacion VARCHAR(50);
    v_ultimo_estado VARCHAR(50);
    v_zona_tipo VARCHAR(50);
    v_zona_curso_id TEXT;
    v_estudiante_curso_id TEXT;
    v_is_first_detection BOOLEAN := FALSE;
BEGIN
    -- 1. Obtener curso del estudiante
    SELECT curso_id INTO v_estudiante_curso_id FROM estudiantes WHERE cedula = p_cedula;
    IF NOT FOUND THEN RETURN; END IF;

    -- 2. Obtener horarios ESPEC�FICOS basados en la jornada del curso
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

    -- 3. Obtener la zona de la c�mara oficial
    SELECT tipo, curso_id INTO v_zona_tipo, v_zona_curso_id FROM zonas_camaras WHERE camara_id = p_camara_id;
    IF v_zona_tipo IS NULL THEN v_zona_tipo := 'PATIO'; END IF;

    -- 4. Determinar ubicaci�n bas�ndose EXCLUSIVAMENTE en el horario y la c�mara
    IF v_hora < v_hora_entrada THEN
        v_estado_ubicacion := 'En transito (Antes de clases)';
    ELSIF v_hora > v_hora_salida THEN
        v_estado_ubicacion := 'En transito (Despues de clases)';
    ELSE
        -- DURANTE HORAS DE CLASE (Aplicar l�gica Fugado/Intruso)
        IF v_zona_tipo = 'AULA' THEN
            IF v_zona_curso_id = v_estudiante_curso_id OR v_zona_curso_id IS NULL THEN
                v_estado_ubicacion := 'En clase';
            ELSE
                v_estado_ubicacion := 'Intruso';
            END IF;
        ELSIF v_zona_tipo = 'PATIO' THEN
            -- �Es hora de recreo?
            IF v_recreo_inicio IS NOT NULL AND v_hora >= v_recreo_inicio AND v_hora <= v_recreo_fin THEN
                v_estado_ubicacion := 'En recreo';
            ELSE
                v_estado_ubicacion := 'Fugado';
            END IF;
        ELSE
            v_estado_ubicacion := 'En transito';
        END IF;
    END IF;

    -- 5. L�GICA DE REGISTRO EN ASISTENCIA_DIARIA (OVERVIEW)
    SELECT estado_ubicacion INTO v_previous_ubicacion FROM asistencia_diaria WHERE estudiante_cedula = p_cedula AND fecha = v_fecha;

    IF FOUND THEN
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

    -- 6. L�GICA DE TIMELINE INDEPENDIENTE (HISTORIAL_EVENTOS)
    
    IF v_is_first_detection THEN
        -- Solo 1 evento de llegada. Ya sea 'Presente' o 'Atrasado'.
        INSERT INTO historial_eventos (estudiante_cedula, camara_id, estado_consolidado, fecha, timestamp_evento)
        VALUES (p_cedula, p_camara_id, v_estado_llegada, v_fecha, p_timestamp);
    ELSE
        -- Validar registro de eventos an�malos (Fugado/Intruso)
        IF v_estado_ubicacion IN ('Fugado', 'Intruso') THEN
            -- Solo insertar si es un evento an�malo NUEVO (para no spammear)
            IF v_previous_ubicacion IS DISTINCT FROM v_estado_ubicacion THEN
                INSERT INTO historial_eventos (estudiante_cedula, camara_id, estado_consolidado, fecha, timestamp_evento)
                VALUES (p_cedula, p_camara_id, v_estado_ubicacion, v_fecha, p_timestamp);
            END IF;
        
        -- Validar registro de Salida
        ELSIF v_estado_ubicacion = 'En transito (Despues de clases)' THEN
            SELECT estado_consolidado INTO v_ultimo_estado FROM historial_eventos 
            WHERE estudiante_cedula = p_cedula AND fecha = v_fecha 
            ORDER BY timestamp_evento DESC LIMIT 1;

            -- Solo insertar si no hemos insertado 'Salida' previamente.
            IF v_ultimo_estado IS DISTINCT FROM 'Salida' THEN
                INSERT INTO historial_eventos (estudiante_cedula, camara_id, estado_consolidado, fecha, timestamp_evento)
                VALUES (p_cedula, p_camara_id, 'Salida', v_fecha, p_timestamp);
            END IF;
        END IF;
        -- (Si regres� a 'En clase', no generamos un nuevo evento, manteniendo el historial limpio)
    END IF;

END;
$$ LANGUAGE plpgsql;
