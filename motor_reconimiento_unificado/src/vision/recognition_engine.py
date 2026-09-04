# src/vision/recognition_engine.py
from __future__ import annotations

import time
from typing import Any

import numpy as np

from src.vision.frame_context import FrameContext
from src.vision.vision_engine import VisionEngine


class RecognitionEngine:
    """
    Motor de reconocimiento impulsado por caché asíncrona por track_id.

    Estrategia de rendimiento:
    - El FaceTracker asigna un track_id persistente a cada rostro en el frame.
    - Este motor mantiene un diccionario (track_cache) con la última identidad
      confirmada para cada (camera_id, track_id).
    - Si la entrada de caché es reciente (< TTL), se reutiliza la identidad
      sin invocar al modelo pesado (ArcFace).
    - Si el TTL expiró o es un rostro nuevo, se extrae el embedding y se
      compara contra el dataset conocido usando similitud del coseno.
    - Solo se realiza UNA extracción de embedding por frame como máximo,
      priorizando FPS sobre latencia de identificación.

    TTLs por estado:
    - RECOGNIZED: 3.0 s  → Más tolerante; el rostro ya fue identificado.
    - UNKNOWN:    1.5 s  → Más agresivo; buscamos identificar desconocidos pronto.
    """

    def __init__(
        self,
        known_encodings: list[np.ndarray],
        known_names: list[str],
        threshold: float,
    ) -> None:
        self.known_encodings = [
            np.asarray(e, dtype=np.float32) for e in known_encodings
        ]
        self.known_names = known_names
        self.threshold = threshold

        # Clave: f"{camera_id}_{track_id}" → Valor: {identity_uuid, confidence, last_validation}
        self.track_cache: dict[str, dict[str, Any]] = {}

        # Tamaño máximo de la caché antes de purgar entradas antiguas
        self.cache_ttl = 1000

    @staticmethod
    def cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Similitud del coseno entre dos vectores de embedding."""
        denom = np.linalg.norm(emb1) * np.linalg.norm(emb2)
        if denom == 0:
            return 0.0
        return float(np.dot(emb1, emb2) / denom)

    def process(
        self,
        frame: np.ndarray,
        context: FrameContext,
        vision_engine: VisionEngine,
        camera_id: str,
    ) -> FrameContext:
        """
        Procesa todas las DetectedFace del FrameContext, asignando identidades.

        Args:
            frame:         Frame numpy original (necesario para extract_embedding).
            context:       FrameContext ya procesado por el FaceTracker.
            vision_engine: Referencia al VisionEngine compartido (NO se crea otro).
            camera_id:     ID de la cámara que generó el frame (evita colisiones
                           de cache entre cámaras con track_ids similares).

        Returns:
            El mismo FrameContext con identidades y estados actualizados.
        """
        if not self.known_encodings:
            return context

        current_time = time.time()
        extraction_done_this_frame = False

        for face in context.faces:
            raw_track_id = getattr(face, "track_id", None)
            if raw_track_id is None:
                continue

            # Clave única por cámara + track para prevenir colisiones multi-cámara
            cache_key = f"{camera_id}_{int(raw_track_id)}"

            needs_extraction = False
            use_cache = False

            if cache_key in self.track_cache:
                cached = self.track_cache[cache_key]
                time_since_validation = current_time - cached.get("last_validation", 0)

                ttl = 3.0 if cached["identity_uuid"] != "unknown" else 1.5

                if time_since_validation > ttl:
                    needs_extraction = True
                else:
                    use_cache = True
            else:
                needs_extraction = True

            # Solo una extracción pesada por frame: si ya se hizo y hay caché antigua,
            # esperar al siguiente frame para revalidar ese rostro.
            if needs_extraction and extraction_done_this_frame and cache_key in self.track_cache:
                needs_extraction = False
                use_cache = True

            if use_cache and not needs_extraction:
                face.identity_uuid = self.track_cache[cache_key]["identity_uuid"]
                face.confidence = self.track_cache[cache_key]["confidence"]
                face.recognition_state = (
                    "RECOGNIZED" if face.identity_uuid != "unknown" else "UNKNOWN"
                )
                continue

            # --- Extracción y comparación ---
            vision_engine.extract_embedding(frame, face)
            extraction_done_this_frame = True

            if face.embedding is None:
                self.track_cache[cache_key] = {
                    "identity_uuid": "unknown",
                    "confidence": 0.0,
                    "last_validation": current_time,
                }
                face.identity_uuid = "unknown"
                face.confidence = 0.0
                face.recognition_state = "UNKNOWN"
                continue

            best_similarity = -1.0
            best_index = -1
            for i, known_embedding in enumerate(self.known_encodings):
                similarity = self.cosine_similarity(face.embedding, known_embedding)
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_index = i

            is_recognized = best_index >= 0 and best_similarity >= self.threshold

            face.identity_uuid = (
                self.known_names[best_index] if is_recognized else "unknown"
            )
            face.confidence = round(best_similarity * 100, 2)
            face.recognition_state = "RECOGNIZED" if is_recognized else "UNKNOWN"

            self.track_cache[cache_key] = {
                "identity_uuid": face.identity_uuid,
                "confidence": face.confidence,
                "last_validation": current_time,
            }

        # --- Purga de caché por tamaño ---
        if len(self.track_cache) > self.cache_ttl:
            purge_count = len(self.track_cache) - int(self.cache_ttl * 0.8)
            oldest_keys = list(self.track_cache.keys())[:purge_count]
            for key in oldest_keys:
                self.track_cache.pop(key, None)

        return context

    def reload_model(
        self,
        known_encodings: list[np.ndarray],
        known_names: list[str],
    ) -> None:
        """
        Recarga el dataset de embeddings en caliente (después de un entrenamiento).
        Limpia la caché para forzar re-identificación con el nuevo modelo.
        """
        self.known_encodings = [
            np.asarray(e, dtype=np.float32) for e in known_encodings
        ]
        self.known_names = known_names
        self.track_cache.clear()
