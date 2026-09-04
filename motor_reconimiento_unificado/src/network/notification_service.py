# src/network/notification_service.py
import logging

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Capa abstracta para el envío de notificaciones (Push, Email, SMS, etc.).

    Por instrucción de arquitectura (Opción A), actualmente NO se implementa
    envío push real (ej. FCM o Supabase Edge Functions). Esta clase actúa como
    un mock (log-only) para dejar la arquitectura preparada de cara al desarrollo
    futuro de la APK del representante.
    """

    def __init__(self) -> None:
        self.enabled = True
        logger.info("[Notificaciones] Servicio inicializado (Modo: Log-Only).")

    def notificar_estudiante_presente(self, cedula: str, nombre: str, curso: str) -> None:
        """Simula notificar al representante que el estudiante llegó."""
        if not self.enabled:
            return
        
        logger.info(
            f"[Notificaciones -> APK] INFO: El estudiante {nombre} ({cedula}) "
            f"ha registrado su ingreso a {curso}."
        )

    def notificar_estudiante_ausente(self, cedula: str, nombre: str, curso: str) -> None:
        """Simula notificar al representante de una inasistencia (falta consolidada)."""
        if not self.enabled:
            return
            
        logger.info(
            f"[Notificaciones -> APK] ALERTA: El estudiante {nombre} ({cedula}) "
            f"ha sido marcado como AUSENTE en {curso}."
        )

    def notificar_intruso(self, camera_id: str, ubicacion: str) -> None:
        """Simula notificar a seguridad sobre una persona no reconocida."""
        if not self.enabled:
            return
            
        logger.warning(
            f"[Notificaciones -> SEGURIDAD] PELIGRO: Intruso detectado en la "
            f"cámara {camera_id} ({ubicacion})."
        )
