# Whisper Teleprompter + TinyLLM

Backend FastAPI opcional para Ensaya IA: teleprompter con Whisper y detección de personajes con TinyLLM (`Qwen/Qwen2.5-0.5B-Instruct`) o heurística si no hay GPU / faltan dependencias.

## Estructura

```
teleprompter/
├── api.py
├── requirements.txt
├── recordings/          ← se crea solo
└── core/
    ├── teleprompter_engine.py
    ├── recording_manager.py
    └── tiny_llm_characters.py
```

## Cómo levantarlo

Desde esta carpeta (`src/teleprompter`):

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

Docs interactivas: http://localhost:8000/docs

En el frontend (`.env`):

```env
VITE_TELEPROMPTER_URL=http://127.0.0.1:8000
# Opcional, calibración con Ollama:
# VITE_OLLAMA_URL=http://127.0.0.1:11434
```

Si esas variables **no** están definidas, la app web no hace fetch a localhost y usa la heurística del navegador.

## Variables de entorno

| Variable | Default | Descripción |
| --- | --- | --- |
| `DB_PATH` | `teleprompter.db` | SQLite local |
| `RECORDINGS_DIR` | `recordings/` | WAVs |
| `WHISPER_MODEL` | `small` | tiny/small/medium/large |
| `WHISPER_LANG` | `es` | Idioma Whisper |
| `TINY_LLM_MODEL` | `Qwen/Qwen2.5-0.5B-Instruct` | Modelo Hugging Face |
| `CORS_ORIGINS` | (vacío) | Orígenes extra, separados por coma |
| `RAILWAY_PUBLIC_DOMAIN` | (vacío) | Dominio público Railway |

CORS incluye `http://localhost:8080` y `*.up.railway.app`.

## Rutas de personajes

Alineadas con `tiny-character-detector.ts` / `script-parser.ts`:

- `GET /characters/hardware` → `{ device, device_name, gpu_available, vram_gb, dtype, model_id }`
- `POST /characters/detect` body `{ "script_text": "..." }` → `{ characters, alias_map, discarded, line_counts, hardware, used_tiny_llm }`
- `POST /characters/calibrate` body `{ "sample_text": "..." }` → `{ formatoDetectado, xMinPersonaje, xMinDialogo, usaPrefijoEnLinea, aliasPersonajes }`

Si faltan `torch` / `transformers` o falla la carga del modelo, las rutas responden con heurística (`used_tiny_llm: false`), **nunca** con 500 por eso.

## Nota

Este backend es **opcional**. Ensaya IA funciona en el navegador sin él; el ensayo por voz/lectura no depende de estas rutas.
