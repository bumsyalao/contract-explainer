import type { LlmProvider } from "@/lib/llm/types";
import { guardClauses } from "@/lib/safety/ai-directed";
import type { Clause } from "@/lib/segment/segment";
import { callAndParse, type CallStats } from "./call";
import { normalizeClauseId } from "./clause-id";
import { estimateTokens, KEY_TERMS_SYSTEM, renderDocument, RISK_FLAGS_SYSTEM } from "./prompts";
import {
  KeyTermsSchema,
  RiskFlagsSchema,
  type KeyTerms,
  type RiskFlags,
} from "./schemas";

/**
 * Free-tier budget guard. Groq's free models allow about 8K tokens per minute
 * and we make two calls, each carrying the whole document. Measured on the
 * 3-page sample (estimate 916 tokens): about 5K tokens per run, of which roughly
 * 2.4K is output and 0.5K per call is prompt overhead. Output grows with the
 * number of flags, so we keep headroom: 2000 estimated document tokens is
 * about 7 pages of plain text. Tune after more live runs.
 */
export const MAX_DOCUMENT_TOKENS = 2000;

export class DocumentTooLongError extends Error {
  constructor(public estimatedTokens: number) {
    super("This contract is too long for the free model limits. Try a shorter one or fewer pages.");
    this.name = "DocumentTooLongError";
  }
}

export type { CallStats };
export { InvalidModelOutputError } from "./call";

export type RawAnalysis = {
  keyTerms: KeyTerms;
  flags: RiskFlags;
  model: string;
  stats: { keyTerms: CallStats; flags: CallStats };
};

/**
 * Two sequential calls: key terms, then risk flags. Sequential on purpose, so
 * we do not burst through the per-minute token limit. The output is NOT yet
 * verified: run the verifier before showing anything to a user.
 */
export async function analyze(provider: LlmProvider, clauses: Clause[]): Promise<RawAnalysis> {
  // The model reads a copy with AI-directed text replaced by a placeholder. Callers keep
  // verifying against the original clauses, so nothing planted can be cited.
  const prompt = renderDocument(guardClauses(clauses).masked);
  const estimated = estimateTokens(prompt);
  if (estimated > MAX_DOCUMENT_TOKENS) throw new DocumentTooLongError(estimated);

  const keyTerms = await callAndParse(provider, KEY_TERMS_SYSTEM, prompt, KeyTermsSchema);
  const flags = await callAndParse(provider, RISK_FLAGS_SYSTEM, prompt, RiskFlagsSchema);

  // Models sometimes return the whole "[clause 2 | page 1]" label. Keep just the id.
  const cleanKeyTerms: KeyTerms = {
    ...keyTerms.data,
    key_terms: keyTerms.data.key_terms.map((t) => ({ ...t, clause_id: normalizeClauseId(t.clause_id) })),
  };
  const cleanFlags: RiskFlags = {
    flags: flags.data.flags.map((f) => ({ ...f, clause_id: normalizeClauseId(f.clause_id) })),
  };

  return {
    keyTerms: cleanKeyTerms,
    flags: cleanFlags,
    model: provider.model,
    stats: { keyTerms: keyTerms.stats, flags: flags.stats },
  };
}
