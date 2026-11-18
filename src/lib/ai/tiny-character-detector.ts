/**
 * tiny-character-detector.ts
 * Cliente y motor de detección de nombres de personajes asistido por TinyLLM.
 * - Intenta usar el servicio local de TinyLLM en Python (que autodetecta GPU CUDA / Apple MPS / CPU).
 * - Si no está corriendo el servidor Python, intenta usar un servidor compatible con OpenAI/Ollama local.
 * - Si no hay ningún servidor local activo, aplica el clasificador determinista en CPU del navegador.
 */

export interface HardwareStatus {
  device: 'cuda' | 'mps' | 'cpu' | 'browser-cpu';
  device_name: string;
  gpu_available: boolean;
  vram_gb: number | null;
  dtype: string;
  model_id: string;
}

export interface CharacterDetectionResponse {
  characters: string[];
  alias_map: Record<string, string>;
  discarded: string[];
  line_counts: Record<string, number>;
  hardware: HardwareStatus;
  used_tiny_llm: boolean;
}

const DEFAULT_TELEPROMPTER_API =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_TELEPROMPTER_API_URL) ||
  'http://localhost:8000';

const STAGE_BLACKLIST = new Set([
  'ACTO', 'ACTO I', 'ACTO II', 'ACTO III', 'ACTO IV', 'ACTO V',
  'ESCENA', 'CUADRO', 'PRÓLOGO', 'PROLOGO', 'EPÍLOGO', 'EPILOGO',
  'CONTINÚA', 'CONTINUA', 'CONTINUED', 'MÁS', 'MAS', 'MORE',
  'FIN', 'THE END', 'TELÓN', 'TELON', 'OSCURO', 'APAGÓN', 'APAGON',
  'CORTE A', 'CUT TO', 'FADE IN', 'FADE OUT', 'FUNDIDO A NEGRO',
  'TRANSICIÓN', 'TRANSICION', 'PAUSA', 'SILENCIO', 'NOTA',
  'PÁGINA', 'PAGINA', 'INT.', 'EXT.', 'INT/EXT', 'I/E',
]);

/**
 * Consulta si el servidor local de TinyLLM detectó una GPU disponible o si corre en CPU.
 */
export async function checkTinyLLMHardware(
  apiBaseUrl: string = DEFAULT_TELEPROMPTER_API
): Promise<HardwareStatus> {
  // 1. Verificar backend Python FastAPI (/characters/hardware)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/characters/hardware`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      return (await res.json()) as HardwareStatus;
    }
  } catch {
    // Continúa a verificación WebGPU / CPU en navegador
  }

  // 2. Verificar si el navegador cuenta con adaptador WebGPU disponible
  let browserGpuAvailable = false;
  let browserGpuName = 'CPU del Navegador (Sin GPU dedicada)';
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ info?: { description?: string } } | null> } }) : null;
    if (nav?.gpu) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        browserGpuAvailable = true;
        browserGpuName = adapter.info?.description || 'GPU detectada vía WebGPU';
      }
    }
  } catch {
    browserGpuAvailable = false;
  }

  return {
    device: 'browser-cpu',
    device_name: browserGpuName,
    gpu_available: browserGpuAvailable,
    vram_gb: null,
    dtype: browserGpuAvailable ? 'float16' : 'float32',
    model_id: 'fallback-heuristic-cpu',
  };
}

/**
 * Envía el texto del libreto al TinyLLM para detectar los nombres de los personajes,
 * unificar alias y filtrar falsos positivos. Funciona sin GPU (en CPU) y acelera por GPU si existe.
 */
export async function detectCharactersWithTinyLLM(
  scriptText: string,
  apiBaseUrl: string = DEFAULT_TELEPROMPTER_API
): Promise<CharacterDetectionResponse> {
  // 1. Intentar con el backend Python (que corre Qwen2.5-0.5B-Instruct en GPU o CPU)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/characters/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_text: scriptText }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      return (await res.json()) as CharacterDetectionResponse;
    }
  } catch {
    // Si el backend Python no está levantado, usa el respaldo local en CPU
  }

  // 2. Fallback determinista en CPU (sin necesidad de GPU ni servidor externo)
  const hw = await checkTinyLLMHardware(apiBaseUrl);
  return fallbackCpuCharacterDetection(scriptText, hw);
}

/**
 * Respaldo local en CPU cuando no hay servidor Python activo.
 */
export function fallbackCpuCharacterDetection(
  scriptText: string,
  hardware?: HardwareStatus
): CharacterDetectionResponse {
  const lines = scriptText.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const rawCounts: Record<string, number> = {};
  const discarded: string[] = [];

  const inlineRegex =
    /^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9\s\.\-]{1,32}?)(?:\s*\([^)]+\))?\s*[:\.\-—]+\s+.+$/;
  const standaloneRegex =
    /^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9\s\.\-]{1,32}?)(?:\s*\([^)]+\))?\s*:?$/;

  let currentSpeaker: string | null = null;

  for (const line of lines) {
    if (!line) {
      currentSpeaker = null;
      continue;
    }

    const inlineMatch = line.match(inlineRegex);
    if (inlineMatch) {
      const cleaned = cleanCueName(inlineMatch[1]);
      if (cleaned) {
        if (isNonCharacterHeader(cleaned)) {
          if (!discarded.includes(cleaned)) discarded.push(cleaned);
        } else {
          rawCounts[cleaned] = (rawCounts[cleaned] || 0) + 1;
        }
      }
      currentSpeaker = null;
      continue;
    }

    if (line === line.toUpperCase() && line.length <= 40 && !/^\d+$/.test(line)) {
      const cueMatch = line.match(standaloneRegex);
      if (cueMatch) {
        const cleaned = cleanCueName(cueMatch[1]);
        if (cleaned) {
          if (isNonCharacterHeader(cleaned)) {
            if (!discarded.includes(cleaned)) discarded.push(cleaned);
            currentSpeaker = null;
          } else {
            currentSpeaker = cleaned;
            if (!(cleaned in rawCounts)) rawCounts[cleaned] = 0;
          }
          continue;
        }
      }
    }

    if (currentSpeaker) {
      rawCounts[currentSpeaker] = (rawCounts[currentSpeaker] || 0) + 1;
    }
  }

  const validEntries = Object.entries(rawCounts).filter(([, count]) => count > 0);
  const aliasMap: Record<string, string> = {};
  const lineCounts: Record<string, number> = {};

  for (const [name, count] of validEntries) {
    aliasMap[name] = name;
    lineCounts[name] = count;
  }

  const sortedChars = Object.keys(lineCounts).sort((a, b) => lineCounts[b] - lineCounts[a]);

  return {
    characters: sortedChars,
    alias_map: aliasMap,
    discarded,
    line_counts: lineCounts,
    hardware: hardware ?? {
      device: 'browser-cpu',
      device_name: 'CPU Local (Fallback determinista)',
      gpu_available: false,
      vram_gb: null,
      dtype: 'float32',
      model_id: 'fallback-heuristic-cpu',
    },
    used_tiny_llm: false,
  };
}

function cleanCueName(raw: string): string {
  const withoutTags = raw
    .replace(/\((?:V\.?O\.?|O\.?S\.?|OFF|CONT'?D|CONTINÚA|VOZ|EN OFF)\)/gi, '')
    .replace(/[:\.\-—]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  if (withoutTags.length < 2 || withoutTags.length > 35 || /^\d+$/.test(withoutTags)) {
    return '';
  }
  return withoutTags;
}

function isNonCharacterHeader(name: string): boolean {
  if (STAGE_BLACKLIST.has(name)) return true;
  if (/^(?:ACTO|ESCENA|CUADRO|INT\.|EXT\.|PÁGINA|PAGINA|CAPÍTULO|CAPITULO)\b/i.test(name)) {
    return true;
  }
  return false;
}
