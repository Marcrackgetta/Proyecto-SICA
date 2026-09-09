import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CAMERAS_FILE = BASE_DIR / "cameras.json"

DEFAULT_CAMERAS = [
    {
        "camera_id": "CAM_001",
        "nombre": "Camara Principal",
        "curso": "2_INFO_B",
        "src": 0,
        "ubicacion": {"latitude": -2.128589, "longitude": -79.931099}
    }
]

def load_cameras():
    if not os.path.exists(CAMERAS_FILE):
        save_cameras(DEFAULT_CAMERAS)
        return DEFAULT_CAMERAS
    try:
        with open(CAMERAS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading cameras.json: {e}")
        return DEFAULT_CAMERAS

def save_cameras(cameras_list):
    with open(CAMERAS_FILE, "w", encoding="utf-8") as f:
        json.dump(cameras_list, f, indent=4, ensure_ascii=False)
