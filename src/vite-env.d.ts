/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
  readonly VITE_TELEGRAM_BOT_USERNAME: string;
  readonly GEMINI_API_KEY?: string; // Assuming GEMINI_API_KEY might also be VITE_ prefixed or directly accessed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}