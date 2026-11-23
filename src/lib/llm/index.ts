import { GeminiProvider } from "./gemini";
import { GroqProvider, type GroqOptions } from "./groq";
import type { LlmProvider } from "./types";

export * from "./types";
export { withRetry } from "./retry";

/** Labels used in the UI, logs and the eval table. */
export type ProviderId =
  | "groq-large"
  | "groq-small"
  | "groq-compare"
  | "gemini-flash"
  | "gemini-lite"
  | "gemini-compare";

const MODEL_ENV: Record<ProviderId, string> = {
  "groq-large": "GROQ_MODEL_LARGE",
  "groq-small": "GROQ_MODEL_SMALL",
  "groq-compare": "GROQ_MODEL_COMPARE",
  "gemini-flash": "GEMINI_MODEL",
  "gemini-lite": "GEMINI_LITE_MODEL",
  "gemini-compare": "GEMINI_COMPARE_MODEL",
};

/** Server-side only. Reads keys from the environment, never from the client. */
export function createProvider(id: ProviderId, env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const model = env[MODEL_ENV[id]] ?? "";
  if (id.startsWith("groq")) {
    // All three configured Groq models support strict constrained decoding.
    // gpt-oss models spend many hidden reasoning tokens by default, which eat the
    // free-tier token budget, so we default them to low effort.
    const isGptOss = model.startsWith("openai/gpt-oss");
    const effort = (env.GROQ_REASONING_EFFORT || (isGptOss ? "low" : "")) as GroqOptions["reasoningEffort"] | "";
    return new GroqProvider({
      name: id,
      model,
      apiKey: env.GROQ_API_KEY ?? "",
      strict: true,
      ...(effort ? { reasoningEffort: effort } : {}),
    });
  }
  return new GeminiProvider({ name: id, model, apiKey: env.GOOGLE_API_KEY ?? "" });
}

/** The provider used when none is chosen. */
export const DEFAULT_PROVIDER: ProviderId = "groq-large";
