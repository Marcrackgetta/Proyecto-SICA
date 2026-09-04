# Guía de Configuración de Supabase para SICA

Dado que el motor unificado ahora utiliza Supabase y no tenemos acceso al proyecto anterior, sigue estos pasos para crear tu propia base de datos desde cero.

## 1. Crear el Proyecto en Supabase
1. Ve a [Supabase.com](https://supabase.com/) e inicia sesión (o regístrate con GitHub).
2. Haz clic en **"New Project"**.
3. Selecciona tu organización (o crea una nueva).
4. Dale un nombre al proyecto (ej. SICA-Edge).
5. Genera una contraseña segura para la base de datos y guárdala (no la usaremos en el código Python, pero es importante).
6. Elige una región cercana (ej. US East).
7. Haz clic en **"Create new project"**. Espera unos minutos hasta que se provisione la base de datos.

## 2. Obtener Credenciales (.env)
1. En el panel izquierdo de tu proyecto en Supabase, ve al ícono de engranaje **(Project Settings)**.
2. En el menú lateral, selecciona **"API"**.
3. En la sección **Project URL**, copia la URL (ej. https://xxxxxx.supabase.co).
4. En la sección **Project API keys**, copia la llave non public.
5. Ve a la carpeta motor_reconimiento_unificado, crea un archivo llamado .env y pega los valores así:

\\\env
SUPABASE_URL=https://tu-url-copiada.supabase.co
SUPABASE_KEY=tu-llave-anon-publica-copiada
\\\

## 3. Ejecutar los Scripts SQL
1. En el panel izquierdo de Supabase, ve a **"SQL Editor"**.
2. Haz clic en **"New query"**.
3. Copia y pega el siguiente código SQL para crear todas las tablas necesarias:

\\\sql
-- 1. Habilitar extensión UUID para identificadores únicos seguros
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Cámaras
CREATE TABLE camaras (
    id TEXT PRIMARY KEY,           -- Ej: CAM_001
    nombre TEXT,                   -- Ej: Cámara Puerta Principal
    activa BOOLEAN DEFAULT false,
    ubicacion JSONB,               -- Guardar lat/long u otros metadatos
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de Cursos
CREATE TABLE cursos (
    id TEXT PRIMARY KEY,           -- Ej: 2_INFO_B
    nombre TEXT,                   -- Ej: 2do Informática B
    camara_id TEXT REFERENCES camaras(id) ON DELETE SET NULL
);

-- 4. Tabla de Estudiantes
CREATE TABLE estudiantes (
    cedula TEXT PRIMARY KEY,       -- Ej: 0912345678
    nombre TEXT NOT NULL,          -- Ej: Juan Perez
    curso_id TEXT REFERENCES cursos(id) ON DELETE CASCADE,
    representante_uid TEXT         -- Preparado para notificaciones futuras
);

-- 5. Tabla de Asistencia
CREATE TABLE asistencia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudiante_cedula TEXT REFERENCES estudiantes(cedula) ON DELETE CASCADE,
    curso_id TEXT REFERENCES cursos(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hora_clase TEXT NOT NULL,      -- Ej: Hora_1
    estado TEXT NOT NULL,          -- Presente, Falta, Fugado, Intruso, Atrasado
    timestamp_deteccion TIMESTAMPTZ,
    UNIQUE(estudiante_cedula, fecha, hora_clase, curso_id) -- Evita duplicados exactos
);

-- 6. Configurar Políticas de Seguridad (RLS) - Permite lectura/escritura anónima desde nuestra app
ALTER TABLE camaras ENABLE ROW LEVEL SECURITY;
ALTER TABLE cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estudiantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo a anonimos en camaras" ON camaras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a anonimos en cursos" ON cursos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a anonimos en estudiantes" ON estudiantes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a anonimos en asistencia" ON asistencia FOR ALL USING (true) WITH CHECK (true);
\\\

4. Haz clic en **"Run"** (o presiona Ctrl+Enter) para ejecutar el script.
5. Deberías ver un mensaje que dice "Success, no rows returned".

## 4. Validar la Configuración
Para comprobar que todo está bien, ve a **"Table Editor"** en el panel izquierdo de Supabase. Deberías ver las cuatro tablas creadas (camaras, cursos, estudiantes, sistencia) vacías y listas para usarse.
