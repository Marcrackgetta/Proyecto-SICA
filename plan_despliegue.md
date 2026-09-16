# Plan de Despliegue a Producción - SICA

## Orden de Ejecución Recomendado
1. **`admin_web_unificado` (Hosting)**: Es el más rápido y fácil de desplegar. Nos permitirá validar que Supabase responde correctamente a peticiones desde fuera de la red local.
2. **`app_sica` (APK Android)**: Requiere configuración intermedia (certificados y Firebase para notificaciones).
3. **`motor_reconocimiento_unificado` (.EXE)**: Es el más complejo debido a que el empaquetado de modelos de Inteligencia Artificial requiere reestructuración de rutas locales.

---

## FASE 1: `admin_web_unificado` (Web Dashboard)

### Plataforma Recomendada: Vercel
*   **Por qué:** Next.js fue creado por Vercel. El despliegue requiere **cero configuración**. El nivel gratuito (Hobby) es inmensamente generoso e ideal para paneles de administración internos. No requiere mantenimiento de servidores y soporta actualizaciones automáticas con cada "push" a GitHub.
*   **Alternativas descartadas:** GitHub Pages (no soporta bien rutas dinámicas ni Server Components de Next.js sin exportación estática). Firebase Hosting (requiere configuración manual de Cloud Functions para Next.js).

### Paso a paso
1. **Preparación:** Ejecutar un build local (`npm run build`) para auditar errores de sintaxis o de TypeScript ocultos.
2. **Configuración:** Subir el código a un repositorio privado en GitHub.
3. **Despliegue:** Conectar Vercel al repositorio de GitHub. 
4. **Variables de Entorno:** Ingresar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el panel de Vercel (nunca subir el `.env.local` a GitHub).
5. **Riesgos a prevenir:** Problemas de caché agresivo de Next.js (si los datos no se refrescan, configuraremos la revalidación).

---

## FASE 2: `app_sica` (Aplicación Móvil)

### Plataforma Recomendada: EAS Build (Expo Application Services)
*   **Por qué:** Es la herramienta oficial de Expo para compilar aplicaciones nativas en la nube sin necesidad de instalar Android Studio pesado en tu máquina.
*   **Formato:** Generaremos un archivo `.apk` nativo (para instalar por descarga directa) mediante el perfil "Preview" de EAS.

### Paso a paso
1. **Preparación de `app.json`:** 
   * Configurar `name`, `slug`, `version` y el importantísimo `android.package` (ej. `com.sica.app`).
   * Añadir los iconos (`icon.png`) y el diseño del splash screen.
2. **Configuración de Variables:** Configurar las variables de Supabase dentro del entorno de EAS o en un archivo `.env` soportado por Expo.
3. **Notificaciones Push (El gran cambio):** En Expo Go, las notificaciones funcionan con un servidor de prueba de Expo. Al generar una APK real, Google exige tu propia clave de **Firebase Cloud Messaging (FCM)**. Habrá que crear un proyecto gratuito en Firebase, descargar un `google-services.json` y agregarlo al `app.json`.
4. **Despliegue:** Ejecutar `eas build -p android --profile preview`.
5. **Riesgos a prevenir:** Olvidar configurar FCM (haría que las notificaciones fallen en producción).

---

## FASE 3: `motor_reconocimiento_unificado` (Ejecutable Windows)

### Plataforma Recomendada: PyInstaller (Modo Directorio) + Inno Setup
*   **Por qué PyInstaller:** Es el estándar robusto para congelar Python. 
*   **Por qué Modo Directorio y NO un solo `.exe`:** Los modelos de IA (InsightFace, ONNX) y OpenCV pesan cientos de megabytes. Si generamos un único `.exe` (OneFile), Windows tendrá que extraer ~500MB en la carpeta temporal `%TEMP%` *cada vez que abras el programa*, demorando 20-30 segundos en arrancar. Si lo empaquetamos en Modo Directorio y usamos Inno Setup para crear un instalador clásico (`Instalar_SICA.exe`), el motor arrancará en 2 segundos.

### Paso a paso
1. **Auditoría de Rutas (Vital):** Cuando Python corre como `.exe`, rutas relativas como `"cameras.json"` fallan. Hay que inyectar una función helper (`sys._MEIPASS`) en el código para que el `.exe` sepa dónde encontrar sus recursos empaquetados.
2. **Configuración Externa:** Los archivos `cameras.json`, `horarios.json` y `.env` **no deben quedar sellados** dentro del ejecutable. Deben quedar en la misma carpeta junto al `.exe` para que tú (como admin) puedas editarlos con un bloc de notas sin tener que recompilar el motor.
3. **Archivos ocultos:** Instruir a PyInstaller (`--add-data` y `--hidden-import`) para que no olvide empaquetar las librerías dinámicas de ONNX y las fuentes/imágenes de la interfaz gráfica (`main_gui.py`).
4. **Generación:** Ejecutar el script `pyinstaller` con un archivo `.spec` personalizado.
5. **Riesgos a prevenir:** Que el motor no encuentre la cámara web al empaquetarse, o que el antivirus de Windows Defender bloquee el `.exe` por no estar firmado digitalmente (te enseñaré cómo añadirle exclusiones o íconos).
