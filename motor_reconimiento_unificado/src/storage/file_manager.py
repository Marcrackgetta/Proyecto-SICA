# src/storage/file_manager.py
from __future__ import annotations

import logging
import pickle
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class FileManager:
    """
    Gestiona toda la persistencia local del motor SICA:
    - Directorio de dataset (fotos por estudiante).
    - Modelo serializado (embeddings + caché de hashes).
    - Captura y filtrado de fotogramas.

    Todas las operaciones son estáticas para que puedan usarse
    desde cualquier módulo sin instanciar la clase.

    Convención de nombres de carpeta en el dataset:
        CEDULA--NOMBRE_APELLIDO/
        Ej:  0912345678--Juan_Perez/

    Esta convención permite recuperar cédula y nombre fácilmente
    en el trainer y en la GUI sin depender de una base de datos local.
    """

    # ------------------------------------------------------------------
    # Gestión del dataset
    # ------------------------------------------------------------------

    @staticmethod
    def create_person_directory(base_dir: Path | str, folder_name: str) -> Path:
        """
        Crea la carpeta de un estudiante dentro del dataset.

        Args:
            base_dir:    Ruta raíz del dataset (DATASET_DIR en config).
            folder_name: Nombre de la carpeta en formato CEDULA--NOMBRE.
                         Los espacios se reemplazan por '_' automáticamente.

        Returns:
            Path de la carpeta creada (o ya existente).
        """
        base_dir = Path(base_dir)
        normalized = folder_name.strip().replace(" ", "_")
        target = base_dir / normalized

        if not target.exists():
            target.mkdir(parents=True, exist_ok=True)
            logger.info(f"[FileManager] Directorio creado: {target}")
        else:
            logger.info(
                f"[FileManager] Directorio ya existe: {target}. "
                "Se agregarán fotos al conjunto actual."
            )
        return target

    @staticmethod
    def get_dataset_directories(base_dir: Path | str) -> list[Path]:
        """
        Retorna la lista de carpetas de estudiantes dentro del dataset.
        Ignora archivos sueltos y el archivo .keep de git.
        Retorna lista vacía si el directorio no existe.
        """
        base_dir = Path(base_dir)
        if not base_dir.exists():
            logger.warning(f"[FileManager] Directorio de dataset no encontrado: {base_dir}")
            return []
        return [p for p in base_dir.iterdir() if p.is_dir()]

    @staticmethod
    def count_photos(person_dir: Path | str) -> int:
        """Cuenta las fotos válidas (jpg/png/jpeg) en la carpeta de un estudiante."""
        person_dir = Path(person_dir)
        return sum(
            1
            for f in person_dir.iterdir()
            if f.suffix.lower() in {".jpg", ".jpeg", ".png"}
        )

    # ------------------------------------------------------------------
    # Captura y filtrado de fotogramas
    # ------------------------------------------------------------------

    @staticmethod
    def is_blurry(frame: np.ndarray, threshold: float) -> bool:
        """
        Detecta si un fotograma está desenfocado usando la varianza del Laplaciano.

        Una varianza baja indica ausencia de bordes definidos (imagen borrosa).
        El umbral recomendado para fotos de registro es 70.0 (configurable en config.py).

        Returns:
            True si la imagen está borrosa y NO debe guardarse.
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        focus_measure = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        return focus_measure < threshold

    @staticmethod
    def save_frame(
        directory: Path | str,
        frame: np.ndarray,
        photo_index: int,
    ) -> bool:
        """
        Guarda un fotograma como imagen PNG en la carpeta del estudiante.

        El nombre de archivo incluye un sufijo UUID para evitar colisiones
        si se captura en sesiones distintas.

        Args:
            directory:   Carpeta de destino (carpeta del estudiante en el dataset).
            frame:       Frame BGR capturado por CameraStream.
            photo_index: Índice secuencial de la foto en la sesión actual.

        Returns:
            True si el archivo fue guardado correctamente.
        """
        directory = Path(directory)
        unique_suffix = uuid.uuid4().hex[:8]
        filename = f"face_{photo_index:03d}_{unique_suffix}.png"
        full_path = directory / filename

        success = cv2.imwrite(str(full_path), frame)
        if success:
            logger.info(f"[FileManager] Foto guardada: {full_path}")
        else:
            logger.error(f"[FileManager] Error al guardar: {full_path}")
        return success

    # ------------------------------------------------------------------
    # Persistencia del modelo (embeddings + caché de hashes)
    # ------------------------------------------------------------------

    @staticmethod
    def load_model(file_path: Path | str) -> dict[str, Any]:
        """
        Carga el modelo serializado desde disco.

        Estructura esperada del archivo:
            {
                "names":          list[str],         # Etiquetas (CEDULA--NOMBRE)
                "encodings":      list[np.ndarray],  # Embeddings promedio por persona
                "cache_imagenes": dict[str, dict],   # Caché SHA-256 por foto
            }

        Si el archivo no existe o está corrupto, retorna un diccionario
        base válido con listas vacías para evitar KeyError en la GUI.
        """
        file_path = Path(file_path)

        if not file_path.exists():
            logger.info(
                f"[FileManager] Modelo no encontrado en {file_path}. "
                "Se iniciará desde cero."
            )
            return {"names": [], "encodings": [], "cache_imagenes": {}}

        try:
            with open(file_path, "rb") as f:
                data = pickle.load(f)

            if not isinstance(data, dict):
                raise ValueError("El archivo no contiene un diccionario válido.")

            # Garantizar que todas las claves necesarias estén presentes
            data.setdefault("names", [])
            data.setdefault("encodings", [])
            data.setdefault("cache_imagenes", {})

            logger.info(
                f"[FileManager] Modelo cargado: "
                f"{len(data['names'])} personas, "
                f"{len(data['cache_imagenes'])} fotos en caché."
            )
            return data

        except EOFError:
            logger.info("[FileManager] Modelo vacío. Iniciando desde cero.")
            return {"names": [], "encodings": [], "cache_imagenes": {}}
        except Exception as e:
            if file_path.stat().st_size == 0:
                logger.info("[FileManager] Archivo de modelo vacío. Iniciando desde cero.")
            else:
                logger.info(
                    f"[FileManager] El modelo actual será reconstruido ({e}). "
                    "Iniciando desde cero."
                )
            return {"names": [], "encodings": [], "cache_imagenes": {}}

    @staticmethod
    def save_model(data: dict[str, Any], file_path: Path | str) -> bool:
        """
        Serializa y guarda el modelo en disco con pickle.

        Crea los directorios intermedios si no existen.
        Usa escritura atómica para evitar corromper el modelo si hay un corte.

        Returns:
            True si el guardado fue exitoso.
        """
        file_path = Path(file_path)
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = file_path.with_suffix(".tmp")
            
            with open(tmp_path, "wb") as f:
                pickle.dump(data, f)
                
            # Reemplazo atomico (seguro contra fallos electricos/interrupciones)
            tmp_path.replace(file_path)
            
            logger.info(
                f"[FileManager] Modelo guardado en {file_path} "
                f"({len(data.get('names', []))} personas)."
            )
            return True
        except Exception as e:
            logger.error(f"[FileManager] Error al guardar el modelo: {e}")
            if 'tmp_path' in locals() and tmp_path.exists():
                try:
                    tmp_path.unlink()
                except:
                    pass
            return False
