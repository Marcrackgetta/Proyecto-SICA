import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno desde .env
load_dotenv()

# --- CREDENCIALES SUPABASE ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# --- RUTAS Y DIRECTORIOS BASE ---
# BASE_DIR apunta a la raíz del proyecto (2 niveles arriba de config.py)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Carpetas de almacenamiento local (Edge)
DATASET_DIR = str(BASE_DIR / "data" / "dataset")
MODEL_PATH = str(BASE_DIR / "data" / "models" / "encodings.pkl")

# --- CONFIGURACIÓN DE CÁMARAS Y CURSOS ---
from src.utils.cameras_config import load_cameras, save_cameras

# Ya no hardcodeamos CAMERA_SOURCES aquí, se lee desde cameras.json
# Para mantener compatibilidad si algún módulo lo importa directo al arranque:
CAMERA_SOURCES = load_cameras()

# --- HORARIOS DE CLASE (Local / Unificado) ---
# Define los períodos de consolidación del modelo híbrido.
# Se lee desde el archivo unificado horarios.json para compartirlo con la Web
import json
HORARIOS_FILE = BASE_DIR.parent / "admin_web_unificado" / "public" / "horarios.json"
with open(HORARIOS_FILE, "r", encoding="utf-8") as f:
    horarios_data = json.load(f)

# CONFIGURACIONES contiene BAS_MAT, BACH_MAT, VESP_BAS, VESP_BACH
HORARIOS_CONFIGURACIONES = horarios_data["CONFIGURACIONES"]

# Mapeo de curso_id -> tipo_horario (ej. "2_INFO_B" -> "BACH_MAT")
CURSOS_MAPPING = horarios_data["CURSOS_MAPPING"]

RECONNECT_DELAY_SECONDS = 2
MAX_PHOTOS_PER_PERSON = 30
BLUR_THRESHOLD = 70.0

# --- CONFIGURACIÓN INSIGHTFACE (SCRFD + ARCFACE) ---
INSIGHTFACE_MODEL_PACK = "buffalo_l"
INSIGHTFACE_DET_THRESH = 0.5
INSIGHTFACE_INPUT_SIZE = (320, 320)
INSIGHTFACE_EMBEDDING_SIZE = 512
INSIGHTFACE_REC_THRESH = 0.45

# --- CONFIGURACIÓN DEL TRACKER (BYTETRACK) ---
TRACKER_BUFFER = 30
TRACKER_MATCH_THRESH = 0.8
