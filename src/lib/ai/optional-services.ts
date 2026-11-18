/**
 * URLs opcionales de servicios locales.
 * Si no están definidas, no se hace fetch a localhost (p. ej. Railway / Chrome PNA).
 */

function readEnv(name: string): string | null {
  try {
    const value = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[
      name
    ];
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed || null;
  } catch {
    return null;
  }
}

/** Ollama local. Solo si VITE_OLLAMA_URL está definida. */
export function getOllamaUrl(): string | null {
  return readEnv("VITE_OLLAMA_URL");
}

/**
 * Backend FastAPI teleprompter / TinyLLM.
 * Preferimos VITE_TELEPROMPTER_URL; aceptamos VITE_TELEPROMPTER_API_URL por compatibilidad.
 */
export function getTeleprompterUrl(): string | null {
  return readEnv("VITE_TELEPROMPTER_URL") ?? readEnv("VITE_TELEPROMPTER_API_URL");
}
