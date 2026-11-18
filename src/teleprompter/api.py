"""
api.py  –  Backend FastAPI para Whisper Teleprompter (Versión Relacional)
Incluye rutas /characters/* para detección TinyLLM / heurística.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from core.teleprompter_engine import WhisperTeleprompter
from core.recording_manager import (
    CharacterRecorder,
    PlaybackEngine,
    RecordingDB,
    RECORDINGS_DIR,
)
from core.tiny_llm_characters import (
    CharacterDetectionResult,
    TinyLLMCharacterDetector,
    get_detector,
)

DB_PATH = os.getenv("DB_PATH", "teleprompter.db")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_LANG = os.getenv("WHISPER_LANG", "es")
RAILWAY_PUBLIC_DOMAIN = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip()
EXTRA_CORS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]

CORS_ORIGINS = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *EXTRA_CORS,
]
if RAILWAY_PUBLIC_DOMAIN:
    host = RAILWAY_PUBLIC_DOMAIN.replace("https://", "").replace("http://", "").strip("/")
    CORS_ORIGINS.extend([f"https://{host}", f"http://{host}"])


class AppState:
    def __init__(self):
        self.db = RecordingDB()
        self.tp = WhisperTeleprompter(WHISPER_MODEL, WHISPER_LANG)
        self.recorder = CharacterRecorder(self.db)
        self.playback = PlaybackEngine()


app_state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    RECORDINGS_DIR.mkdir(exist_ok=True)
    yield
    try:
        app_state.tp.audio.stop()
    except Exception:
        pass
    try:
        app_state.playback.stop()
    except Exception:
        pass


app = FastAPI(title="Whisper Teleprompter API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_origin_regex=r"https://.*\.up\.railway\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/recordings", StaticFiles(directory=str(RECORDINGS_DIR)), name="recordings")


# ════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC ACTUALIZADOS A IDs ENTEROS
# ════════════════════════════════════════════════════════════════════════════

# En api.py
class EnsayoCreate(BaseModel):
    id_obra: str      # ¡Cambiado de int a str!
    modo_ensayo: str

class RecordStart(BaseModel):
    id_ensayo: str    # ¡Cambiado de int a str!
    id_actor: str     # ¡Cambiado de int a str!
    id_linea: str     # ¡Cambiado de int a str!
    mic_index: Optional[int] = None

# ════════════════════════════════════════════════════════════════════════════
# ENDPOINTS (Adaptados)
# ════════════════════════════════════════════════════════════════════════════

@app.post("/ensayo")
async def create_ensayo(body: EnsayoCreate):
    """Inicia una sesión de ensayo vinculada a una obra específica."""
    ensayo = app_state.db.iniciar_ensayo(id_obra=body.id_obra, modo_ensayo=body.modo_ensayo)
    return {
        "id_ensayo": ensayo.id_ensayo,
        "id_obra": ensayo.id_obra,
        "modo_ensayo": ensayo.modo_ensayo,
        "fecha_hora": ensayo.fecha_hora
    }

@app.post("/recording/start")
async def start_recording(body: RecordStart):
    """Inicia grabación para un actor y una línea de diálogo (usando IDs)."""
    if app_state.recorder.is_recording:
        raise HTTPException(409, "Hay una grabación en curso.")
        
    ensayo = app_state.db.get_ensayo(body.id_ensayo)
    if not ensayo:
        raise HTTPException(404, "Ensayo no encontrado.")

    app_state.recorder.start_recording(
        id_ensayo=body.id_ensayo,
        id_actor=body.id_actor,
        id_linea=body.id_linea,
        mic_index=body.mic_index,
    )
    return {"status": "recording", "id_linea": body.id_linea}


@app.post("/recording/stop")
async def stop_recording():
    if not app_state.recorder.is_recording:
        raise HTTPException(409, "No hay grabación activa.")

    rec = app_state.recorder.stop_recording()
    if not rec:
        raise HTTPException(500, "Grabación vacía.")

    return {
        "id_grabacion": rec.id_grabacion,
        "id_linea": rec.id_linea,
        "id_actor": rec.id_actor,
        "es_toma_activa": rec.es_toma_activa,
        "audio_url": f"/recordings/{Path(rec.ruta_archivo_audio).name}",
    }


# ════════════════════════════════════════════════════════════════════════════
# PERSONAJES / TinyLLM (respuestas alineadas con tiny-character-detector.ts)
# ════════════════════════════════════════════════════════════════════════════


class CharacterDetectBody(BaseModel):
    script_text: str = Field(..., min_length=1)


class CharacterCalibrateBody(BaseModel):
    sample_text: str = Field(..., min_length=1)


def _heuristic_detection(script_text: str, hardware: Dict[str, object]) -> Dict[str, Any]:
    """Misma forma que CharacterDetectionResponse del frontend; never raises 500."""
    detector = TinyLLMCharacterDetector()
    # Forzar heurística: no cargar modelo
    detector._load_attempted = True
    detector.model = None
    detector.tokenizer = None
    result = detector.detect_characters(script_text)
    payload = asdict(result) if isinstance(result, CharacterDetectionResult) else {
        "characters": result.characters,
        "alias_map": result.alias_map,
        "discarded": result.discarded,
        "line_counts": result.line_counts,
        "hardware": hardware,
        "used_tiny_llm": False,
    }
    payload["hardware"] = hardware
    payload["used_tiny_llm"] = False
    return payload


@app.get("/characters/hardware")
async def characters_hardware():
    try:
        detector = get_detector()
        return detector.hardware_status()
    except Exception:
        return {
            "device": "cpu",
            "device_name": "CPU (heurística)",
            "gpu_available": False,
            "vram_gb": None,
            "dtype": "float32",
            "model_id": os.getenv("TINY_LLM_MODEL", "Qwen/Qwen2.5-0.5B-Instruct"),
        }


@app.post("/characters/detect")
async def characters_detect(body: CharacterDetectBody):
    try:
        detector = get_detector()
        result = detector.detect_characters(body.script_text)
        return {
            "characters": result.characters,
            "alias_map": result.alias_map,
            "discarded": result.discarded,
            "line_counts": result.line_counts,
            "hardware": result.hardware,
            "used_tiny_llm": result.used_tiny_llm,
        }
    except Exception:
        hardware = {
            "device": "cpu",
            "device_name": "CPU (heurística)",
            "gpu_available": False,
            "vram_gb": None,
            "dtype": "float32",
            "model_id": os.getenv("TINY_LLM_MODEL", "Qwen/Qwen2.5-0.5B-Instruct"),
        }
        return _heuristic_detection(body.script_text, hardware)


@app.post("/characters/calibrate")
async def characters_calibrate(body: CharacterCalibrateBody):
    """Respuesta compatible con ScriptRulesSchema (script-parser.ts)."""
    try:
        detector = get_detector()
        return detector.calibrate_script_rules(body.sample_text)
    except Exception:
        lines = [l.strip() for l in body.sample_text.splitlines() if l.strip()]
        inline = sum(1 for line in lines[:150] if ":" in line or ".-" in line)
        usa = inline >= 3
        return {
            "formatoDetectado": "teatro_hispano" if usa else "cine_estandar",
            "xMinPersonaje": 0,
            "xMinDialogo": 4 if usa else 12,
            "usaPrefijoEnLinea": usa,
            "aliasPersonajes": {},
        }