import logging
import os
import platform
import sys
import threading
import time
import queue
import tkinter as tk
import customtkinter as ctk
from pathlib import Path
from tkinter import messagebox

import cv2
import numpy as np
from PIL import Image, ImageTk, ImageDraw, ImageFont

if platform.system() == "Windows":
    import winsound

from src.capture.camera_stream import CameraStream
from src.events.event_manager import EventManager
from src.network.notification_service import NotificationService
from src.network.supabase_client import SupabaseClient
from src.storage.file_manager import FileManager
from src.training.trainer import ModelTrainer
from src.utils.cameras_config import load_cameras, save_cameras
from src.utils.config import (
    BLUR_THRESHOLD,
    DATASET_DIR,
    INSIGHTFACE_REC_THRESH,
    MAX_PHOTOS_PER_PERSON,
    MODEL_PATH,
    RECONNECT_DELAY_SECONDS,
)
from src.vision.factory import (
    get_face_tracker,
    get_recognition_engine,
    get_vision_engine,
)

logger = logging.getLogger(__name__)

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# =========================================================================
# FORMULARIO DE REGISTRO DE ESTUDIANTE (MODAL)
# =========================================================================
class DialogoRegistro(ctk.CTkToplevel):
    def __init__(self, parent, cursos):
        super().__init__(parent)
        self.title("Registro de Estudiante")
        self.geometry("380x320")
        self.resizable(False, False)
        self.resultado = None

        self.transient(parent)
        self.grab_set()

        ctk.CTkLabel(self, text="Cédula (10 dígitos):", font=("Helvetica", 12, "bold")).pack(pady=(10, 2))
        self.cedula_entry = ctk.CTkEntry(self, width=250)
        self.cedula_entry.pack()

        ctk.CTkLabel(self, text="Apellidos y Nombres:", font=("Helvetica", 12, "bold")).pack(pady=(10, 2))
        self.nombre_entry = ctk.CTkEntry(self, width=250)
        self.nombre_entry.pack()
        
        ctk.CTkLabel(self, text="Curso:", font=("Helvetica", 12, "bold")).pack(pady=(10, 2))
        self.curso_combo = ctk.CTkComboBox(self, values=cursos, width=250)
        if cursos:
            self.curso_combo.set(cursos[0])
        self.curso_combo.pack()

        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.pack(pady=20)

        ctk.CTkButton(btn_frame, text="Cancelar", width=100, command=self.destroy, fg_color="#E74C3C", hover_color="#C0392B").pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="Aceptar", width=100, command=self.guardar, fg_color="#28B463", hover_color="#239B56").pack(side="left", padx=10)

    def guardar(self):
        cedula = self.cedula_entry.get().strip()
        nombre = self.nombre_entry.get().strip().upper()
        curso = self.curso_combo.get()

        if len(cedula) == 10 and cedula.isdigit() and nombre and curso:
            self.resultado = (cedula, nombre, curso)
            self.destroy()
        else:
            messagebox.showwarning("Error", "Ingrese cédula de 10 dígitos, nombre y seleccione curso.")

# =========================================================================
# FORMULARIO DE CONFIGURACION DE CAMARAS (P1.2)
# =========================================================================
class DialogoConfigCamaras(ctk.CTkToplevel):
    def __init__(self, parent, reload_callback):
        super().__init__(parent)
        self.title("Gestión de Cámaras")
        self.geometry("600x400")
        self.reload_callback = reload_callback
        
        self.transient(parent)
        self.grab_set()
        
        self.cameras = load_cameras()
        
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)
        
        # Lista
        self.scroll_frame = ctk.CTkScrollableFrame(self)
        self.scroll_frame.grid(row=0, column=0, columnspan=2, sticky="nsew", padx=10, pady=10)
        
        self.render_list()
        
        # Formulario
        form_frame = ctk.CTkFrame(self)
        form_frame.grid(row=1, column=0, columnspan=2, sticky="ew", padx=10, pady=10)
        
        self.id_entry = ctk.CTkEntry(form_frame, placeholder_text="ID (Ej: CAM_002)", width=120)
        self.id_entry.grid(row=0, column=0, padx=5, pady=5)
        self.nombre_entry = ctk.CTkEntry(form_frame, placeholder_text="Nombre", width=120)
        self.nombre_entry.grid(row=0, column=1, padx=5, pady=5)
        self.src_entry = ctk.CTkEntry(form_frame, placeholder_text="Source (0 o rtsp://...)", width=150)
        self.src_entry.grid(row=0, column=2, padx=5, pady=5)
        self.curso_entry = ctk.CTkEntry(form_frame, placeholder_text="Curso", width=100)
        self.curso_entry.grid(row=0, column=3, padx=5, pady=5)
        
        ctk.CTkButton(form_frame, text="Agregar", command=self.add_camera).grid(row=1, column=0, columnspan=4, pady=5)
        
    def render_list(self):
        for widget in self.scroll_frame.winfo_children():
            widget.destroy()
        
        for i, cam in enumerate(self.cameras):
            frame = ctk.CTkFrame(self.scroll_frame)
            frame.pack(fill="x", pady=2)
            lbl = ctk.CTkLabel(frame, text=f"{cam['camera_id']} | {cam['nombre']} | {cam['src']} | {cam['curso']}")
            lbl.pack(side="left", padx=10)
            btn = ctk.CTkButton(frame, text="Eliminar", width=60, fg_color="red", command=lambda idx=i: self.delete_camera(idx))
            btn.pack(side="right", padx=10)
            
    def delete_camera(self, idx):
        self.cameras.pop(idx)
        save_cameras(self.cameras)
        self.render_list()
        self.reload_callback()
        
    def add_camera(self):
        cam_id = self.id_entry.get()
        nombre = self.nombre_entry.get()
        src_str = self.src_entry.get()
        curso = self.curso_entry.get()
        
        if cam_id and nombre and src_str:
            src = int(src_str) if src_str.isdigit() else src_str
            self.cameras.append({
                "camera_id": cam_id,
                "nombre": nombre,
                "src": src,
                "curso": curso,
                "ubicacion": {"latitude": 0, "longitude": 0}
            })
            save_cameras(self.cameras)
            self.render_list()
            self.reload_callback()
            
            self.id_entry.delete(0, 'end')
            self.nombre_entry.delete(0, 'end')
            self.src_entry.delete(0, 'end')
            self.curso_entry.delete(0, 'end')
# =========================================================================
# APLICACIÓN PRINCIPAL DE GUI
# =========================================================================
class FaceRecognitionGUI(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Motor de Reconocimiento Facial Edge SICA (Unificado)")
        self.geometry("1300x720")
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        self.running = True
        self.mode = "RECOGNIZE"
        self.identity_label = ""
        self.person_dir = ""
        self.captured_photos = 0
        self.cooldown_time = 0.0

        self.active_camera_idx = 0
        self.streams: list[CameraStream] = []

        # Para compatibilidad con entrenamiento
        self.frame_counter = 0
        self.last_faces_per_cam = {}
        self.last_reg_faces = []

        # P3.9 Queues para IA Asíncrona
        self.ai_queue = queue.Queue(maxsize=1)
        self.ai_results = {}
        self.event_sidebar_items = []

        # Zoom y Pan
        self.zoom_factor = 1.0
        self.pan_x = 0.0
        self.pan_y = 0.0
        self.drag_start_x = 0
        self.drag_start_y = 0

        self.grid_columnconfigure(0, weight=6)
        self.grid_columnconfigure(1, weight=2)
        self.grid_rowconfigure(0, weight=1)

        self.ui_queue = queue.Queue()
        self.after_ids = []
        self.reported_ui_tracks = {}  # t_id -> identity_uuid (Evita duplicar y permite actualizar)

        self.setup_ui()
        self.init_backend()
        
        # Iniciar Worker IA
        self.ai_thread = threading.Thread(target=self.ai_worker_loop, daemon=True)
        self.ai_thread.start()

        self._safe_after(30, self.update_frame)
        self._safe_after(10000, self.schedule_periodic_tasks)
        self._safe_after(100, self.process_ui_queue)

    def _safe_after(self, ms, func, *args):
        if self.running:
            aid = self.after(ms, func, *args)
            self.after_ids.append(aid)

    def setup_ui(self):
        # 1. Área de Video (Foco Principal)
        self.video_frame = ctk.CTkFrame(self, fg_color="black")
        self.video_frame.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)
        self.video_label = tk.Label(self.video_frame, bg="black")
        self.video_label.pack(expand=True, fill="both")

        self.video_label.bind("<MouseWheel>", self.on_mouse_wheel)
        self.video_label.bind("<ButtonPress-1>", self.on_mouse_press)
        self.video_label.bind("<B1-Motion>", self.on_mouse_drag)

        # Panel Derecho (Controles y Eventos compactados)
        self.right_panel = ctk.CTkFrame(self)
        self.right_panel.grid(row=0, column=1, sticky="nsew", padx=5, pady=5)
        self.right_panel.grid_rowconfigure(1, weight=1)
        self.right_panel.grid_columnconfigure(0, weight=1)

        # 2. Panel de Control Lateral (Compacto)
        self.control_frame = ctk.CTkFrame(self.right_panel, fg_color="transparent")
        self.control_frame.grid(row=0, column=0, sticky="nsew", pady=5)

        ctk.CTkLabel(self.control_frame, text="Panel de Control", font=("Helvetica", 16, "bold")).pack(pady=5)
        self.lbl_status = ctk.CTkLabel(self.control_frame, text="Estado: Activo", text_color="#2ECC71", font=("Helvetica", 12))
        self.lbl_status.pack(pady=5)

        self.cam_combo = ctk.CTkComboBox(self.control_frame, values=[], command=self.on_camera_select)
        self.cam_combo.pack(fill="x", pady=5, padx=10)

        # Botones Principales
        ctk.CTkButton(self.control_frame, text="Configurar Cámaras", command=self.open_camera_config, fg_color="#9B59B6", hover_color="#8E44AD").pack(fill="x", pady=5, padx=10)
        self.btn_register = ctk.CTkButton(self.control_frame, text="Registrar Alumno", command=self.start_registration, fg_color="#3498DB", hover_color="#2980B9")
        self.btn_register.pack(fill="x", pady=5, padx=10)
        self.btn_train = ctk.CTkButton(self.control_frame, text="Actualizar IA", command=self.start_training, fg_color="#F39C12", hover_color="#D68910")
        self.btn_train.pack(fill="x", pady=5, padx=10)
        
        # 3. Sidebar de Eventos (Abajo, toma el resto del espacio)
        self.sidebar_frame = ctk.CTkScrollableFrame(self.right_panel, label_text="Últimos Eventos", label_font=("Helvetica", 13, "bold"))
        self.sidebar_frame.grid(row=1, column=0, sticky="nsew", padx=5, pady=5)

    def init_backend(self):
        logger.info("[GUI] Cargando modelo local y motores de visión...")
        model = FileManager.load_model(Path(MODEL_PATH))
        known_encodings = model.get("encodings", [])
        known_names = model.get("names", [])

        self.vision_engine = get_vision_engine()
        self.tracker = get_face_tracker()
        self.recognition_engine = get_recognition_engine(
            known_encodings=known_encodings,
            known_names=known_names,
        )

        self.api_client = SupabaseClient()
        self.notification_service = NotificationService()
        self.event_manager = EventManager(
            supabase_client=self.api_client,
            notification_service=self.notification_service,
        )

        threading.Thread(target=self.event_manager.sync_data, daemon=True).start()
        self.load_cameras_to_streams()
    def load_cameras_to_streams(self):
        logger.info("[GUI] Iniciando flujos de cámaras...")
        for s in self.streams:
            s.release()
        self.streams = []
        
        cams = load_cameras()
        combo_vals = []
        for cam in cams:
            cam_id = cam.get("camera_id", "CAM_DEFAULT")
            cam_nombre = cam.get("nombre", f"Cámara {cam_id}")
            cam_ubicacion = cam.get("ubicacion", {"latitude": 0, "longitude": 0})
            
            stream = CameraStream(source=cam["src"], camera_id=cam_id, reconnect_delay=RECONNECT_DELAY_SECONDS)
            # CameraStream auto-starts on init
            self.streams.append(stream)
            combo_vals.append(f"{cam_nombre} [{cam.get('curso', '')}]")
            
        self.cam_combo.configure(values=combo_vals)
        if combo_vals:
            self.cam_combo.set(combo_vals[0])
            self.active_camera_idx = 0

    def open_camera_config(self):
        DialogoConfigCamaras(self, self.load_cameras_to_streams)

    def schedule_periodic_tasks(self):
        if not self.running:
            return
        try:
            self.event_manager.check_schedules()
            self.event_manager.sync_data()
            
            cams_config = load_cameras()
            config_map = {c["camera_id"]: c for c in cams_config}
            for s in self.streams:
                cfg = config_map.get(s.camera_id, {})
                ubicacion = cfg.get("ubicacion", {"latitude": 0, "longitude": 0})
                self.api_client.set_camera_status(s.camera_id, getattr(s, "is_connected", False), ubicacion=ubicacion)
        except Exception as e:
            logger.error(f"[GUI] Error en tareas periódicas: {e}")
        self._safe_after(60000, self.schedule_periodic_tasks)

    # ------------------------------------------------------------------
    # P3.9 Hilo Productor-Consumidor para Inteligencia Artificial
    # ------------------------------------------------------------------
    def ai_worker_loop(self):
        """Consume frames pesados en background para no congelar UI."""
        while self.running:
            try:
                frame, camera_id = self.ai_queue.get(timeout=0.5)
                # Deteccion
                context = self.vision_engine.detect(frame)
                context = self.tracker.update(context)
                context = self.recognition_engine.process(frame, context, self.vision_engine, camera_id)
                
                # Consolidar eventos
                for face in context.faces:
                    raw = getattr(face, "identity_uuid", None)
                    t_id = getattr(face, "track_id", None)
                    if raw is not None:
                        self.event_manager.register_recognition(raw, camera_id, track_id=t_id)
                
                # Actualizar Sidebar si hubo deteccion valida
                for face in context.faces:
                    raw = getattr(face, "identity_uuid", "unknown")
                    t_id = getattr(face, "track_id", None)
                    
                    if not hasattr(self, 'reported_ui_tracks'):
                        self.reported_ui_tracks = {}
                        
                    if t_id is not None:
                        # Si es nuevo, o si la identidad cambió (ej. pasó de Analizando a Reconocido)
                        if t_id not in self.reported_ui_tracks or self.reported_ui_tracks[t_id] != raw:
                            self.reported_ui_tracks[t_id] = raw
                            self.ui_queue.put((face, frame.copy()))
                    else:
                        if "--" in raw or raw == "unknown" or raw == "Analizando...":
                            self.ui_queue.put((face, frame.copy()))

                if len(self.reported_ui_tracks) > 500:
                    self.reported_ui_tracks.clear()
                
                # Guardar resultado para render visual
                self.ai_results[camera_id] = context.faces
            except queue.Empty:
                pass
            except Exception as e:
                logger.error(f"Error AI Worker: {e}")

    def process_ui_queue(self):
        if not self.running:
            return
        try:
            while True:
                face, frame = self.ui_queue.get_nowait()
                self.add_to_sidebar(face, frame)
        except queue.Empty:
            pass
        self._safe_after(100, self.process_ui_queue)

    def add_to_sidebar(self, face, frame):
        raw = getattr(face, "identity_uuid", "unknown")
        t_id = getattr(face, "track_id", None)
        
        if not hasattr(self, 'sidebar_cards_by_track'):
            self.sidebar_cards_by_track = {}
            
        if raw == "Analizando...":
            nombre = "Analizando..."
            color = "#F1C40F"
            estado = "Procesando"
        elif "--" in raw:
            _, nombre = raw.split("--", 1)
            color = "#2ECC71"
            estado = "Detectado"
        else:
            nombre = "Desconocido"
            color = "#E74C3C"
            estado = "Intruso"
            
        # Extracción miniatura
        top, right, bottom, left = face.bbox
        face_crop = frame[max(0, int(top)):int(bottom), max(0, int(left)):int(right)]
        pil_img = None
        if face_crop.size > 0:
            face_img = cv2.resize(face_crop, (50, 50))
            face_img = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(face_img)

        # Si ya existe una card para este track, ACTUALIZARLA
        if t_id is not None and t_id in self.sidebar_cards_by_track:
            card_dict = self.sidebar_cards_by_track[t_id]
            # Si el widget fue destruido por el limite de 15, lo ignoramos y dejamos que se cree nuevo o no
            if card_dict["card"].winfo_exists():
                card_dict["card"].configure(border_color=color)
                if pil_img and card_dict["lbl_img"] and card_dict["lbl_img"].winfo_exists():
                    ctk_img = ctk.CTkImage(light_image=pil_img, size=(50,50))
                    card_dict["lbl_img"].configure(image=ctk_img)
                if card_dict["lbl_nombre"].winfo_exists():
                    card_dict["lbl_nombre"].configure(text=nombre)
                if card_dict["lbl_estado"].winfo_exists():
                    card_dict["lbl_estado"].configure(text=f"{estado} | {time.strftime('%H:%M:%S')}", text_color=color)
                return

        # Limite de items visuales en el sidebar
        if len(self.event_sidebar_items) > 15:
            oldest = self.event_sidebar_items.pop(0)
            if oldest.winfo_exists():
                oldest.destroy()
            
        card = ctk.CTkFrame(self.sidebar_frame, border_color=color, border_width=2)
        card.pack(fill="x", pady=5)
        
        lbl_img = None
        if pil_img:
            ctk_img = ctk.CTkImage(light_image=pil_img, size=(50,50))
            lbl_img = ctk.CTkLabel(card, image=ctk_img, text="")
            lbl_img.pack(side="left", padx=5, pady=5)
            
        info = ctk.CTkFrame(card, fg_color="transparent")
        info.pack(side="left", padx=5, fill="both", expand=True)
        lbl_nombre = ctk.CTkLabel(info, text=nombre, font=("Helvetica", 12, "bold"))
        lbl_nombre.pack(anchor="w")
        lbl_estado = ctk.CTkLabel(info, text=f"{estado} | {time.strftime('%H:%M:%S')}", font=("Helvetica", 10), text_color=color)
        lbl_estado.pack(anchor="w")
        
        self.event_sidebar_items.append(card)
        if t_id is not None:
            self.sidebar_cards_by_track[t_id] = {
                "card": card,
                "lbl_img": lbl_img,
                "lbl_nombre": lbl_nombre,
                "lbl_estado": lbl_estado
            }

    # ------------------------------------------------------------------
    # Interacción Mouse
    # ------------------------------------------------------------------
    def on_mouse_wheel(self, event):
        if event.delta > 0:
            self.zoom_factor = min(4.0, self.zoom_factor + 0.1)
        elif event.delta < 0:
            self.zoom_factor = max(1.0, self.zoom_factor - 0.1)

    def on_mouse_press(self, event):
        self.drag_start_x = event.x
        self.drag_start_y = event.y

    def on_mouse_drag(self, event):
        if self.zoom_factor <= 1.0:
            return
        dx = event.x - self.drag_start_x
        dy = event.y - self.drag_start_y
        pan_speed = 0.003 / self.zoom_factor
        self.pan_x = max(-1.0, min(1.0, self.pan_x - (dx * pan_speed)))
        self.pan_y = max(-1.0, min(1.0, self.pan_y - (dy * pan_speed)))
        self.drag_start_x = event.x
        self.drag_start_y = event.y

    def on_camera_select(self, choice):
        vals = self.cam_combo.cget("values")
        self.active_camera_idx = vals.index(choice) if choice in vals else 0
    # ------------------------------------------------------------------
    # P1.3 Pantalla "No Signal" Elegante
    # ------------------------------------------------------------------
    def create_no_signal_image(self, width, height):
        if width < 10 or height < 10:
            width, height = 640, 480
        img = Image.new('RGB', (width, height), color=(20, 20, 20))
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("arial.ttf", 36)
        except:
            font = ImageFont.load_default()
        msg = "CONEXION PERDIDA\nReconectando..."
        draw.text((width // 2 - 150, height // 2 - 40), msg, fill=(231, 76, 60), font=font)
        return img

    # ------------------------------------------------------------------
    # P3.8 Renderizado Visual PIL
    # ------------------------------------------------------------------
    def draw_overlay_pil(self, frame, faces):
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img_pil = Image.fromarray(img_rgb)
        draw = ImageDraw.Draw(img_pil, 'RGBA')
        try:
            font = ImageFont.truetype("arialbd.ttf", 22)
        except:
            font = ImageFont.load_default()

        for face in faces:
            top, right, bottom, left = face.bbox
            identity_raw = getattr(face, "identity_uuid", "Calculando...")
            
            color = (255, 255, 255, 255)
            if "--" in identity_raw:
                _, nombre = identity_raw.split("--", 1)
                text = f"{nombre}"
                color = (46, 204, 113, 255) # Verde
            elif identity_raw == "unknown":
                text = "Desconocido"
                color = (231, 76, 60, 255) # Rojo
            else:
                text = "Analizando..."
                color = (241, 196, 15, 255) # Amarillo

            # Bounding Box (Rectangulo exterior)
            draw.rectangle([(left, top), (right, bottom)], outline=color, width=3)
            
            # Fondo semitransparente para texto
            text_bbox = draw.textbbox((left, top - 30), text, font=font)
            draw.rectangle([left, top - 32, text_bbox[2]+6, top], fill=(0,0,0,160))
            draw.text((left + 3, top - 28), text, fill=color, font=font)
            
        return img_pil

    # ------------------------------------------------------------------
    # Bucle de Video Principal (Independiente de la IA)
    # ------------------------------------------------------------------
    def update_frame(self):
        if not self.running:
            return

        if 0 <= self.active_camera_idx < len(self.streams):
            stream = self.streams[self.active_camera_idx]
            frame = stream.get_frame()
            camera_id = stream.camera_id

            # P1.3 Pantalla NO SIGNAL
            if not getattr(stream, "is_connected", True) or frame is None:
                w = self.video_label.winfo_width()
                h = self.video_label.winfo_height()
                pil_img = self.create_no_signal_image(w, h)
            else:
                # Zoom y Pan
                z = self.zoom_factor
                if z > 1.0:
                    h, w = frame.shape[:2]
                    new_h, new_w = int(h / z), int(w / z)
                    max_x, max_y = w - new_w, h - new_h
                    x1 = int(max_x * ((self.pan_x + 1.0) / 2.0))
                    y1 = int(max_y * ((self.pan_y + 1.0) / 2.0))
                    frame = cv2.resize(frame[y1:y1+new_h, x1:x1+new_w], (w, h))

                if self.mode == "RECOGNIZE":
                    # Alimentar Queue de IA (P3.9) si hay espacio
                    if not self.ai_queue.full():
                        self.ai_queue.put((frame.copy(), camera_id))
                    
                    # Dibujar ultima informacion disponible de este camera_id
                    faces = self.ai_results.get(camera_id, [])
                    pil_img = self.draw_overlay_pil(frame, faces)

                elif self.mode == "REGISTER":
                    # Mantenemos logica de registro sincrona por ser modo especial
                    pil_img = self.process_registration_pil(frame)
                elif self.mode == "TRAINING":
                    pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                    draw = ImageDraw.Draw(pil_img)
                    draw.text((40, 50), "Entrenando modelo AI... Espere por favor", fill=(255,165,0))
            
            # Ajustar a tamaño del widget
            w_disp = self.video_label.winfo_width()
            h_disp = self.video_label.winfo_height()
            if w_disp > 10 and h_disp > 10:
                pil_img = pil_img.resize((w_disp, h_disp), Image.Resampling.LANCZOS)
                imgtk = ImageTk.PhotoImage(image=pil_img)
                self.video_label.configure(image=imgtk)
                self.video_label.image = imgtk

        self._safe_after(30, self.update_frame) # ~30fps visuales constantes

    # ------------------------------------------------------------------
    # Modos Auxiliares (Registro y Entrenamiento)
    # ------------------------------------------------------------------
    def process_registration_pil(self, frame):
        self.frame_counter = (self.frame_counter + 1) % 1000
        if self.frame_counter % 3 == 0:
            context = self.vision_engine.detect(frame)
            self.last_reg_faces = context.faces
            
        faces = self.last_reg_faces
        img_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        draw = ImageDraw.Draw(img_pil)
        
        try:
            font = ImageFont.truetype("arialbd.ttf", 22)
        except:
            font = ImageFont.load_default()

        if len(faces) == 1:
            face = faces[0]
            top, right, bottom, left = face.bbox
            face_crop = frame[int(top):int(bottom), int(left):int(right)]
            if face_crop.size > 0:
                color = (200, 200, 200)
                if self.frame_counter % 3 == 0:
                    is_blurry = FileManager.is_blurry(face_crop, BLUR_THRESHOLD)
                    color = (255, 0, 0) if is_blurry else (0, 255, 0)
                    
                    if not is_blurry and time.time() - self.cooldown_time > 0.5:
                        saved = FileManager.save_frame(self.person_dir, face_crop, self.captured_photos)
                        if saved:
                            self.captured_photos += 1
                            self.cooldown_time = time.time()
                            if platform.system() == "Windows":
                                winsound.Beep(1000, 150)
                
                draw.rectangle([(left, top), (right, bottom)], outline=color, width=3)
                txt = f"Fotos: {self.captured_photos}/{MAX_PHOTOS_PER_PERSON}"
                draw.text((left, top - 30), txt, fill=color, font=font)
                
                if self.captured_photos >= MAX_PHOTOS_PER_PERSON:
                    self.lbl_status.configure(text="Registro completo. Entrene el modelo.", text_color="#F39C12")
                    self.mode = "RECOGNIZE"
        else:
            txt = "Sitúese frente a la cámara (solo 1 rostro)"
            draw.text((50, 50), txt, fill=(255,0,0), font=font)
            
        return img_pil

    def start_registration(self):
        cams = load_cameras()
        cursos = list(set([c.get("curso") for c in cams if c.get("curso")]))
        d = DialogoRegistro(self, cursos)
        self.wait_window(d)
        
        if d.resultado:
            cedula, nombre, curso = d.resultado
            self.identity_label = f"{cedula}--{nombre}"
            self.registro_curso = curso
            created_dir = FileManager.create_person_directory(DATASET_DIR, self.identity_label)
            self.person_dir = str(created_dir)
            self.captured_photos = FileManager.count_photos(self.person_dir)
            
            if self.captured_photos >= MAX_PHOTOS_PER_PERSON:
                messagebox.showinfo("Registro", "Estudiante ya registrado.")
            else:
                self.mode = "RECOGNIZE" # Forzamos reinicio antes
                self.mode = "REGISTER"
                self.lbl_status.configure(text=f"Registrando a: {nombre}", text_color="#3498DB")

    def start_training(self):
        self.mode = "TRAINING"
        self.lbl_status.configure(text="Entrenando modelo...", text_color="#F39C12")
        threading.Thread(target=self._run_training_thread, daemon=True).start()

    def _run_training_thread(self):
        try:
            # Sync to Supabase before reloading model
            if hasattr(self, "registro_curso") and self.registro_curso:
                cedula, nombre = self.identity_label.split("--")
                self.api_client._post(
                    "estudiantes?on_conflict=cedula", 
                    [{"cedula": cedula, "nombre": nombre, "curso_id": self.registro_curso}], 
                    upsert=True
                )
                self.event_manager.last_sync_time = 0 # Force sync
                self.event_manager.sync_data()
                
            trainer = ModelTrainer(self.vision_engine)
            dirs = FileManager.get_dataset_directories(Path(DATASET_DIR))
            model_data = trainer.train_from_directory(dirs)
            if model_data:
                FileManager.save_model(model_data, MODEL_PATH)
                self.recognition_engine.reload_model(model_data["encodings"], model_data["names"])
                self.after(0, lambda: self.lbl_status.configure(text="Entrenamiento exitoso", text_color="#2ECC71"))
            else:
                self.after(0, lambda: self.lbl_status.configure(text="Error: Dataset insuficiente", text_color="#E74C3C"))
        except Exception as e:
            logger.error(f"[Entrenamiento] Falló: {e}")
            self.after(0, lambda: self.lbl_status.configure(text="Error de entrenamiento", text_color="#E74C3C"))
        finally:
            self.after(0, lambda: setattr(self, 'mode', "RECOGNIZE"))

    def on_closing(self):
        self.running = False
        
        # Notificar a Supabase que las camaras se apagan
        if hasattr(self, 'api_client') and hasattr(self, 'streams'):
            for s in self.streams:
                try:
                    self.api_client.set_camera_status(s.camera_id, False)
                except Exception as e:
                    logger.error(f"Error actualizando estado de {s.camera_id} al cerrar: {e}")
        
        for aid in self.after_ids:
            try:
                self.after_cancel(aid)
            except:
                pass
        self.after_ids.clear()
        
        for s in self.streams:
            s.release()
            
        if hasattr(self, 'ai_thread') and self.ai_thread.is_alive():
            self.ai_thread.join(timeout=1.0)
            
        self.destroy()

import signal
import sys

if __name__ == "__main__":
    app = FaceRecognitionGUI()
    
    def signal_handler(sig, frame):
        app.on_closing()
        sys.exit(0)
        
    signal.signal(signal.SIGINT, signal_handler)
    app.mainloop()
