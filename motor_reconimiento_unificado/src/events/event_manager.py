# src/events/event_manager.py
import logging
from datetime import datetime, timedelta
from typing import Any

from src.network.notification_service import NotificationService
from src.network.supabase_client import SupabaseClient
from src.utils.config import HORARIOS_CONFIGURACIONES, CURSOS_MAPPING

logger = logging.getLogger(__name__)



class EventManager:
    """
    Orquestador central del Modelo Híbrido de asistencia (Adaptado a múltiples horarios).
    """

    def __init__(
        self, supabase_client: SupabaseClient, notification_service: NotificationService
    ) -> None:
        self.db = supabase_client
        self.notif = notification_service

        # Caché de estructura
        self.cam_to_curso: dict[str, str] = {}
        self.curso_to_estudiantes: dict[str, list[dict[str, str]]] = {}
        self.todas_las_cedulas: set[str] = set()

        # Memoria de eventos: { "YYYY-MM-DD": { curso_id: { "Hora_1": { "0912345678": "Presente" } } } }
        self.processed_events: dict[str, dict[str, dict[str, dict[str, str]]]] = {}

        # Bloques consolidados: set("YYYY-MM-DD_curso_id_Hora_1")
        self.closed_blocks: set[str] = set()

        self.last_sync_time = 0.0
        self.engine_start_time = datetime.now()

    def sync_data(self) -> None:
        if not self.db.is_connected:
            return

        now = datetime.now().timestamp()
        if now - self.last_sync_time < 300:
            return

        # NUEVO: Sincronizar fuentes locales hacia Supabase para evitar eventos descartados
        try:
            from src.utils.config import CAMERA_SOURCES
            # Asegurar que las cámaras existan en Supabase ANTES de consultar
            for cam in CAMERA_SOURCES:
                c_id = cam.get("camera_id")
                c_curso = cam.get("curso")
                if c_id and c_curso:
                    # Upsert de la cámara (sin sobrescribir activa)
                    self.db._post("camaras?on_conflict=id", [{"id": c_id, "nombre": cam.get("nombre", f"Cámara {c_id}")}], upsert=True)
                    # Upsert del curso asociado
                    self.db._post("cursos?on_conflict=id", [{"id": c_curso, "camara_id": c_id}], upsert=True)
        except Exception as e:
            logger.error(f"[EventManager] Error sembrando datos de cámara: {e}")

        cursos = self.db.fetch_cursos()
        estudiantes = self.db.fetch_estudiantes()

        self.cam_to_curso.clear()
        self.curso_to_estudiantes.clear()
        self.todas_las_cedulas.clear()

        for c in cursos:
            if c.get("camara_id") and c.get("id"):
                self.cam_to_curso[c["camara_id"]] = c["id"]
                self.curso_to_estudiantes[c["id"]] = []

        for e in estudiantes:
            curso_id = e.get("curso_id")
            cedula = e.get("cedula")
            if curso_id and cedula:
                if curso_id in self.curso_to_estudiantes:
                    self.curso_to_estudiantes[curso_id].append(e)
                self.todas_las_cedulas.add(cedula)

        self.last_sync_time = now
        logger.info("[EventManager] Estructura sincronizada con Supabase.")

    def _get_curso_horario(self, curso_id: str) -> dict:
        """Obtiene la configuración de horario para un curso específico."""
        # Por defecto asigna BACH_MAT si no existe, o se puede lanzar un error
        tipo = CURSOS_MAPPING.get(curso_id, "BACH_MAT")
        return HORARIOS_CONFIGURACIONES.get(tipo, HORARIOS_CONFIGURACIONES["BACH_MAT"])

    def _get_current_block(self, time_obj: datetime, horario: dict) -> str | None:
        current_time_str = time_obj.strftime("%H:%M")
        for block_name, hours in horario.items():
            if hours["inicio"] <= current_time_str < hours["fin"]:
                return block_name
        return None

    def _get_past_blocks(self, time_obj: datetime, horario: dict) -> list[str]:
        current_time_str = time_obj.strftime("%H:%M")
        start_time_str = self.engine_start_time.strftime("%H:%M")
        is_startup_day = time_obj.date() == self.engine_start_time.date()
        
        past_blocks = []
        for block_name, hours in horario.items():
            if hours["fin"] <= current_time_str:
                # Si estamos en el día de arranque, ignorar bloques que ya habían terminado
                if is_startup_day and hours["fin"] <= start_time_str:
                    continue
                past_blocks.append(block_name)
        return past_blocks

    def _init_day_memory(self, date_str: str) -> None:
        if date_str not in self.processed_events:
            self.processed_events.clear()
            self.closed_blocks.clear()
            self.processed_events[date_str] = {}

        # Asegurar que cada curso tenga su espacio
        for curso_id in self.curso_to_estudiantes.keys():
            if curso_id not in self.processed_events[date_str]:
                self.processed_events[date_str][curso_id] = {}
                horario = self._get_curso_horario(curso_id)
                for block in horario.keys():
                    self.processed_events[date_str][curso_id][block] = {}

    def register_recognition(self, identity_uuid: str, camera_id: str) -> None:
        if identity_uuid in ("unknown", "Desconocido", "Calculando..."):
            return

        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")

        curso_id = self.cam_to_curso.get(camera_id)
        if not curso_id:
            return

        self._init_day_memory(date_str)
        horario = self._get_curso_horario(curso_id)

        current_block = self._get_current_block(now, horario)
        if not current_block:
            return

        cedula = identity_uuid.split("--")[0] if "--" in identity_uuid else identity_uuid
        nombre = identity_uuid.split("--")[1].replace("_", " ") if "--" in identity_uuid else identity_uuid

        block_memory = self.processed_events[date_str][curso_id].get(current_block, {})
        if cedula in block_memory:
            return

        estudiantes_curso = [e["cedula"] for e in self.curso_to_estudiantes.get(curso_id, [])]
        is_enrolled = cedula in estudiantes_curso

        estado = "Intruso"
        if is_enrolled:
            inicio_clase_str = horario[current_block]["inicio"]
            inicio_clase_dt = datetime.strptime(inicio_clase_str, "%H:%M").replace(
                year=now.year, month=now.month, day=now.day
            )
            tolerancia = inicio_clase_dt + timedelta(minutes=15)

            if now <= tolerancia:
                estado = "Presente"
            else:
                estado = "Atrasado"

        self.processed_events[date_str][curso_id].setdefault(current_block, {})[cedula] = estado
        self._dispatch_event(cedula, nombre, curso_id, date_str, current_block, estado, camera_id)

    def check_schedules(self) -> None:
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        self._init_day_memory(date_str)

        for curso_id in self.curso_to_estudiantes.keys():
            horario = self._get_curso_horario(curso_id)
            past_blocks = self._get_past_blocks(now, horario)

            for block in past_blocks:
                closure_key = f"{date_str}_{curso_id}_{block}"
                if closure_key in self.closed_blocks:
                    continue

                self._consolidate_block(date_str, curso_id, block, horario)
                self.closed_blocks.add(closure_key)
                logger.info(f"[EventManager] Bloque consolidado y cerrado: {closure_key}")

    def _consolidate_block(self, date_str: str, curso_id: str, block: str, horario: dict) -> None:
        block_memory = self.processed_events[date_str][curso_id].get(block, {})
        registros_batch = []
        estudiantes = self.curso_to_estudiantes.get(curso_id, [])

        for est in estudiantes:
            cedula = est["cedula"]
            if cedula in block_memory:
                continue

            estado = "Falta"
            for prev_block in horario.keys():
                if prev_block == block:
                    break
                
                prev_state = self.processed_events[date_str][curso_id].get(prev_block, {}).get(cedula)
                if prev_state in ("Presente", "Atrasado"):
                    estado = "Fugado"
                    break

            self.processed_events[date_str][curso_id].setdefault(block, {})[cedula] = estado
            
            now_iso = datetime.now().isoformat()
            registros_batch.append({
                "estudiante_cedula": cedula,
                "curso_id": curso_id,
                "fecha": date_str,
                "hora_clase": block,
                "estado": estado,
                "timestamp_deteccion": now_iso
            })
            
            nombre_tmp = f"Estudiante {cedula}" 
            if estado == "Falta":
                self.notif.notificar_estudiante_ausente(cedula, nombre_tmp, curso_id)

        if registros_batch:
            success = self.db.registrar_asistencia_batch(registros_batch)
            if not success:
                logger.error(f"[EventManager] Error al consolidar batch de {curso_id} - {block}.")

    def _dispatch_event(
        self,
        cedula: str,
        nombre: str,
        curso_id: str,
        fecha: str,
        hora_clase: str,
        estado: str,
        camera_id: str,
    ) -> None:
        now_iso = datetime.now().isoformat()
        registro = [{
            "estudiante_cedula": cedula,
            "curso_id": curso_id,
            "fecha": fecha,
            "hora_clase": hora_clase,
            "estado": estado,
            "timestamp_deteccion": now_iso
        }]

        success = self.db.registrar_asistencia_batch(registro)
        if not success:
            logger.error(f"[EventManager] Falló envío en RT para {cedula} ({estado}).")

        if estado in ("Presente", "Atrasado"):
            self.notif.notificar_estudiante_presente(cedula, nombre, curso_id)
        elif estado == "Intruso":
            self.notif.notificar_intruso(camera_id, f"Curso {curso_id}")
