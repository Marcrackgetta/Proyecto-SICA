# src/vision/vision_engine.py
from __future__ import annotations

from typing import Any

import numpy as np
from insightface.app import FaceAnalysis

from src.utils.config import (
    INSIGHTFACE_DET_THRESH,
    INSIGHTFACE_INPUT_SIZE,
    INSIGHTFACE_MODEL_PACK,
)
from src.vision.face_data import DetectedFace
from src.vision.frame_context import FrameContext


class _FaceProxy:
    """
    Clase proxy estructurada requerida por la API interna del modelo de
    reconocimiento de InsightFace (ArcFace).

    InsightFace espera un objeto con .bbox, .kps, .embedding y .normed_embedding.
    """

    def __init__(self, bbox: np.ndarray, kps: Any) -> None:
        self.bbox: np.ndarray = bbox
        self.kps: Any = kps
        self.embedding: Any = None
        self.normed_embedding: Any = None


class VisionEngine:
    """
    Motor de visión que encapsula SCRFD (detección) y ArcFace (reconocimiento)
    de InsightFace.

    La detección y la extracción de características están ESTRICTAMENTE separadas:
    - detect()            → Ligero. Ejecuta SCRFD. Sin embeddings.
    - extract_embedding() → Pesado. Ejecuta ArcFace. Solo bajo demanda.

    Esta separación es clave para mantener FPS altos: el RecognitionEngine
    decide cuándo vale la pena extraer un embedding (usando caché por track_id).
    """

    def __init__(self) -> None:
        self.app = FaceAnalysis(
            name=INSIGHTFACE_MODEL_PACK,
            allowed_modules=["detection", "recognition"],
            providers=["CPUExecutionProvider"],
        )
        self.app.prepare(
            ctx_id=0,
            det_thresh=INSIGHTFACE_DET_THRESH,
            det_size=INSIGHTFACE_INPUT_SIZE,
        )

        # Acceso directo a los modelos individuales para poder invocarlos por separado
        self.det_model = self.app.models.get("detection")
        self.rec_model = self.app.models.get("recognition")

    def detect(self, frame: np.ndarray) -> FrameContext:
        """
        Ejecuta únicamente la detección espacial de rostros (SCRFD).
        No ejecuta el modelo pesado de embeddings.
        Retorna un FrameContext con la lista de DetectedFace sin identidad.
        """
        context = FrameContext(frame=frame)
        detected_faces: list[DetectedFace] = []

        if self.det_model is None:
            return context

        bboxes, kpss = self.det_model.detect(frame, max_num=0, metric="default")

        if bboxes is not None:
            for i in range(bboxes.shape[0]):
                bbox = bboxes[i, 0:4]
                score = bboxes[i, 4]
                kps = kpss[i] if kpss is not None else None

                left, top, right, bottom = (
                    max(0, int(bbox[0])),
                    max(0, int(bbox[1])),
                    max(0, int(bbox[2])),
                    max(0, int(bbox[3])),
                )

                face = DetectedFace(
                    bbox=(top, right, bottom, left),
                    embedding=None,
                    landmarks=kps,
                    score=float(score),
                )
                detected_faces.append(face)

        context.faces = detected_faces
        return context

    def extract_embedding(self, frame: np.ndarray, face: DetectedFace) -> None:
        """
        Calcula el embedding (ArcFace) de un rostro ya detectado.
        Modifica el objeto face en lugar de retornar un valor
        para mantener compatibilidad con el pipeline del RecognitionEngine.
        """
        if self.rec_model is None or face.landmarks is None:
            return

        top, right, bottom, left = face.bbox
        raw_bbox = np.array([left, top, right, bottom], dtype=np.float32)

        proxy = _FaceProxy(bbox=raw_bbox, kps=face.landmarks)
        self.rec_model.get(frame, proxy)

        # Preferir embedding sobre normed_embedding; el modelo puede retornar cualquiera
        face.embedding = getattr(
            proxy, "embedding", getattr(proxy, "normed_embedding", None)
        )
