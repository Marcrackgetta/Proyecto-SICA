# src/network/supabase_client.py
import logging
import os
import time
import json
import sqlite3
import threading
from typing import Any

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Carga variables de entorno (SUPABASE_URL, SUPABASE_KEY)
load_dotenv()


class SupabaseClient:
    """
    Cliente REST puro para comunicarse con la API de Supabase con resiliencia offline.

    Responsabilidades:
    - Autenticacion y gestion de headers.
    - Ejecucion segura de requests HTTP con timeouts.
    - Gestion de cola offline (Store & Forward) para evitar perdida de eventos (BETA).
    - Operaciones CRUD basicas sobre las tablas.
    """

    def __init__(self, timeout: float = 15.0) -> None:
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
        
        # Inicializar cola offline
        self._init_queue()
        
        # Iniciar worker de sincronizacion en background
        self._sync_thread = threading.Thread(target=self._sync_worker, daemon=True)
        self._sync_thread.start()
        
        logger.info("[Supabase] Cliente REST inicializado correctamente con resiliencia Offline.")

    def _init_queue(self):
        """Inicializa la base de datos local SQLite para la cola offline."""
        try:
            self.db_conn = sqlite3.connect("offline_queue.db", check_same_thread=False)
            cursor = self.db_conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    endpoint TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    upsert BOOLEAN NOT NULL
                )
            ''')
            self.db_conn.commit()
        except Exception as e:
            logger.error(f"[Supabase] Error inicializando cola offline: {e}")

    def _push_to_queue(self, endpoint: str, payload: dict | list, upsert: bool):
        """Guarda un evento fallido en la base de datos local."""
        try:
            cursor = self.db_conn.cursor()
            cursor.execute(
                "INSERT INTO queue (endpoint, payload, upsert) VALUES (?, ?, ?)",
                (endpoint, json.dumps(payload), upsert)
            )
            self.db_conn.commit()
            logger.warning(f"[Supabase] Evento guardado en cola offline. Destino: {endpoint}")
        except Exception as e:
            logger.error(f"[Supabase] Error guardando en cola offline: {e}")

    def _sync_worker(self):
        """Hilo en background que reintenta enviar la cola offline cuando hay conexion."""
        while True:
            time.sleep(30)
            if not self.is_connected:
                # Intentar recuperar conexión
                try:
                    res = requests.get(self.base_url, timeout=3.0)
                    self.is_connected = True
                    logger.info("[Supabase] Conexión recuperada. Retomando sincronización.")
                except requests.exceptions.RequestException:
                    continue
                
            try:
                cursor = self.db_conn.cursor()
                cursor.execute("SELECT id, endpoint, payload, upsert FROM queue ORDER BY id ASC LIMIT 50")
                rows = cursor.fetchall()
                
                if not rows:
                    continue
                    
                logger.info(f"[Supabase] Intentando sincronizar {len(rows)} eventos desde cola offline...")
                
                for row_id, endpoint, payload_str, upsert in rows:
                    payload = json.loads(payload_str)
                    
                    # Intentamos enviar directamente sin volver a encolar si falla
                    url = f"{self.base_url}/{endpoint}"
                    headers = self.headers.copy()
                    if upsert:
                        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
                        
                    try:
                        res = requests.post(url, headers=headers, json=payload, timeout=self.timeout)
                        res.raise_for_status()
                        
                        # Si tiene exito, borramos de la cola
                        cursor.execute("DELETE FROM queue WHERE id = ?", (row_id,))
                        self.db_conn.commit()
                        logger.info(f"[Supabase] Sincronizacion exitosa desde cola para {endpoint}.")
                    except Exception as e:
                        logger.error(f"[Supabase] Sincronizacion fallida para ID {row_id}, se reintentara luego. Error: {e}")
                        break # Si uno falla por red, rompemos el ciclo y esperamos al proximo tick
                        
            except Exception as e:
                logger.error(f"[Supabase] Error en worker de sincronizacion: {e}")

    def _get(self, endpoint: str) -> list[dict[str, Any]]:
        """Realiza una peticion GET generica con manejo de errores."""
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

    def _post(self, endpoint: str, payload: dict | list, upsert: bool = False, ignore_duplicates: bool = False) -> bool:
        """Realiza una peticion POST generica (Insert / Upsert). Si falla por red, encola el evento."""
        url = f"{self.base_url}/{endpoint}"
        headers = self.headers.copy()

        if upsert:
            headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        elif ignore_duplicates:
            headers["Prefer"] = "resolution=ignore-duplicates,return=minimal"

        if not self.is_connected:
            logger.warning(f"[Supabase] Sin conexion. Guardando evento offline para {endpoint}...")
            self._push_to_queue(endpoint, payload, upsert)
            return False

        try:
            logger.info(f"[Supabase] Enviando datos a Supabase ({endpoint})...")
            res = requests.post(
                url, headers=headers, json=payload, timeout=self.timeout
            )
            res.raise_for_status()
            logger.info(f"[Supabase] Evento enviado correctamente a {endpoint}.")
            return True
        except requests.exceptions.HTTPError as e:
            # Si es un error 4xx (cliente, ej. FK violation), NO lo reintentamos offline porque siempre fallara.
            if 400 <= e.response.status_code < 500:
                logger.error(f"[Supabase] Error 4xx en POST {endpoint}: {e.response.text}")
                return False
            else:
                logger.error(f"[Supabase] Error 5xx en POST {endpoint}: {e}. Guardando offline...")
                self._push_to_queue(endpoint, payload, upsert)
                return False
        except requests.exceptions.RequestException as e:
            # Capturamos timeouts y problemas de red reales
            logger.warning(f"[Supabase] Problema de red: {type(e).__name__}. Guardando offline...")
            self.is_connected = False
            self._push_to_queue(endpoint, payload, upsert)
            return False
        except Exception as e:
            logger.error(f"[Supabase] Error desconocido en POST {endpoint}: {e}")
            return False

    # ------------------------------------------------------------------
    # Operaciones Especificas
    # ------------------------------------------------------------------

    def set_camera_status(
        self, camera_id: str, is_active: bool, ubicacion: dict | None = None
    ) -> None:
        """Actualiza el estado (activa/inactiva) de una camara."""
        payload = {"id": camera_id, "activa": is_active}
        if ubicacion:
            payload["ubicacion"] = ubicacion

        success = self._post("camaras?on_conflict=id", payload, upsert=True)
        if success:
            estado_str = "ENCENDIDA" if is_active else "APAGADA"
            logger.info(f"[Supabase] Camara {camera_id} actualizada a: {estado_str}")

    def fetch_cursos(self) -> list[dict[str, Any]]:
        """Obtiene la lista de cursos registrados."""
        return self._get("cursos?select=id,camara_id")

    def fetch_estudiantes(self) -> list[dict[str, Any]]:
        """Obtiene la lista de estudiantes matriculados."""
        return self._get("estudiantes?select=cedula,curso_id,representante_uid")

    def fetch_asistencia_hoy(self, fecha: str) -> list[dict[str, Any]]:
        """Obtiene los registros de asistencia de un dia especifico."""
        return self._get(f"asistencia?fecha=eq.{fecha}&select=estudiante_cedula,estado,hora_clase")

    def registrar_asistencia_batch(self, registros: list[dict[str, Any]]) -> bool:
        """
        Inserta o actualiza un lote de registros de asistencia.
        Los registros ya deben tener su estado (Presente, Falta, etc.) calculado.
        """
        if not registros:
            return True

        # Auto-sembrar estudiantes para evitar violaciones de llave foránea
        for r in registros:
            cedula = r.get("estudiante_cedula")
            nombre = r.pop("estudiante_nombre", None)
            curso = r.get("curso_id")
            
            # Si cedula es None o vacía (caso Intruso sin id), NO sembrar en estudiantes
            if cedula:
                nombre_real = nombre if nombre and nombre != cedula else f"Registrado Automáticamente ({cedula})"
                # Solo inserta si no existe, respetando el nombre manual si ya estaba
                self._post("estudiantes?on_conflict=cedula", [{"cedula": cedula, "nombre": nombre_real, "curso_id": curso}], ignore_duplicates=True)

        # El parametro on_conflict define las columnas que forman la clave unica
        endpoint = "asistencia?on_conflict=estudiante_cedula,fecha,hora_clase,curso_id"
        return self._post(endpoint, registros, upsert=True)
