import type { z } from "zod";
import { withRetry } from "@/lib/llm/retry";
import type { LlmProvider } from "@/lib/llm/types";
import { toProviderSchema } from "./schemas";

export type CallStats = { inputTokens: number; outputTokens: number; latencyMs: number };

export class InvalidModelOutputError extends Error {
  constructor(
    message: string,
    public issues: string[],
  ) {
    super(message);
    this.name = "InvalidModelOutputError";
  }
}

/** One model call with 429 retry, then runtime validation against our own schema. */
export async function callAndParse<T>(
  provider: LlmProvider,
  system: string,
  prompt: string,
  schema: z.ZodType<T>,
): Promise<{ data: T; stats: CallStats }> {
  const result = await withRetry(() =>
    provider.generate({ system, prompt, schema: toProviderSchema(schema), temperature: 0 }),
  );
  // Even with strict decoding, validate. Other providers are only best effort.
  const parsed = schema.safeParse(result.json);
  if (!parsed.success) {
    throw new InvalidModelOutputError(
      "The model answer did not match the expected format.",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  return {
    data: parsed.data,
    stats: { ...result.usage, latencyMs: result.latencyMs },
  };
}
