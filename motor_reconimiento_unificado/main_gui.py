import logging
import os
import platform
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

import cv2
import numpy as np
from PIL import Image, ImageTk

if platform.system() == "Windows":
    import winsound

from src.capture.camera_stream import CameraStream
from src.events.event_manager import EventManager
from src.network.notification_service import NotificationService
from src.network.supabase_client import SupabaseClient
from src.storage.file_manager import FileManager
from src.training.trainer import ModelTrainer
from src.utils.config import (
    BLUR_THRESHOLD,
    CAMERA_SOURCES,
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


# =========================================================================
# FORMULARIO DE REGISTRO DE ESTUDIANTE (MODAL)
# =========================================================================
class DialogoRegistro(tk.Toplevel):
    """Diálogo modal para ingresar Cédula, Nombres y Curso al registrar un nuevo estudiante."""

    def __init__(self, parent, cursos):
        from tkinter import ttk
        super().__init__(parent)
        self.title("Registro de Estudiante")
        self.geometry("380x320")
        self.resizable(False, False)
        self.resultado = None

        self.transient(parent)
        self.grab_set()

        tk.Label(
            self,
            text="Cédula (10 dígitos numéricos):",
            font=("Helvetica", 10, "bold"),
        ).pack(pady=(10, 2))
        self.cedula_entry = tk.Entry(self, width=32, font=("Helvetica", 11))
        self.cedula_entry.pack()

        tk.Label(
            self,
            text="Apellidos y Nombres:",
            font=("Helvetica", 10, "bold"),
        ).pack(pady=(10, 2))
        self.nombre_entry = tk.Entry(self, width=32, font=("Helvetica", 11))
        self.nombre_entry.pack()
        
        tk.Label(
            self,
            text="Curso:",
            font=("Helvetica", 10, "bold"),
        ).pack(pady=(10, 2))
        self.curso_var = tk.StringVar()
        self.curso_combo = ttk.Combobox(self, textvariable=self.curso_var, values=cursos, state="readonly", width=30)
        if cursos:
            self.curso_combo.current(0)
        self.curso_combo.pack()

        btn_frame = tk.Frame(self)
        btn_frame.pack(pady=20)

        tk.Button(
            btn_frame,
            text="Cancelar",
            width=12,
            command=self.destroy,
        ).pack(side="left", padx=10)
        tk.Button(
            btn_frame,
            text="Aceptar",
            width=12,
            bg="#28B463",
            fg="white",
            font=("Helvetica", 10, "bold"),
            command=self.guardar,
        ).pack(side="left", padx=10)

    def guardar(self):
        cedula = self.cedula_entry.get().strip()
        nombre = self.nombre_entry.get().strip().upper()
        curso = self.curso_var.get()

        if len(cedula) == 10 and cedula.isdigit() and nombre and curso:
            self.resultado = (cedula, nombre, curso)
            self.destroy()
        else:
            messagebox.showwarning(
                "Error de Validación",
                "Por favor ingrese cédula (10 dígitos), nombre y seleccione un curso.",
                parent=self,
            )


# =========================================================================
# APLICACIÓN PRINCIPAL DE GUI
# =========================================================================
class FaceRecognitionGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Motor de Reconocimiento Facial Edge SICA (Unificado)")
        self.root.geometry("1150x680")
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

        self.running = True
        self.mode = "RECOGNIZE"  # RECOGNIZE, REGISTER, TRAINING
        self.identity_label = ""
        self.person_dir = ""
        self.captured_photos = 0
        self.cooldown_time = 0.0
        self.current_imgtk = None

        self.active_camera_idx = 0
        self.view_mode = "SINGLE"  # SINGLE, GRID
        self.streams: list[CameraStream] = []

        self.frame_counter = 0
        self.process_every_n_frames = 3
        self.last_faces_per_cam = {}
        self.last_reg_faces = []

        # Zoom y Pan
        self.zoom_factor = tk.DoubleVar(value=1.0)
        self.pan_x = tk.DoubleVar(value=0.0)
        self.pan_y = tk.DoubleVar(value=0.0)
        self.drag_start_x = 0
        self.drag_start_y = 0

        self.root.columnconfigure(0, weight=7)
        self.root.columnconfigure(1, weight=3)
        self.root.rowconfigure(0, weight=1)

        self.setup_ui()
        self.init_backend()
        self.update_frame()
        self.schedule_periodic_tasks()

    def setup_ui(self):
        # Área de Video
        self.video_frame = tk.Frame(self.root, bg="black")
        self.video_frame.grid(row=0, column=0, sticky="nsew")
        self.video_label = tk.Label(self.video_frame, bg="black")
        self.video_label.pack(expand=True, fill="both")

        self.video_label.bind("<MouseWheel>", self.on_mouse_wheel)
        self.video_label.bind("<ButtonPress-1>", self.on_mouse_press)
        self.video_label.bind("<B1-Motion>", self.on_mouse_drag)

        # Panel de Control Lateral
        self.control_frame = tk.Frame(self.root, bg="#2C3E50", padx=20, pady=20)
        self.control_frame.grid(row=0, column=1, sticky="nsew")

        lbl_title = tk.Label(
            self.control_frame,
            text="Panel de Control SICA",
            font=("Helvetica", 16, "bold"),
            bg="#2C3E50",
            fg="white",
        )
        lbl_title.pack(pady=(0, 15))

        self.lbl_status = tk.Label(
            self.control_frame,
            text="Estado: Reconocimiento Activo (Automático)",
            font=("Helvetica", 11),
            bg="#2C3E50",
            fg="#2ECC71",
        )
        self.lbl_status.pack(pady=(0, 15))

        lbl_instrucciones = tk.Label(
            self.control_frame,
            text="🖱️ Rueda: Zoom | Click Izq: Mover",
            font=("Helvetica", 9, "italic"),
            bg="#2C3E50",
            fg="#BDC3C7",
        )
        lbl_instrucciones.pack(pady=(0, 15))

        lbl_cams = tk.Label(
            self.control_frame,
            text="Selector de Cámara / Curso",
            font=("Helvetica", 10, "bold"),
            bg="#2C3E50",
            fg="#BDC3C7",
        )
        lbl_cams.pack(pady=(5, 5))

        cam_options = [
            f"{cam.get('nombre', f'Cam {i}')} [{cam.get('curso', 'Sin Curso')}]"
            for i, cam in enumerate(CAMERA_SOURCES)
        ]
        self.cam_var = tk.StringVar()
        self.cam_combo = ttk.Combobox(
            self.control_frame,
            textvariable=self.cam_var,
            values=cam_options,
            state="readonly",
            font=("Helvetica", 10),
        )
        self.cam_combo.pack(fill="x", pady=5)
        if cam_options:
            self.cam_combo.current(0)
        self.cam_combo.bind("<<ComboboxSelected>>", self.on_camera_select)

        btn_grid = tk.Button(
            self.control_frame,
            text="Vista General (Todas)",
            bg="#9B59B6",
            fg="white",
            font=("Helvetica", 10, "bold"),
            command=self.show_grid_view,
        )
        btn_grid.pack(fill="x", pady=(10, 20))

        button_font = ("Helvetica", 11)
        self.btn_register = tk.Button(
            self.control_frame,
            text="Registrar Nuevo Alumno",
            font=button_font,
            bg="#3498DB",
            fg="white",
            command=self.start_registration,
        )
        self.btn_register.pack(fill="x", pady=8, ipady=4)

        self.btn_train = tk.Button(
            self.control_frame,
            text="Actualizar Modelo AI",
            font=button_font,
            bg="#F39C12",
            fg="white",
            command=self.start_training,
        )
        self.btn_train.pack(fill="x", pady=8, ipady=4)

        self.btn_quit = tk.Button(
            self.control_frame,
            text="Cerrar Programa",
            font=button_font,
            bg="#E74C3C",
            fg="white",
            command=self.on_closing,
        )
        self.btn_quit.pack(fill="x", pady=(20, 0), ipady=4)

    # ------------------------------------------------------------------
    # Inicialización del Backend
    # ------------------------------------------------------------------
    def init_backend(self):
        logger.info("[GUI] Cargando modelo local y motores de visión...")
        model = FileManager.load_model(Path(MODEL_PATH))
        known_encodings = model.get("encodings", [])
        known_names = model.get("names", [])

        # Motores de Visión (Single instance de VisionEngine)
        self.vision_engine = get_vision_engine()
        self.tracker = get_face_tracker()
        self.recognition_engine = get_recognition_engine(
            known_encodings=known_encodings,
            known_names=known_names,
        )

        # Red, Notificaciones y EventManager (Orquestador Híbrido)
        self.api_client = SupabaseClient()
        self.notification_service = NotificationService()
        self.event_manager = EventManager(
            supabase_client=self.api_client,
            notification_service=self.notification_service,
        )

        # Sincronizar nómina inicial en segundo plano
        threading.Thread(target=self.event_manager.sync_data, daemon=True).start()

        logger.info("[GUI] Iniciando flujos de cámaras...")
        for cam in CAMERA_SOURCES:
            cam_id = cam.get("camera_id", "CAM_DEFAULT")
            cam_nombre = cam.get("nombre", f"Cámara {cam_id}")
            cam_ubicacion = cam.get("ubicacion", {"latitude": -2.128589, "longitude": -79.931099})

            stream = CameraStream(
                source=cam["src"],
                camera_id=cam_id,
                reconnect_delay=RECONNECT_DELAY_SECONDS,
            )
            self.streams.append(stream)
            self.api_client.set_camera_status(cam_id, True, ubicacion=cam_ubicacion)

    # ------------------------------------------------------------------
    # Tareas Periódicas Automáticas
    # ------------------------------------------------------------------
    def schedule_periodic_tasks(self):
        """Ejecuta verificaciones periódicas de horario y sincronización sin bloquear la GUI."""
        if not self.running:
            return

        try:
            # 1. Consolidar asistencia de bloques de clase finalizados
            self.event_manager.check_schedules()

            # 2. Re-sincronizar periódicamente estudiantes/cursos de Supabase
            self.event_manager.sync_data()
        except Exception as e:
            logger.error(f"[GUI] Error en tareas periódicas: {e}")

        # Programar siguiente ejecución en 10 segundos
        self.root.after(10000, self.schedule_periodic_tasks)

    # ------------------------------------------------------------------
    # Interacción de Zoom y Navegación
    # ------------------------------------------------------------------
    def on_mouse_wheel(self, event):
        if event.delta > 0:
            self.zoom_factor.set(min(4.0, self.zoom_factor.get() + 0.1))
        elif event.delta < 0:
            self.zoom_factor.set(max(1.0, self.zoom_factor.get() - 0.1))

    def on_mouse_press(self, event):
        self.drag_start_x = event.x
        self.drag_start_y = event.y

    def on_mouse_drag(self, event):
        if self.zoom_factor.get() <= 1.0:
            return

        dx = event.x - self.drag_start_x
        dy = event.y - self.drag_start_y

        pan_speed = 0.003 / self.zoom_factor.get()
        new_pan_x = self.pan_x.get() - (dx * pan_speed)
        new_pan_y = self.pan_y.get() - (dy * pan_speed)

        self.pan_x.set(max(-1.0, min(1.0, new_pan_x)))
        self.pan_y.set(max(-1.0, min(1.0, new_pan_y)))
        self.drag_start_x = event.x
        self.drag_start_y = event.y

    def on_camera_select(self, event):
        idx = self.cam_combo.current()
        self.switch_camera(idx)

    def switch_camera(self, idx):
        self.active_camera_idx = idx
        self.view_mode = "SINGLE"
        if platform.system() == "Windows":
            winsound.Beep(800, 100)

    def show_grid_view(self):
        self.view_mode = "GRID"
        if platform.system() == "Windows":
            winsound.Beep(850, 100)

    def create_connection_lost_frame(self):
        w = self.video_label.winfo_width()
        h = self.video_label.winfo_height()
        if w < 10 or h < 10:
            w, h = 640, 480
        display_frame = np.zeros((h, w, 3), dtype=np.uint8)
        cv2.putText(
            display_frame,
            "CONEXION PERDIDA",
            (w // 2 - 130, h // 2 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 0, 255),
            2,
        )
        cv2.putText(
            display_frame,
            "Intentando reconectar...",
            (w // 2 - 110, h // 2 + 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            1,
        )
        return display_frame

    # ------------------------------------------------------------------
    # Bucle Principal de Renderizado (16 ms ~ 60 FPS)
    # ------------------------------------------------------------------
    def update_frame(self):
        if not self.running:
            return

        display_frame = None

        if self.view_mode == "SINGLE":
            if 0 <= self.active_camera_idx < len(self.streams):
                stream = self.streams[self.active_camera_idx]
                frame = stream.get_frame()

                if getattr(stream, "is_connected", True) and frame is not None:
                    z = self.zoom_factor.get()
                    if z > 1.0:
                        h, w = frame.shape[:2]
                        new_h, new_w = int(h / z), int(w / z)
                        max_shift_x, max_shift_y = w - new_w, h - new_h
                        x1 = int(max_shift_x * ((self.pan_x.get() + 1.0) / 2.0))
                        y1 = int(max_shift_y * ((self.pan_y.get() + 1.0) / 2.0))
                        x1, y1 = max(0, min(x1, max_shift_x)), max(0, min(y1, max_shift_y))
                        cropped = frame[y1 : y1 + new_h, x1 : x1 + new_w]
                        frame = cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)

                    display_frame = frame.copy()

                    if self.mode == "RECOGNIZE":
                        display_frame = self.process_recognition(frame, display_frame)
                    elif self.mode == "REGISTER":
                        display_frame = self.process_registration(frame, display_frame)
                    elif self.mode == "TRAINING":
                        cv2.putText(
                            display_frame,
                            "Entrenando modelo AI... Espere por favor",
                            (40, 50),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.7,
                            (0, 165, 255),
                            2,
                        )
                else:
                    display_frame = self.create_connection_lost_frame()
            else:
                display_frame = self.create_connection_lost_frame()

        elif self.view_mode == "GRID":
            frames = []
            target_w, target_h = 320, 240
            for i, stream in enumerate(self.streams):
                f = stream.get_frame()
                if f is not None and getattr(stream, "is_connected", True):
                    proc_frame = f.copy()
                    if self.mode == "RECOGNIZE":
                        proc_frame = self.process_recognition(f, proc_frame, stream_idx=i)
                    elif self.mode == "REGISTER":
                        proc_frame = self.process_registration(f, proc_frame)
                    frames.append(cv2.resize(proc_frame, (target_w, target_h)))
                else:
                    blank = np.zeros((target_h, target_w, 3), dtype=np.uint8)
                    cv2.putText(
                        blank,
                        "SIN CONEXION",
                        (80, target_h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0, 0, 255),
                        2,
                    )
                    frames.append(blank)

            if len(frames) == 1:
                display_frame = frames[0]
            elif len(frames) == 2:
                display_frame = np.hstack((frames[0], frames[1]))
            elif len(frames) >= 3:
                top = np.hstack((frames[0], frames[1]))
                bottom = np.hstack(
                    (
                        frames[2],
                        np.zeros((target_h, target_w, 3), dtype=np.uint8)
                        if len(frames) == 3
                        else frames[3],
                    )
                )
                display_frame = np.vstack((top, bottom))

        # Renderizar fotograma en el Label Tkinter
        if display_frame is not None:
            rgb_frame = cv2.cvtColor(display_frame, cv2.COLOR_BGR2RGB)
            label_w, label_h = self.video_label.winfo_width(), self.video_label.winfo_height()

            if label_w > 10 and label_h > 10:
                frame_h, frame_w = rgb_frame.shape[:2]
                target_aspect, frame_aspect = label_w / label_h, frame_w / frame_h

                if frame_aspect > target_aspect:
                    new_w = int(frame_h * target_aspect)
                    x_offset = (frame_w - new_w) // 2
                    rgb_frame = rgb_frame[:, x_offset : x_offset + new_w]
                else:
                    new_h = int(frame_w / target_aspect)
                    y_offset = (frame_h - new_h) // 2
                    rgb_frame = rgb_frame[y_offset : y_offset + new_h, :]

                rgb_frame = cv2.resize(
                    rgb_frame, (label_w, label_h), interpolation=cv2.INTER_LINEAR
                )

            self.current_imgtk = ImageTk.PhotoImage(image=Image.fromarray(rgb_frame))
            self.video_label.configure(image=self.current_imgtk)

        self.root.after(16, self.update_frame)

    # ------------------------------------------------------------------
    # Pipeline de Reconocimiento por Frame
    # ------------------------------------------------------------------
    def process_recognition(self, frame, display_frame, stream_idx=None):
        if stream_idx is None:
            stream_idx = self.active_camera_idx

        stream = self.streams[stream_idx]
        camera_id = stream.camera_id

        self.frame_counter = (self.frame_counter + 1) % 100000

        # Ejecutar reconocimiento solo cada N frames para mantener altos FPS
        if self.frame_counter % self.process_every_n_frames == 0:
            context = self.vision_engine.detect(frame)
            context = self.tracker.update(context)
            context = self.recognition_engine.process(
                frame, context, self.vision_engine, camera_id
            )
            self.last_faces_per_cam[camera_id] = context.faces

        caras_actuales = self.last_faces_per_cam.get(camera_id, [])

        for face in caras_actuales:
            confidence = getattr(face, "confidence", 0.0)
            identity_raw = getattr(face, "identity_uuid", "Calculando...")

            # Parsear identificador CEDULA--NOMBRE
            if "--" in identity_raw:
                cedula, nombre_display = identity_raw.split("--", 1)
                nombre_display = nombre_display.replace("_", " ")
            else:
                cedula = identity_raw
                nombre_display = identity_raw

            if cedula in ["unknown", "Desconocido"]:
                color = (0, 0, 255)  # Rojo
            elif cedula == "Calculando...":
                color = (255, 255, 0)  # Amarillo
            else:
                color = (0, 255, 0)  # Verde
                # Enviar al EventManager (Maneja deduplicación y modelo híbrido)
                if self.frame_counter % self.process_every_n_frames == 0:
                    self.event_manager.register_recognition(identity_raw, camera_id)

            # Dibujar Bounding Box
            cv2.rectangle(
                display_frame,
                (int(face.left), int(face.top)),
                (int(face.right), int(face.bottom)),
                color,
                2,
            )

            # Etiqueta con nombre y porcentaje de confianza
            display_text = (
                nombre_display[:18] + ".." if len(nombre_display) > 18 else nombre_display
            )
            label = (
                f"{display_text} ({confidence:.1f}%)"
                if confidence > 0
                else f"{display_text}"
            )
            cv2.putText(
                display_frame,
                label,
                (int(face.left), int(face.top) - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                color,
                2,
            )

        return display_frame

    # ------------------------------------------------------------------
    # Pipeline de Registro de Estudiante
    # ------------------------------------------------------------------
    def process_registration(self, frame, display_frame):
        self.frame_counter = (self.frame_counter + 1) % 100000

        if self.frame_counter % self.process_every_n_frames == 0:
            context = self.vision_engine.detect(frame)
            self.last_reg_faces = context.faces

        faces = self.last_reg_faces

        if len(faces) == 1:
            face = faces[0]
            top, right, bottom, left = face.bbox
            face_crop = frame[top:bottom, left:right]

            if face_crop.size > 0:
                color = (200, 200, 200)

                if self.frame_counter % self.process_every_n_frames == 0:
                    is_blurry = FileManager.is_blurry(face_crop, BLUR_THRESHOLD)
                    color = (0, 0, 255)

                    if not is_blurry and (time.time() - self.cooldown_time > 0.4):
                        success = FileManager.save_frame(
                            self.person_dir, face_crop, self.captured_photos
                        )
                        if success:
                            self.captured_photos += 1
                            self.cooldown_time = time.time()
                            color = (0, 255, 0)
                            if platform.system() == "Windows":
                                winsound.Beep(1000, 150)

                cv2.rectangle(display_frame, (left, top), (right, bottom), color, 2)
                cv2.putText(
                    display_frame,
                    f"Capturas: {self.captured_photos}/{MAX_PHOTOS_PER_PERSON}",
                    (left, top - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    color,
                    2,
                )

            if self.captured_photos >= MAX_PHOTOS_PER_PERSON:
                if platform.system() == "Windows":
                    winsound.Beep(1500, 400)

                nombre_msg = (
                    self.identity_label.split("--")[1].replace("_", " ")
                    if "--" in self.identity_label
                    else self.identity_label
                )
                messagebox.showinfo(
                    "Registro Exitoso",
                    f"Se han capturado correctamente las imágenes para:\n{nombre_msg}.\n\n"
                    "Recuerde hacer clic en 'Actualizar Modelo AI' para incorporar las nuevas fotos.",
                )
                self.mode = "RECOGNIZE"
                self.update_ui_state(
                    "Estado: Reconocimiento Activo (Automático)", "#2ECC71"
                )

        elif len(faces) > 1:
            cv2.putText(
                display_frame,
                "ERROR: Multiples rostros detectados",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 0, 255),
                2,
            )

        return display_frame

    def start_registration(self):
        if self.mode == "TRAINING":
            return
            
        cursos = list(set([cam.get("curso") for cam in CAMERA_SOURCES if cam.get("curso")]))
        dialogo = DialogoRegistro(self.root, cursos)
        self.root.wait_window(dialogo)

        if not dialogo.resultado:
            return

        cedula_limpia, nombre_completo, curso_seleccionado = dialogo.resultado
        self.identity_label = f"{cedula_limpia}--{nombre_completo.replace(' ', '_')}"
        self.person_dir = FileManager.create_person_directory(
            DATASET_DIR, self.identity_label
        )
        
        # Guardar en Supabase para sincronizar
        try:
            payload = [{
                "cedula": cedula_limpia,
                "nombre": nombre_completo,
                "curso_id": curso_seleccionado
            }]
            self.api_client._post("estudiantes?on_conflict=cedula", payload, upsert=True)
            # Refrescar memoria local del EventManager para que no lo detecte como intruso
            if curso_seleccionado not in self.event_manager.curso_to_estudiantes:
                self.event_manager.curso_to_estudiantes[curso_seleccionado] = []
            self.event_manager.curso_to_estudiantes[curso_seleccionado].append(payload[0])
            self.event_manager.todas_las_cedulas.add(cedula_limpia)
            logger.info(f"[Registro] Estudiante sincronizado con Supabase: {cedula_limpia}")
        except Exception as e:
            logger.error(f"[Registro] Error sincronizando con Supabase: {e}")

        self.captured_photos = 0
        self.cooldown_time = time.time()
        self.mode = "REGISTER"
        self.update_ui_state(
            f"Estado: Registrando a {nombre_completo}...", "#3498DB"
        )

    # ------------------------------------------------------------------
    # Re-entrenamiento Incremental del Modelo
    # ------------------------------------------------------------------
    def start_training(self):
        if self.mode == "TRAINING":
            return

        if messagebox.askyesno(
            "Confirmar Entrenamiento",
            "¿Desea iniciar la actualización del modelo con el dataset actual?",
        ):
            self.mode = "TRAINING"
            self.update_ui_state("Estado: Entrenando Modelo AI...", "#F39C12")
            threading.Thread(target=self._train_task, daemon=True).start()

    def _train_task(self):
        try:
            directories = FileManager.get_dataset_directories(DATASET_DIR)
            if not directories:
                self.root.after(
                    0,
                    lambda: messagebox.showerror(
                        "Error", "El directorio del dataset está vacío."
                    ),
                )
                return

            # Reutilizar el mismo VisionEngine para no duplicar ~300 MB RAM
            trainer = ModelTrainer(vision_engine=self.vision_engine)
            model_data = trainer.train_from_directory(directories)

            if len(model_data["encodings"]) > 0:
                FileManager.save_model(model_data, MODEL_PATH)

                # Recargar embeddings en caliente en el motor de reconocimiento
                self.recognition_engine.reload_model(
                    model_data["encodings"], model_data["names"]
                )

                self.root.after(
                    0,
                    lambda: messagebox.showinfo(
                        "Éxito",
                        f"Modelo actualizado correctamente.\n"
                        f"Total personas: {len(model_data['names'])}",
                    ),
                )
            else:
                self.root.after(
                    0,
                    lambda: messagebox.showerror(
                        "Error", "No se generaron embeddings válidos."
                    ),
                )
        except Exception as e:
            logger.error(f"[GUI] Error durante el entrenamiento: {e}")
            self.root.after(
                0,
                lambda msg=str(e): messagebox.showerror(
                    "Error de Entrenamiento", msg
                ),
            )
        finally:
            self.root.after(0, self._restore_recognition_mode)

    def _restore_recognition_mode(self):
        self.mode = "RECOGNIZE"
        self.update_ui_state(
            "Estado: Reconocimiento Activo (Automático)", "#2ECC71"
        )

    def update_ui_state(self, text: str, color: str):
        self.lbl_status.config(text=text, fg=color)

    # ------------------------------------------------------------------
    # Cierre Seguro
    # ------------------------------------------------------------------
    def on_closing(self):
        if messagebox.askokcancel("Salir", "¿Desea cerrar el programa SICA Edge?"):
            self.running = False

            # Marcar cámaras como inactivas en Supabase y liberar recursos
            for stream in self.streams:
                try:
                    self.api_client.set_camera_status(stream.camera_id, False)
                    stream.release()
                except Exception as e:
                    logger.error(f"[GUI] Error liberando cámara {stream.camera_id}: {e}")

            self.root.destroy()
            sys.exit(0)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    )
    root = tk.Tk()
    app = FaceRecognitionGUI(root)
    root.mainloop()
