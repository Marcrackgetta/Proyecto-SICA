# src/network/supabase_client.py
import logging
import os
import time
from typing import Any

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Carga variables de entorno (SUPABASE_URL, SUPABASE_KEY)
load_dotenv()


class SupabaseClient:
    """
    Cliente REST puro para comunicarse con la API de Supabase.

    Responsabilidades:
    - Autenticación y gestión de headers.
    - Ejecución segura de requests HTTP con timeouts.
    - Operaciones CRUD básicas sobre las tablas.

    NO contiene lógica de negocio (ej. determinar si alguien es 'Falta'
    o 'Intruso'). Esa lógica pertenece al EventManager / Orquestador.
    """

    def __init__(self, timeout: float = 5.0) -> None:
        raw_url = os.getenv("SUPABASE_URL")
        self.api_key = os.getenv("SUPABASE_KEY")
        self.timeout = timeout
        self.is_connected = False

        if not raw_url or not self.api_key:
            logger.error("[Supabase] Faltan credenciales en el archivo .env")
            return

        self.base_url = f"{raw_url.rstrip('/')}/rest/v1"

        self.headers = {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        self.is_connected = True
        logger.info("[Supabase] Cliente REST inicializado correctamente.")

    def _get(self, endpoint: str) -> list[dict[str, Any]]:
        """Realiza una petición GET genérica con manejo de errores."""
        if not self.is_connected:
            return []

        url = f"{self.base_url}/{endpoint}"
        try:
            res = requests.get(url, headers=self.headers, timeout=self.timeout)
            res.raise_for_status()
            return res.json()
        except Exception as e:
            logger.error(f"[Supabase] Error en GET {endpoint}: {e}")
            return []

    def _post(self, endpoint: str, payload: dict | list, upsert: bool = False) -> bool:
        """Realiza una petición POST genérica (Insert / Upsert)."""
        if not self.is_connected:
            return False

        url = f"{self.base_url}/{endpoint}"
        headers = self.headers.copy()

        if upsert:
            headers["Prefer"] = "resolution=merge-duplicates,return=minimal"

        try:
            res = requests.post(
                url, headers=headers, json=payload, timeout=self.timeout
            )
            res.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"[Supabase] Error en POST {endpoint}: {e}")
            return False

    # ------------------------------------------------------------------
    # Operaciones Específicas
    # ------------------------------------------------------------------

    def set_camera_status(
        self, camera_id: str, is_active: bool, ubicacion: dict | None = None
    ) -> None:
        """Actualiza el estado (activa/inactiva) de una cámara."""
        payload = {"id": camera_id, "activa": is_active}
        if ubicacion:
            payload["ubicacion"] = ubicacion

        success = self._post("camaras?on_conflict=id", payload, upsert=True)
        if success:
            estado_str = "ENCENDIDA" if is_active else "APAGADA"
            logger.info(f"[Supabase] Cámara {camera_id} actualizada a: {estado_str}")

    def fetch_cursos(self) -> list[dict[str, Any]]:
        """Obtiene la lista de cursos registrados."""
        return self._get("cursos?select=id,camara_id")

    def fetch_estudiantes(self) -> list[dict[str, Any]]:
        """Obtiene la lista de estudiantes matriculados."""
        return self._get("estudiantes?select=cedula,curso_id,representante_uid")

    def fetch_asistencia_hoy(self, fecha: str) -> list[dict[str, Any]]:
        """Obtiene los registros de asistencia de un día específico."""
        return self._get(f"asistencia?fecha=eq.{fecha}&select=estudiante_cedula,estado,hora_clase")

    def registrar_asistencia_batch(self, registros: list[dict[str, Any]]) -> bool:
        """
        Inserta o actualiza un lote de registros de asistencia.
        Los registros ya deben tener su estado (Presente, Falta, etc.) calculado.
        """
        if not registros:
            return True

        # El parámetro on_conflict define las columnas que forman la clave única
        endpoint = "asistencia?on_conflict=estudiante_cedula,fecha,hora_clase,curso_id"
        return self._post(endpoint, registros, upsert=True)
