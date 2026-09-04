# src/training/trainer.py
from __future__ import annotations

import hashlib
import logging
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from src.storage.file_manager import FileManager
from src.utils.config import MODEL_PATH
from src.vision.vision_engine import VisionEngine

logger = logging.getLogger(__name__)


class ModelTrainer:
    """
    Genera y actualiza embeddings de estudiantes de forma incremental.

    Estrategia de caché SHA-256:
    -  Cada foto del dataset tiene asociada una firma (hash SHA-256 de sus bytes).
    -  Al iniciar el entrenamiento, se carga la caché del modelo anterior.
    -  Por cada foto:
        - Si su hash coincide con la caché → reutilizar el embedding almacenado.
        - Si es nueva o fue modificada   → extraer embedding con ArcFace y guardar.
        - Si ya no existe en disco       → no incluirla en la caché nueva (limpieza).
    -  El embedding final por persona es el PROMEDIO de todos sus embeddings válidos,
       lo que produce representaciones más robustas frente a variaciones de pose
       e iluminación.

    Reutilización de VisionEngine:
    -  El trainer recibe la instancia de VisionEngine ya cargada en main_gui.py.
    -  Esto evita cargar un segundo FaceAnalysis (~300 MB) solo para entrenar.
    -  Si no se pasa una instancia, se crea una propia (modo standalone).

    Formato del modelo guardado en disco:
        {
            "names":          list[str],         # Etiqueta por persona (CEDULA--NOMBRE)
            "encodings":      list[np.ndarray],  # Embedding promedio por persona
            "cache_imagenes": dict[str, dict],   # {"{persona}/{foto}": {hash, embedding}}
        }
    """

    VALID_EXTENSIONS = {".png", ".jpg", ".jpeg"}

    def __init__(self, vision_engine: VisionEngine | None = None) -> None:
        """
        Args:
            vision_engine: Instancia compartida de VisionEngine. Si es None,
                           se instancia una propia (útil para uso standalone).
        """
        if vision_engine is not None:
            self._engine = vision_engine
            self._owns_engine = False
            logger.info("[Trainer] Usando VisionEngine compartido.")
        else:
            logger.info(
                "[Trainer] No se recibió VisionEngine. "
                "Creando instancia propia (modo standalone)."
            )
            self._engine = VisionEngine()
            self._owns_engine = True

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def train_from_directory(
        self,
        directories: list[Path | str],
    ) -> dict[str, Any]:
        """
        Procesa el dataset de forma incremental y retorna el modelo actualizado.

        Solo extrae embeddings de fotos nuevas o modificadas.
        Las fotos eliminadas se excluyen automáticamente de la caché.

        Args:
            directories: Lista de rutas a carpetas de estudiantes
                         (obtenida con FileManager.get_dataset_directories).

        Returns:
            Diccionario con "names", "encodings" y "cache_imagenes",
            listo para pasarse a FileManager.save_model().
        """
        logger.info("[Trainer] Iniciando generación de embeddings incremental...")
        start_time = time.time()

        # 1. Cargar caché del modelo anterior (si existe)
        modelo_anterior = FileManager.load_model(Path(MODEL_PATH))
        cache_anterior = modelo_anterior.get("cache_imagenes", {})

        nueva_cache: dict[str, dict] = {}
        known_encodings: list[np.ndarray] = []
        known_names: list[str] = []

        fotos_reutilizadas = 0
        fotos_procesadas = 0
        fotos_sin_rostro = 0
        fotos_fallidas = 0

        # 2. Recorrer cada carpeta (un estudiante por carpeta)
        for person_dir in directories:
            person_dir = Path(person_dir)
            person_label = person_dir.name  # Ej: "0912345678--Juan_Perez"

            embeddings_del_estudiante: list[np.ndarray] = []

            imagenes = [
                f for f in person_dir.iterdir()
                if f.suffix.lower() in self.VALID_EXTENSIONS
            ]

            if not imagenes:
                logger.warning(
                    f"[Trainer] Carpeta vacía, se omite: {person_dir.name}"
                )
                continue

            for img_path in imagenes:
                cache_key = f"{person_label}/{img_path.name}"

                # A. Calcular hash de la foto actual
                file_hash = self._hash_file(img_path)
                if file_hash is None:
                    fotos_fallidas += 1
                    continue

                # B. ¿La foto ya fue procesada y no cambió?
                entrada_cache = cache_anterior.get(cache_key)
                if (
                    entrada_cache is not None
                    and entrada_cache.get("hash") == file_hash
                    and entrada_cache.get("embedding") is not None
                ):
                    # REUTILIZAR: embedding existente sin tocar el modelo
                    embeddings_del_estudiante.append(
                        np.asarray(entrada_cache["embedding"], dtype=np.float32)
                    )
                    nueva_cache[cache_key] = entrada_cache
                    fotos_reutilizadas += 1
                    continue

                # C. PROCESAR: foto nueva o modificada
                embedding = self._extract_embedding_from_file(img_path)
                if embedding is None:
                    fotos_sin_rostro += 1
                    continue

                embeddings_del_estudiante.append(embedding)
                nueva_cache[cache_key] = {
                    "hash": file_hash,
                    "embedding": embedding,
                }
                fotos_procesadas += 1

            # 3. Promediar embeddings del estudiante
            if embeddings_del_estudiante:
                avg_embedding = np.mean(embeddings_del_estudiante, axis=0)
                known_names.append(person_label)
                known_encodings.append(avg_embedding)
            else:
                logger.warning(
                    f"[Trainer] Sin embeddings válidos para: {person_label}. "
                    "Esta persona no quedará en el modelo."
                )

        elapsed = time.time() - start_time
        logger.info(
            f"[Trainer] Completado en {elapsed:.2f}s | "
            f"Reutilizadas: {fotos_reutilizadas} | "
            f"Procesadas: {fotos_procesadas} | "
            f"Sin rostro: {fotos_sin_rostro} | "
            f"Fallidas: {fotos_fallidas} | "
            f"Personas en modelo: {len(known_names)}"
        )

        return {
            "names": known_names,
            "encodings": known_encodings,
            "cache_imagenes": nueva_cache,
        }

    # ------------------------------------------------------------------
    # Métodos internos
    # ------------------------------------------------------------------

    def _hash_file(self, filepath: Path) -> str | None:
        """
        Genera la firma SHA-256 de los bytes de un archivo de imagen.
        Retorna None si el archivo no puede leerse.
        """
        hasher = hashlib.sha256()
        try:
            with open(filepath, "rb") as f:
                while chunk := f.read(8192):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"[Trainer] Error al calcular hash de {filepath.name}: {e}")
            return None

    def _extract_embedding_from_file(
        self, img_path: Path
    ) -> np.ndarray | None:
        """
        Carga una imagen, detecta el primer rostro y extrae su embedding ArcFace.

        Usa el VisionEngine compartido (o propio en modo standalone) para
        detectar y extraer en dos pasos: detect() → extract_embedding().

        Retorna None si no se detecta ningún rostro o si la extracción falla.
        """
        frame = cv2.imread(str(img_path))
        if frame is None:
            logger.warning(f"[Trainer] No se pudo leer la imagen: {img_path.name}")
            return None

        try:
            # Paso 1: Detección (SCRFD)
            context = self._engine.detect(frame)

            if not context.faces:
                logger.debug(
                    f"[Trainer] Sin rostro detectado en: {img_path.name}"
                )
                return None

            # Tomamos el rostro principal (el de mayor score)
            face = max(context.faces, key=lambda f: f.score)

            # Paso 2: Extracción de embedding (ArcFace)
            self._engine.extract_embedding(frame, face)

            if face.embedding is None:
                logger.debug(
                    f"[Trainer] Embedding nulo para: {img_path.name}"
                )
                return None

            return np.asarray(face.embedding, dtype=np.float32)

        except Exception as e:
            logger.error(
                f"[Trainer] Error durante el procesamiento de {img_path.name}: {e}"
            )
            return None
