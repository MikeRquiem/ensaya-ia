"""
tiny_llm_characters.py
Motor TinyLLM con autodetección de hardware (GPU CUDA / Apple MPS / CPU)
para detección, limpieza y normalización de nombres de personajes en libretos.
Si falta torch/transformers, usa solo la heurística (used_tiny_llm=false).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

try:
    import torch
    HAS_TORCH = True
except ImportError:
    torch = None  # type: ignore
    HAS_TORCH = False

try:
    from transformers import AutoModelForCausalLM, AutoTokenizer
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False


STAGE_DIRECTION_BLACKLIST = {
    "ACTO", "ACTO I", "ACTO II", "ACTO III", "ACTO IV", "ACTO V",
    "ESCENA", "CUADRO", "PRÓLOGO", "PROLOGO", "EPÍLOGO", "EPILOGO",
    "CONTINÚA", "CONTINUA", "CONTINUED", "MÁS", "MAS", "MORE",
    "FIN", "THE END", "TELÓN", "TELON", "OSCURO", "APAGÓN", "APAGON",
    "CORTE A", "CUT TO", "FADE IN", "FADE OUT", "FUNDIDO A NEGRO",
    "TRANSICIÓN", "TRANSICION", "PAUSA", "SILENCIO", "NOTA",
    "PÁGINA", "PAGINA", "INT.", "EXT.", "INT/EXT", "I/E",
}


@dataclass
class HardwareReport:
    device: str
    device_name: str
    gpu_available: bool
    vram_gb: Optional[float]
    dtype: str
    model_id: str


@dataclass
class CharacterDetectionResult:
    characters: List[str]
    alias_map: Dict[str, str]
    discarded: List[str]
    line_counts: Dict[str, int]
    hardware: Dict[str, object]
    used_tiny_llm: bool


class TinyLLMCharacterDetector:
    def __init__(self, model_id: Optional[str] = None):
        self.model_id = model_id or os.getenv(
            "TINY_LLM_MODEL", "Qwen/Qwen2.5-0.5B-Instruct"
        )
        self.device, self.torch_dtype, self.hw_report = self._detect_hardware()
        self.tokenizer = None
        self.model = None
        self._load_attempted = False

    def _detect_hardware(self) -> Tuple[str, Any, HardwareReport]:
        if not HAS_TORCH:
            report = HardwareReport(
                device="cpu",
                device_name="CPU (sin torch; heurística)",
                gpu_available=False,
                vram_gb=None,
                dtype="float32",
                model_id=self.model_id,
            )
            return "cpu", None, report

        if torch.cuda.is_available():
            dev_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            vram = round(props.total_memory / (1024 ** 3), 2)
            dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
            report = HardwareReport(
                device="cuda",
                device_name=dev_name,
                gpu_available=True,
                vram_gb=vram,
                dtype=str(dtype).replace("torch.", ""),
                model_id=self.model_id,
            )
            return "cuda", dtype, report

        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            report = HardwareReport(
                device="mps",
                device_name="Apple Silicon GPU (MPS)",
                gpu_available=True,
                vram_gb=None,
                dtype="float16",
                model_id=self.model_id,
            )
            return "mps", torch.float16, report

        cpu_count = os.cpu_count() or 4
        optimal_threads = max(1, min(cpu_count - 1, 8))
        try:
            torch.set_num_threads(optimal_threads)
        except Exception:
            pass

        report = HardwareReport(
            device="cpu",
            device_name=f"CPU ({optimal_threads} hilos activos)",
            gpu_available=False,
            vram_gb=None,
            dtype="float32",
            model_id=self.model_id,
        )
        return "cpu", torch.float32, report

    def load_model(self) -> bool:
        if self.model is not None and self.tokenizer is not None:
            return True
        if self._load_attempted:
            return False

        self._load_attempted = True
        if not HAS_TORCH or not HAS_TRANSFORMERS:
            print("[TinyLLM] torch/transformers no disponibles. Heurística de respaldo.")
            return False

        try:
            print(f"[TinyLLM] Cargando '{self.model_id}' en {self.device.upper()}...")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                torch_dtype=self.torch_dtype,
                low_cpu_mem_usage=True,
            )
            self.model.to(self.device)
            self.model.eval()
            print(f"[TinyLLM] Modelo cargado en {self.device.upper()} ✓")
            return True
        except Exception as exc:
            print(f"[TinyLLM] No se pudo cargar el modelo ({exc}). Heurística.")
            self.model = None
            self.tokenizer = None
            return False

    @staticmethod
    def extract_raw_candidates(script_text: str) -> Dict[str, int]:
        lines = [l.strip() for l in script_text.replace("\r\n", "\n").split("\n")]
        counts: Dict[str, int] = {}

        inline_re = re.compile(
            r"^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9\s\.\-]{1,32}?)(?:\s*\([^)]+\))?\s*[:\.\-—]+\s+.+$"
        )
        standalone_re = re.compile(
            r"^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9\s\.\-]{1,32}?)(?:\s*\([^)]+\))?\s*:?$"
        )

        current_speaker: Optional[str] = None
        for line in lines:
            if not line:
                current_speaker = None
                continue

            inline_match = inline_re.match(line)
            if inline_match:
                cand = TinyLLMCharacterDetector._clean_cue(inline_match.group(1))
                if cand:
                    counts[cand] = counts.get(cand, 0) + 1
                current_speaker = None
                continue

            if line.isupper() and len(line) <= 40 and not line.isdigit():
                cue_match = standalone_re.match(line)
                if cue_match:
                    cand = TinyLLMCharacterDetector._clean_cue(cue_match.group(1))
                    if cand:
                        current_speaker = cand
                        counts.setdefault(cand, 0)
                        continue

            if current_speaker:
                counts[current_speaker] = counts.get(current_speaker, 0) + 1

        return {k: v for k, v in counts.items() if v > 0}

    @staticmethod
    def _clean_cue(raw: str) -> str:
        cleaned = re.sub(
            r"\((?:V\.?O\.?|O\.?S\.?|OFF|CONT'?D|CONTINÚA|VOZ|EN OFF)\)",
            "",
            raw,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"[:\.\-—]+$", "", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip().upper()
        if len(cleaned) < 2 or len(cleaned) > 35 or cleaned.isdigit():
            return ""
        return cleaned

    def detect_characters(self, script_text: str) -> CharacterDetectionResult:
        raw_counts = self.extract_raw_candidates(script_text)
        candidates = list(raw_counts.keys())

        if not candidates:
            return CharacterDetectionResult(
                characters=[],
                alias_map={},
                discarded=[],
                line_counts={},
                hardware=asdict(self.hw_report),
                used_tiny_llm=False,
            )

        pre_filtered: List[str] = []
        discarded: List[str] = []
        for cand in candidates:
            if self._is_obvious_non_character(cand):
                discarded.append(cand)
            else:
                pre_filtered.append(cand)

        used_llm = False
        alias_map: Dict[str, str] = {c: c for c in pre_filtered}

        if pre_filtered and self.load_model():
            llm_result = self._query_tiny_llm(pre_filtered)
            if llm_result is not None:
                used_llm = True
                llm_alias_map, llm_discarded = llm_result
                for d in llm_discarded:
                    if d not in discarded:
                        discarded.append(d)
                alias_map = {
                    k: v
                    for k, v in llm_alias_map.items()
                    if k not in discarded and v not in discarded
                }

        canonical_counts: Dict[str, int] = {}
        final_alias_map: Dict[str, str] = {}

        for cand in pre_filtered:
            if cand in discarded:
                continue
            canonical = alias_map.get(cand, cand).strip().upper()
            if not canonical or self._is_obvious_non_character(canonical):
                discarded.append(cand)
                continue
            final_alias_map[cand] = canonical
            canonical_counts[canonical] = canonical_counts.get(canonical, 0) + raw_counts.get(cand, 0)

        sorted_characters = sorted(
            canonical_counts.keys(), key=lambda k: canonical_counts[k], reverse=True
        )

        return CharacterDetectionResult(
            characters=sorted_characters,
            alias_map=final_alias_map,
            discarded=discarded,
            line_counts=canonical_counts,
            hardware=asdict(self.hw_report),
            used_tiny_llm=used_llm,
        )

    def calibrate_script_rules(self, sample_text: str) -> Dict[str, Any]:
        """Devuelve reglas compatibles con ScriptRulesSchema del frontend."""
        lines = [l.strip() for l in sample_text.replace("\r\n", "\n").split("\n") if l.strip()]
        inline_count = 0
        for line in lines[:150]:
            # Quitar prefijo [X=..] si viene del calibrador del frontend
            text = re.sub(r"^\[X=[^\]]+\]\s*", "", line)
            if re.match(
                r"^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜa-záéíóúñü0-9\s\.\-]{1,30}?(?:\s*\([^)]+\))?\s*(?::|\.-|[–—])\s*.+$",
                text,
            ):
                inline_count += 1

        usa_prefijo = inline_count >= 3
        return {
            "formatoDetectado": "teatro_hispano" if usa_prefijo else "cine_estandar",
            "xMinPersonaje": 0,
            "xMinDialogo": 4 if usa_prefijo else 12,
            "usaPrefijoEnLinea": usa_prefijo,
            "aliasPersonajes": {},
        }

    def hardware_status(self) -> Dict[str, object]:
        return asdict(self.hw_report)

    @staticmethod
    def _is_obvious_non_character(name: str) -> bool:
        if name in STAGE_DIRECTION_BLACKLIST:
            return True
        if re.match(r"^(?:ACTO|ESCENA|CUADRO|INT\.|EXT\.|PÁGINA|PAGINA|CAPÍTULO|CAPITULO)\b", name):
            return True
        return False

    def _query_tiny_llm(
        self, candidates: List[str]
    ) -> Optional[Tuple[Dict[str, str], List[str]]]:
        system_prompt = (
            "Eres un analizador experto de guiones teatrales en español. "
            "Recibirás una lista de textos en mayúsculas extraídos de un libreto. "
            "Identifica cuáles son nombres de personajes reales, unifica variantes del mismo personaje "
            "y descarta textos que sean acotaciones o encabezados. "
            "Responde ÚNICAMENTE con un objeto JSON válido con las claves "
            "'alias_map' (objeto {nombre_original: nombre_canonico}) y 'discarded' (lista de strings)."
        )
        user_prompt = f"Candidatos detectados: {json.dumps(candidates, ensure_ascii=False)}"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            prompt_text = self.tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            inputs = self.tokenizer(prompt_text, return_tensors="pt").to(self.device)

            with torch.no_grad():
                output_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=256,
                    do_sample=False,
                    pad_token_id=self.tokenizer.eos_token_id,
                )

            generated_ids = output_ids[0][inputs.input_ids.shape[1]:]
            response_text = self.tokenizer.decode(generated_ids, skip_special_tokens=True).strip()

            json_match = re.search(r"\{.*\}", response_text, flags=re.DOTALL)
            if not json_match:
                return None

            parsed = json.loads(json_match.group(0))
            raw_map = parsed.get("alias_map", {})
            raw_discarded = parsed.get("discarded", [])

            clean_map: Dict[str, str] = {}
            for cand in candidates:
                mapped = raw_map.get(cand, cand)
                if isinstance(mapped, str) and mapped.strip():
                    clean_map[cand] = mapped.strip().upper()
                else:
                    clean_map[cand] = cand

            clean_discarded = [
                str(d).strip().upper() for d in raw_discarded if isinstance(d, str)
            ]
            return clean_map, clean_discarded
        except Exception as exc:
            print(f"[TinyLLM] Error durante la inferencia: {exc}")
            return None


_detector: Optional[TinyLLMCharacterDetector] = None


def get_detector() -> TinyLLMCharacterDetector:
    global _detector
    if _detector is None:
        _detector = TinyLLMCharacterDetector()
    return _detector
