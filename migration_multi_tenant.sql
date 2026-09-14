-- =========================================================================================
-- MIGRACIÓN DE SUPABASE: MULTI-TENANT (CÓDIGO AMIE) Y LÓGICA DE ASISTENCIA / ESTADOS
-- =========================================================================================

-- 1. TABLA INSTITUCIONES (Soporte Multi-tenant)
CREATE TABLE IF NOT EXISTS instituciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_amie VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    hora_entrada TIME NOT NULL DEFAULT '07:00:00',
    hora_salida TIME NOT NULL DEFAULT '13:00:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar una institución por defecto para mantener la compatibilidad con los datos actuales
INSERT INTO instituciones (codigo_amie, nombre) 
VALUES ('000000', 'Institución Principal (Default)')
ON CONFLICT (codigo_amie) DO NOTHING;

-- Modificar las tablas actuales de forma segura (sin borrar datos)
DO $$
DECLARE
    default_inst UUID;
BEGIN
    SELECT id INTO default_inst FROM instituciones WHERE codigo_amie = '000000' LIMIT 1;
    
    -- Añadir institucion_id a Cursos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cursos' AND column_name = 'institucion_id') THEN
        ALTER TABLE cursos ADD COLUMN institucion_id UUID REFERENCES instituciones(id);
        UPDATE cursos SET institucion_id = default_inst WHERE institucion_id IS NULL;
    END IF;

    -- Añadir institucion_id a Usuarios
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'institucion_id') THEN
        ALTER TABLE usuarios ADD COLUMN institucion_id UUID REFERENCES instituciones(id);
        UPDATE usuarios SET institucion_id = default_inst WHERE institucion_id IS NULL;
    END IF;
    
    -- Añadir institucion_id a Solicitudes de vinculacion
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'solicitudes_vinculacion' AND column_name = 'institucion_id') THEN
        ALTER TABLE solicitudes_vinculacion ADD COLUMN institucion_id UUID REFERENCES instituciones(id);
        UPDATE solicitudes_vinculacion SET institucion_id = default_inst WHERE institucion_id IS NULL;
    END IF;
END $$;


-- =========================================================================================
-- 2. ZONIFICACIÓN DE CÁMARAS (Extensión NO destructiva para la tabla de camaras)
-- =========================================================================================
-- Esto mapea una cámara existente a su "rol" (Entrada, Aula, Patio) y a qué curso le pertenece
-- NOTA: Respeta tu restricción estricta de no modificar la tabla `camaras`.
CREATE TABLE IF NOT EXISTS zonas_camaras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    camara_id VARCHAR(255) UNIQUE NOT NULL, -- Hace match lógico con el ID original de tu tabla de cámaras
    institucion_id UUID REFERENCES instituciones(id),
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('AULA', 'PATIO', 'PUERTA_PRINCIPAL')),
    curso_id TEXT REFERENCES cursos(id), -- Corregido: tipo TEXT para coincidir con cursos.id
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Poblar automáticamente la zonificación inicial asumiendo que todas las cámaras actuales son AULAS
INSERT INTO zonas_camaras (camara_id, institucion_id, tipo)
SELECT id, (SELECT id FROM instituciones WHERE codigo_amie = '000000' LIMIT 1), 'AULA' 
FROM camaras
ON CONFLICT (camara_id) DO NOTHING;


-- =========================================================================================
-- 3. TABLA ASISTENCIA DIARIA (Estado único por día por estudiante)
-- =========================================================================================
CREATE TABLE IF NOT EXISTS asistencia_diaria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudiante_cedula VARCHAR(50) REFERENCES estudiantes(cedula),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    hora_llegada TIMESTAMP WITH TIME ZONE,
    hora_salida TIMESTAMP WITH TIME ZONE,
    estado_llegada VARCHAR(50),   -- Ej: 'Presente', 'Atrasado', 'Falta'
    estado_ubicacion VARCHAR(50), -- Ej: 'En clase', 'Fugado', 'Intruso'
    ultima_camara_id VARCHAR(255),
    ultima_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(estudiante_cedula, fecha)
);


-- =========================================================================================
-- 4. PROCEDIMIENTO ALMACENADO (Lógica Core Inteligente)
-- =========================================================================================
-- Este RPC será llamado por el motor de Python cada vez que detecte un rostro.
CREATE OR REPLACE FUNCTION reportar_deteccion(
    p_cedula VARCHAR,
    p_camara_id VARCHAR,
    p_timestamp TIMESTAMP WITH TIME ZONE
) RETURNS void AS $$
DECLARE
    v_fecha DATE := p_timestamp::DATE;
    v_hora TIME := p_timestamp::TIME;
    v_inst_id UUID;
    v_hora_entrada TIME;
    v_hora_salida TIME;
    v_estado_llegada VARCHAR(50);
    v_estado_ubicacion VARCHAR(50);
    v_zona_tipo VARCHAR(50);
    v_zona_curso_id TEXT;
    v_estudiante_curso_id TEXT;
BEGIN
    -- 1. Obtener curso del estudiante
    SELECT curso_id INTO v_estudiante_curso_id FROM estudiantes WHERE cedula = p_cedula;
    
    -- Si no existe el estudiante, no registramos asistencia
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 2. Obtener institución a través del curso (o si está vacía, usar el default)
    SELECT institucion_id INTO v_inst_id FROM cursos WHERE id = v_estudiante_curso_id;
    IF v_inst_id IS NULL THEN
        SELECT id INTO v_inst_id FROM instituciones LIMIT 1;
    END IF;
    SELECT hora_entrada, hora_salida INTO v_hora_entrada, v_hora_salida FROM instituciones WHERE id = v_inst_id;

    -- 3. Obtener la zona mapeada de la cámara (si no existe, asumimos que es pasillo/patio)
    SELECT tipo, curso_id INTO v_zona_tipo, v_zona_curso_id FROM zonas_camaras WHERE camara_id = p_camara_id;
    
    IF v_zona_tipo IS NULL THEN
        v_zona_tipo := 'PATIO';
    END IF;

    -- 4. Analizar la ubicación actual del estudiante
    IF v_zona_tipo = 'AULA' THEN
        -- Si la cámara está asignada a su curso
        IF v_zona_curso_id = v_estudiante_curso_id OR v_zona_curso_id IS NULL THEN
            v_estado_ubicacion := 'En clase';
        ELSE
            v_estado_ubicacion := 'Intruso'; -- Está en un aula que no le corresponde
        END IF;
    ELSIF v_zona_tipo = 'PATIO' THEN
        v_estado_ubicacion := 'Fugado'; -- En el pasillo
    ELSE
        v_estado_ubicacion := 'Transito';
    END IF;

    -- 5. Lógica de registro o actualización en `asistencia_diaria`
    IF EXISTS (SELECT 1 FROM asistencia_diaria WHERE estudiante_cedula = p_cedula AND fecha = v_fecha) THEN
        
        -- Si ya existe registro hoy, actualizamos su ubicación actual
        UPDATE asistencia_diaria
        SET 
            ultima_actualizacion = p_timestamp,
            ultima_camara_id = p_camara_id,
            estado_ubicacion = v_estado_ubicacion,
            -- Si lo capta una cámara de salida y ya pasó la hora oficial, lo marcamos como salido
            hora_salida = CASE 
                            WHEN v_zona_tipo = 'PUERTA_PRINCIPAL' AND v_hora >= v_hora_salida 
                            THEN p_timestamp 
                            ELSE hora_salida 
                          END
        WHERE estudiante_cedula = p_cedula AND fecha = v_fecha;
        
    ELSE
        -- Es la PRIMERA detección del día (Se marca su Llegada)
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

    -- OPACIONAL: Mantener el historial crudo para el heatmap sin sobrecargar con lógica
    -- INSERT INTO asistencia (estudiante_cedula, camara_id, timestamp_deteccion, estado) VALUES (p_cedula, p_camara_id, p_timestamp, v_estado_ubicacion);
    
END;
$$ LANGUAGE plpgsql;

-- Habilitar notificaciones en tiempo real para la tabla asistencia_diaria
ALTER PUBLICATION supabase_realtime ADD TABLE asistencia_diaria;
