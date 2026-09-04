# src/vision/factory.py
from typing import Any

from src.utils.config import INSIGHTFACE_REC_THRESH
from src.vision.recognition_engine import RecognitionEngine
from src.vision.tracker import FaceTracker
from src.vision.vision_engine import VisionEngine


def get_vision_engine() -> VisionEngine:
    """
    Instancia el motor principal de visión (único punto de acceso a InsightFace).

    IMPORTANTE: VisionEngine carga los modelos SCRFD y ArcFace (~300 MB).
    Solo debe existir UNA instancia en toda la aplicación. La misma instancia
    es compartida por RecognitionEngine y ModelTrainer para evitar duplicar
    el consumo de memoria.
    """
    return VisionEngine()


def get_face_tracker() -> FaceTracker:
    """Instancia el tracker de rostros (ByteTrack via supervision)."""
    return FaceTracker()


def get_recognition_engine(
    known_encodings: list[Any],
    known_names: list[str],
) -> RecognitionEngine:
    """
    Instancia el motor de reconocimiento por embeddings.

    Args:
        known_encodings: Lista de embeddings promedio por persona.
        known_names:     Lista de nombres/cédulas correspondientes.
    """
    return RecognitionEngine(
        known_encodings=known_encodings,
        known_names=known_names,
        threshold=INSIGHTFACE_REC_THRESH,
    )
