# Proyecto SICA (Sistema Inteligente de Control de Asistencia)

Bienvenido al repositorio del proyecto SICA. Este sistema está dividido en tres componentes principales que trabajan en conjunto de forma unificada:

1. **Motor de Reconocimiento Facial (`motor_reconimiento_unificado`)**: Aplicación y backend en Python que procesa los flujos de las cámaras en tiempo real utilizando inteligencia artificial.
2. **Panel de Administración Web (`admin_web_unificado`)**: Dashboard construido en Next.js para administrar usuarios, estudiantes, cámaras, reportes y ver eventos del sistema.
3. **Aplicación Móvil (`app_sica`)**: Aplicación en React Native (Expo) para recibir notificaciones en tiempo real, visualizar estado y tener control desde un dispositivo móvil.

A continuación encontrarás la guía paso a paso para ejecutar el proyecto en cualquier entorno nuevo.

---

## 📋 Requisitos Previos

Asegúrate de tener instalados los siguientes programas en tu computadora:
- **Python 3.10 o superior** (para el motor de reconocimiento)
- **Node.js 18 o superior** (para la web y la app móvil)
- Una cuenta gratuita en [Supabase](https://supabase.com/)

---

## 🗄️ 1. Configuración de Base de Datos (Supabase)

Supabase es el corazón del proyecto SICA, conectando todas las piezas.
1. Inicia sesión en Supabase y crea un nuevo proyecto.
2. En tu proyecto, ve a la sección **SQL Editor**.
3. Deberás ejecutar las migraciones SQL que se encuentran en el proyecto para crear las tablas necesarias (por ejemplo, `migration_multi_tenant.sql`, `setup_illingworth_jornadas.sql` o los archivos dentro de la carpeta `supabase/migrations`).
4. Ve a **Project Settings -> API** en Supabase y obtén tu **Project URL** y tus **Project API Keys** (tanto la *anon/public* como la *service_role*). Las necesitarás para todos los componentes.

---

## 👁️ 2. Motor de Reconocimiento Facial (Python)

Esta aplicación de escritorio es la encargada de capturar los rostros y registrar las asistencias/intrusos en tiempo real.

### Paso a paso:
1. **Abre tu terminal** y navega a la carpeta del motor:
   ```bash
   cd motor_reconimiento_unificado
   ```

2. **Crear un entorno virtual** (Muy Recomendado):
   ```bash
   python -m venv .venv
   ```

3. **Activar el entorno virtual**:
   - En Windows (CMD o PowerShell):
     ```bash
     .venv\Scripts\activate
     ```
   - En Mac/Linux:
     ```bash
     source .venv/bin/activate
     ```

4. **Instalar las dependencias (requirements.txt)**:
   Asegúrate de que tu entorno virtual esté activo (deberías ver `(.venv)` en la terminal) y ejecuta:
   ```bash
   pip install -r requirements.txt
   ```
   *(Esto instalará OpenCV, NumPy, InsightFace y las demás librerías de IA. Puede tardar un par de minutos).*

5. **Configurar Variables de Entorno**:
   - Crea un archivo `.env` dentro de la carpeta `motor_reconimiento_unificado`.
   - Añade tus credenciales obtenidas de Supabase:
     ```env
     SUPABASE_URL=https://tu-proyecto.supabase.co
     SUPABASE_KEY=tu_clave_secreta_de_supabase
     ```

6. **Ejecutar el programa**:
   ```bash
   python main_gui.py
   ```
   *(Nota: La primera vez que se ejecute el programa, se descargarán automáticamente los modelos de IA necesarios para InsightFace).*

---

## 🌐 3. Panel de Administración Web (Next.js)

Este panel te permitirá visualizar los datos registrados por el motor.

### Paso a paso:
1. **Navegar a la carpeta**:
   Desde la raíz del proyecto, abre una nueva terminal y ejecuta:
   ```bash
   cd admin_web_unificado
   ```

2. **Instalar paquetes npm**:
   ```bash
   npm install
   ```

3. **Configurar Variables de Entorno**:
   - Crea un archivo `.env.local` en esta carpeta.
   - Añade tus credenciales de Supabase (usa la clave pública/anon):
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_publica_anon_de_supabase
     ```

4. **Ejecutar en modo desarrollo**:
   ```bash
   npm run dev
   ```

5. **Acceder a la web**: Abre tu navegador e ingresa a [http://localhost:3000](http://localhost:3000).

---

## 📱 4. Aplicación Móvil (React Native / Expo)

Para tener el control de SICA en el bolsillo.

### Paso a paso:
1. **Navegar a la carpeta**:
   Desde la raíz del proyecto, abre una nueva terminal y ejecuta:
   ```bash
   cd app_sica
   ```

2. **Instalar paquetes npm**:
   ```bash
   npm install
   ```

3. **Configurar Variables de Entorno**:
   - Crea un archivo `.env` en esta carpeta.
   - Añade tus credenciales de Supabase:
     ```env
     EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
     EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_clave_publica_anon_de_supabase
     ```

4. **Ejecutar en modo desarrollo con Expo Go**:
   ```bash
   npx expo start
   ```

5. **Probar la aplicación en tu celular**:
   - Descarga la aplicación gratuita **Expo Go** en tu dispositivo móvil desde la App Store o Google Play.
   - Escanea el código QR que aparece en la terminal (con la cámara nativa en iOS o desde la app Expo Go en Android) para correr la aplicación instantáneamente en tu teléfono.

---

## 🚀 Despliegue a Producción (Avanzado)
Si deseas exportar el proyecto a ejecutables finales o subir la web a la nube, asegúrate de revisar el archivo **`plan_despliegue.md`** incluido en la raíz de este repositorio, el cual detalla cómo usar Vercel para la web, EAS Build para los APKs y PyInstaller para compilar el motor de Windows.
