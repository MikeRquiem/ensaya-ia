/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REQUIRE_AUTH?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  /** Opcional. Backend FastAPI teleprompter / TinyLLM. */
  readonly VITE_TELEPROMPTER_URL?: string;
  /** Compatibilidad con el nombre anterior. */
  readonly VITE_TELEPROMPTER_API_URL?: string;
  /** Opcional. Ollama local para calibrar formato. */
  readonly VITE_OLLAMA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
