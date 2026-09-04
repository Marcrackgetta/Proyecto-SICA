# src/capture/camera_stream.py
import logging
import os
import threading
import time

import cv2
import numpy as np

# Timeout corto para cámaras IP via FFMPEG (evita bloqueos largos al conectar)
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;2000"

logger = logging.getLogger(__name__)


class CameraStream:
    """
    Gestiona la conexión y extracción asíncrona de video sin bloquear la UI.

    Cada instancia corre un hilo daemon independiente que:
    - Conecta a la fuente (USB o IP).
    - Lee frames continuamente y sobreescribe self.latest_frame.
    - Reconecta automáticamente si se pierde la señal.

    La GUI accede siempre al frame más reciente mediante get_frame(),
    sin nunca bloquearse esperando al hilo de lectura.

    Selección de backend (Windows):
    - Cámaras USB: cv2.CAP_DSHOW (DirectShow) — más estable para múltiples
      cámaras USB simultáneas en Windows.
    - Cámaras IP:  cv2.CAP_FFMPEG — protocolo RTSP/HTTP.
    - Linux/Mac:   cv2.CAP_ANY — selección automática.
    """

    def __init__(
        self,
        source: str | int,
        camera_id: str = "CAM_DEFAULT",
        reconnect_delay: int = 2,
    ) -> None:
        self.camera_id = camera_id

        # Normalizar: si viene como string numérico, convertir a int
        if isinstance(source, str) and source.isdigit():
            source = int(source)

        self.source = source
        self.reconnect_delay = reconnect_delay
        self.cap: cv2.VideoCapture | None = None
        self.is_connected: bool = False
        self.last_reconnect_time: float = 0.0

        self.frame_lock = threading.Lock()
        self.latest_frame: np.ndarray | None = None
        self.frame_id: int = 0  # ID secuencial para detectar frames nuevos sin copiar
        self.running: bool = True

        # Selección de backend según plataforma y tipo de fuente
        if isinstance(self.source, int):
            # Cámara USB: DirectShow en Windows, automático en otros SO
            self.backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY
        else:
            # URL de cámara IP (RTSP, HTTP, etc.)
            self.backend = cv2.CAP_FFMPEG

        # Iniciar hilo de lectura en segundo plano
        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()

    def _update(self) -> None:
        """
        Bucle de lectura continua en hilo secundario.
        Gestiona la conexión inicial y las reconexiones automáticas.
        """
        while self.running:
            if self.is_connected and self.cap is not None:
                success, frame = self.cap.read()
                if success:
                    with self.frame_lock:
                        self.latest_frame = frame
                        self.frame_id += 1
                else:
                    logger.warning(
                        f"[{self.camera_id}] Señal interrumpida. "
                        f"Fuente: {self.source}. Intentando reconectar..."
                    )
                    self.is_connected = False
                    with self.frame_lock:
                        self.latest_frame = None
                    if self.cap:
                        self.cap.release()
                        self.cap = None
            else:
                current_time = time.time()
                if current_time - self.last_reconnect_time > self.reconnect_delay:
                    self.last_reconnect_time = current_time
                    logger.info(
                        f"[{self.camera_id}] Conectando a {self.source} "
                        f"(backend={self.backend})..."
                    )
                    self.cap = cv2.VideoCapture(self.source, self.backend)

                    if self.cap is not None and self.cap.isOpened():
                        self.is_connected = True
                        width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        logger.info(
                            f"[{self.camera_id}] Conexión exitosa. "
                            f"Resolución: {width}x{height}"
                        )
                    else:
                        if self.cap:
                            self.cap.release()
                            self.cap = None

                time.sleep(0.01)  # Evitar CPU al 100% durante espera de reconexión

    def get_frame(self) -> np.ndarray | None:
        """
        Retorna una copia del fotograma más reciente.
        Retorna None si la cámara no está conectada aún.
        """
        with self.frame_lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
            return None

    def get_frame_with_id(self) -> tuple[np.ndarray | None, int]:
        """
        Retorna el fotograma y su ID secuencial.
        El ID permite al orquestador detectar si llegó un frame nuevo
        desde la última llamada, sin necesidad de comparar arrays.
        """
        with self.frame_lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy(), self.frame_id
            return None, self.frame_id

    def release(self) -> None:
        """
        Cierra la cámara y detiene el hilo de lectura de manera segura.
        Llamar siempre al cerrar la aplicación.
        """
        self.running = False
        if self.thread is not None and self.thread.is_alive():
            self.thread.join(timeout=2.0)
        if self.cap is not None:
            self.cap.release()
        self.is_connected = False
        logger.info(f"[{self.camera_id}] Recursos liberados correctamente.")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
