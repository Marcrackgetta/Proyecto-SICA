# src/vision/tracker.py
from __future__ import annotations

import numpy as np
import supervision as sv

from src.utils.config import TRACKER_BUFFER, TRACKER_MATCH_THRESH
from src.vision.frame_context import FrameContext


class FaceTracker:
    """
    Tracker temporal de rostros basado en ByteTrack (via supervision).

    Trabaja directamente sobre FrameContext y únicamente asigna
    un track_id persistente a cada DetectedFace detectada en el frame.

    Este track_id es la clave del sistema de caché del RecognitionEngine:
    permite evitar extracciones de embedding innecesarias cuando el mismo
    rostro ya fue identificado hace pocos segundos.
    """

    def __init__(self) -> None:
        self.tracker = sv.ByteTrack(
            track_activation_threshold=0.25,
            lost_track_buffer=TRACKER_BUFFER,
            minimum_matching_threshold=TRACKER_MATCH_THRESH,
            frame_rate=30,
        )

        # Registro de todos los IDs generados en la sesión (útil para estadísticas)
        self.generated_ids: set[int] = set()

    def update(self, context: FrameContext) -> FrameContext:
        """
        Procesa las detecciones del FrameContext y asigna track_ids
        mediante ByteTrack.
        """
        if not context.faces:
            # Informar al tracker de un frame vacío para actualizar su estado interno
            self.tracker.update_with_detections(sv.Detections.empty())
            return context

        xyxy = np.array(
            [
                [face.left, face.top, face.right, face.bottom]
                for face in context.faces
            ],
            dtype=np.float32,
        )

        # Se usa max(score, 0.5) para evitar que scores muy bajos descarten tracks válidos
        confidence = np.array(
            [max(face.score, 0.5) for face in context.faces],
            dtype=np.float32,
        )

        detections = sv.Detections(
            xyxy=xyxy,
            confidence=confidence,
            class_id=np.zeros(len(context.faces), dtype=np.int32),
        )

        tracked = self.tracker.update_with_detections(detections)

        if tracked.tracker_id is None or len(tracked) == 0:
            return context

        def compute_iou(box1, box2):
            xA = max(box1[0], box2[0])
            yA = max(box1[1], box2[1])
            xB = min(box1[2], box2[2])
            yB = min(box1[3], box2[3])
            interArea = max(0, xB - xA) * max(0, yB - yA)
            box1Area = (box1[2] - box1[0]) * (box1[3] - box1[1])
            box2Area = (box2[2] - box2[0]) * (box2[3] - box2[1])
            iou = interArea / float(box1Area + box2Area - interArea)
            return iou

        for t_xyxy, track_id in zip(tracked.xyxy, tracked.tracker_id):
            best_iou = 0.0
            best_face = None
            for face in context.faces:
                f_xyxy = [face.left, face.top, face.right, face.bottom]
                iou = compute_iou(t_xyxy, f_xyxy)
                if iou > best_iou:
                    best_iou = iou
                    best_face = face
            
            if best_face is not None and best_iou > 0.3:
                best_face.track_id = int(track_id)
                self.generated_ids.add(best_face.track_id)

        return context

    def get_total_ids(self) -> int:
        """Retorna el número total de identidades únicas rastreadas en la sesión."""
        return len(self.generated_ids)
