import logging
from datetime import datetime
from src.network.supabase_client import SupabaseClient
from src.network.notification_service import NotificationService

logger = logging.getLogger(__name__)

class EventManager:
    def __init__(self, supabase_client: SupabaseClient, notification_service: NotificationService = None):
        self.db = supabase_client
        self.notif = notification_service if notification_service else NotificationService()
        self.processed_events = {}
        self.last_sync_time = 0

    def sync_data(self) -> None:
        """
        [DEPRECADO]
        Mantenido por compatibilidad con main_gui.py y _run_training_thread.
        La sincronización real ahora se maneja en tiempo real mediante PostgreSQL RPC (reportar_deteccion).
        """
        pass

    def _init_day_memory(self, date_str: str) -> None:
        if date_str not in self.processed_events:
            self.processed_events.clear()
            self.processed_events[date_str] = {}

    def register_recognition(self, identity_uuid: str, camera_id: str, track_id=None) -> None:
        now = datetime.now()
        date_str = now.strftime('%Y-%m-%d')
        
        if identity_uuid in ('unknown', 'Desconocido'):
            return
            
        cedula_memoria = identity_uuid.split('--')[0] if '--' in identity_uuid else identity_uuid
        
        self._init_day_memory(date_str)
        
        if camera_id not in self.processed_events[date_str]:
            self.processed_events[date_str][camera_id] = {}
            
        last_seen = self.processed_events[date_str][camera_id].get(cedula_memoria)
        
        if last_seen and (now - last_seen).total_seconds() < 60:
            return
            
        self.processed_events[date_str][camera_id][cedula_memoria] = now
        
        now_iso = now.astimezone().isoformat()
        
        # Enviar deteccion pura a Supabase
        logger.info(f'[EventManager] Reportando deteccion pura de {cedula_memoria} en {camera_id}')
        self.db.reportar_deteccion(cedula_memoria, camera_id, now_iso)

    def check_schedules(self) -> None:
        # Ya no evaluamos los horarios locales. La responsabilidad paso a PostgreSQL.
        pass