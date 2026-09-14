-- =========================================================================================
-- SETUP: INSTITUCIÓN REAL (ANAI) Y SISTEMA DE JORNADAS/HORARIOS
-- =========================================================================================

-- 1. Registrar Institución ANAI
INSERT INTO instituciones (codigo_amie, nombre) 
VALUES ('09H00878', 'Academia Naval Almirante Illingworth')
ON CONFLICT (codigo_amie) DO UPDATE SET nombre = EXCLUDED.nombre;

-- 2. Crear tabla de Jornadas para soportar múltiples horarios
CREATE TABLE IF NOT EXISTS jornadas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institucion_id UUID REFERENCES instituciones(id),
    nombre VARCHAR(100) NOT NULL,
    hora_entrada TIME NOT NULL,
    hora_salida TIME NOT NULL,
    recreo_inicio TIME,
    recreo_fin TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enlazar Cursos a una Jornada
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cursos' AND column_name = 'jornada_id') THEN
        ALTER TABLE cursos ADD COLUMN jornada_id UUID REFERENCES jornadas(id);
    END IF;
END $$;

-- 4. Insertar las Jornadas base de ANAI (Basado exactamente en horarios.json)
DO $$
DECLARE
    v_inst_id UUID;
    v_bas_mat UUID;
    v_bach_mat UUID;
    v_bas_vesp UUID;
    v_bach_vesp UUID;
BEGIN
    SELECT id INTO v_inst_id FROM instituciones WHERE codigo_amie = '09H00878';

    -- Básica Matutina (BAS_MAT)
    INSERT INTO jornadas (institucion_id, nombre, hora_entrada, hora_salida, recreo_inicio, recreo_fin)
    VALUES (v_inst_id, 'Básica Matutina', '06:50:00', '12:25:00', '08:50:00', '09:10:00')
    RETURNING id INTO v_bas_mat;

    -- Bachillerato Matutina (BACH_MAT)
    INSERT INTO jornadas (institucion_id, nombre, hora_entrada, hora_salida, recreo_inicio, recreo_fin)
    VALUES (v_inst_id, 'Bachillerato Matutina', '06:50:00', '12:25:00', '09:30:00', '09:50:00')
    RETURNING id INTO v_bach_mat;

    -- Básica Vespertina (VESP_BAS)
    INSERT INTO jornadas (institucion_id, nombre, hora_entrada, hora_salida, recreo_inicio, recreo_fin)
    VALUES (v_inst_id, 'Básica Vespertina', '12:55:00', '17:55:00', '14:55:00', '15:15:00')
    RETURNING id INTO v_bas_vesp;

    -- Bachillerato Vespertina (VESP_BACH)
    INSERT INTO jornadas (institucion_id, nombre, hora_entrada, hora_salida, recreo_inicio, recreo_fin)
    VALUES (v_inst_id, 'Bachillerato Vespertina', '12:55:00', '17:55:00', '15:35:00', '15:55:00')
    RETURNING id INTO v_bach_vesp;

    -- Actualizar los cursos actuales según el mapeo de horarios.json
    UPDATE cursos SET institucion_id = v_inst_id, jornada_id = v_bach_mat WHERE id IN ('2_INFO_B_MAT', 'curso_mock_1');
    UPDATE cursos SET institucion_id = v_inst_id, jornada_id = v_bach_vesp WHERE id = '2_INFO_B_VESP';
    
    -- Los demás cursos sin mapeo por defecto a Bachillerato Matutino para no quedar huérfanos
    UPDATE cursos SET institucion_id = v_inst_id, jornada_id = v_bach_mat WHERE jornada_id IS NULL;
END $$;


-- =========================================================================================
-- 5. MAPEAR ESTRICTAMENTE LAS CÁMARAS OFICIALES SEGÚN cameras.json
-- =========================================================================================
-- Respetamos completamente la tabla 'camaras' existente. Solo configuramos la lógica de zonas.
DELETE FROM zonas_camaras;
INSERT INTO zonas_camaras (camara_id, institucion_id, tipo, curso_id)
SELECT 'CAM_001', id, 'AULA', '2_INFO_B_MAT' FROM instituciones WHERE codigo_amie = '09H00878'
ON CONFLICT (camara_id) DO UPDATE SET tipo = 'AULA', curso_id = '2_INFO_B_MAT';

INSERT INTO zonas_camaras (camara_id, institucion_id, tipo, curso_id)
SELECT 'CAM_002', id, 'AULA', '2_INFO_B_VESP' FROM instituciones WHERE codigo_amie = '09H00878'
ON CONFLICT (camara_id) DO UPDATE SET tipo = 'AULA', curso_id = '2_INFO_B_VESP';

INSERT INTO zonas_camaras (camara_id, institucion_id, tipo, curso_id)
SELECT 'CAM_003', id, 'PATIO', NULL FROM instituciones WHERE codigo_amie = '09H00878'
ON CONFLICT (camara_id) DO UPDATE SET tipo = 'PATIO', curso_id = NULL;


-- =========================================================================================
-- 6. ACTUALIZAR EL CEREBRO: LÓGICA STRICTA SOLICITADA POR EL USUARIO
-- =========================================================================================
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
    v_zona_tipo VARCHAR(50);
    v_zona_curso_id TEXT;
    v_estudiante_curso_id TEXT;
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

    -- 3. Obtener la zona de la cámara oficial (de la tabla zonas_camaras, respetando cameras.json)
    SELECT tipo, curso_id INTO v_zona_tipo, v_zona_curso_id FROM zonas_camaras WHERE camara_id = p_camara_id;
    IF v_zona_tipo IS NULL THEN v_zona_tipo := 'PATIO'; END IF;

    -- 4. Determinar ubicación basándose EXCLUSIVAMENTE en el horario
    IF v_hora < v_hora_entrada THEN
        -- Antes de clases, puede estar en cualquier lado
        v_estado_ubicacion := 'En transito (Antes de clases)';
    ELSIF v_hora > v_hora_salida THEN
        -- Después de clases
        v_estado_ubicacion := 'En transito (Despues de clases)';
    ELSE
        -- DURANTE HORAS DE CLASE (Aplicar lógica Fugado/Intruso)
        IF v_zona_tipo = 'AULA' THEN
            IF v_zona_curso_id = v_estudiante_curso_id OR v_zona_curso_id IS NULL THEN
                v_estado_ubicacion := 'En clase';
            ELSE
                v_estado_ubicacion := 'Intruso'; -- Está en un aula ajena durante horario de clases
            END IF;
        ELSIF v_zona_tipo = 'PATIO' THEN
            -- ¿Es hora de recreo para la jornada de este estudiante?
            IF v_recreo_inicio IS NOT NULL AND v_hora >= v_recreo_inicio AND v_hora <= v_recreo_fin THEN
                v_estado_ubicacion := 'En recreo';
            ELSE
                v_estado_ubicacion := 'Fugado'; -- En el patio durante horario de clases (y no es recreo)
            END IF;
        ELSE
            v_estado_ubicacion := 'En transito';
        END IF;
    END IF;

    -- 5. REGISTRO OFICIAL (Regla de Oro: Primera detección = Presente, sin importar cámara ni horario)
    IF EXISTS (SELECT 1 FROM asistencia_diaria WHERE estudiante_cedula = p_cedula AND fecha = v_fecha) THEN
        -- Actualizamos ubicación
        UPDATE asistencia_diaria
        SET 
            ultima_actualizacion = p_timestamp,
            ultima_camara_id = p_camara_id,
            estado_ubicacion = v_estado_ubicacion,
            -- (La hora_salida se calculará en la base de datos si lo ven saliendo después de clases)
            hora_salida = CASE 
                            WHEN v_hora >= v_hora_salida 
                            THEN p_timestamp 
                            ELSE hora_salida 
                          END
        WHERE estudiante_cedula = p_cedula AND fecha = v_fecha;
    ELSE
        -- PRIMERA detección del día = PRESENTE (evaluando solo si llegó puntual o atrasado)
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
END;
$$ LANGUAGE plpgsql;
