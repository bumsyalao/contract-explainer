import { GeminiProvider } from "./gemini";
import type { LlmProvider } from "./types";

export * from "./types";
export { withRetry } from "./retry";

/** Labels used in the UI, logs and the eval table. */
export type ProviderId = "gemini-flash" | "gemini-lite" | "gemini-compare";

const MODEL_ENV: Record<ProviderId, string> = {
  "gemini-flash": "GEMINI_MODEL",
  "gemini-lite": "GEMINI_LITE_MODEL",
  "gemini-compare": "GEMINI_COMPARE_MODEL",
};

/** Server-side only. Reads the key from the environment, never from the client. */
export function createProvider(id: ProviderId, env: NodeJS.ProcessEnv = process.env): LlmProvider {
  return new GeminiProvider({
    name: id,
    model: env[MODEL_ENV[id]] ?? "",
    apiKey: env.GOOGLE_API_KEY ?? "",
  });
}
