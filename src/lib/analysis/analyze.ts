import type { z } from "zod";
import { withRetry } from "@/lib/llm/retry";
import type { LlmProvider } from "@/lib/llm/types";
import type { Clause } from "@/lib/segment/segment";
import { estimateTokens, KEY_TERMS_SYSTEM, renderDocument, RISK_FLAGS_SYSTEM } from "./prompts";
import {
  KeyTermsSchema,
  RiskFlagsSchema,
  toProviderSchema,
  type KeyTerms,
  type RiskFlags,
} from "./schemas";

/**
 * Free-tier budget guard. Groq's free models allow about 8K tokens per minute
 * and we make two calls, each carrying the whole document. This is a starting
 * guess to tune after live runs, not a documented limit.
 */
export const MAX_DOCUMENT_TOKENS = 3000;

export class DocumentTooLongError extends Error {
  constructor(public estimatedTokens: number) {
    super("This contract is too long for the free model limits. Try a shorter one or fewer pages.");
    this.name = "DocumentTooLongError";
  }
}

export class InvalidModelOutputError extends Error {
  constructor(
    message: string,
    public issues: string[],
  ) {
    super(message);
    this.name = "InvalidModelOutputError";
  }
}

export type CallStats = { inputTokens: number; outputTokens: number; latencyMs: number };

export type RawAnalysis = {
  keyTerms: KeyTerms;
  flags: RiskFlags;
  model: string;
  stats: { keyTerms: CallStats; flags: CallStats };
};

async function callAndParse<T>(
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

/**
 * Two sequential calls: key terms, then risk flags. Sequential on purpose, so
 * we do not burst through the per-minute token limit. The output is NOT yet
 * verified: run the verifier before showing anything to a user.
 */
export async function analyze(provider: LlmProvider, clauses: Clause[]): Promise<RawAnalysis> {
  const prompt = renderDocument(clauses);
  const estimated = estimateTokens(prompt);
  if (estimated > MAX_DOCUMENT_TOKENS) throw new DocumentTooLongError(estimated);

  const keyTerms = await callAndParse(provider, KEY_TERMS_SYSTEM, prompt, KeyTermsSchema);
  const flags = await callAndParse(provider, RISK_FLAGS_SYSTEM, prompt, RiskFlagsSchema);

  return {
    keyTerms: keyTerms.data,
    flags: flags.data,
    model: provider.model,
    stats: { keyTerms: keyTerms.stats, flags: flags.stats },
  };
}
