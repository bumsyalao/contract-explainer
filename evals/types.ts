import type { AnalyzeResponse, AskResponse } from "../src/lib/api/types";

export type QaRecord = {
  question: string;
  result: AskResponse | null;
  /** Set when the call failed (for example a rate limit). Not counted as a wrong answer. */
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

/** One model run on one contract, as saved by evals/run.ts. */
export type RunRecord = {
  contractId: string;
  /** Provider id, for example groq-large. */
  provider: string;
  /** Exact model id. */
  model: string;
  ok: boolean;
  error: string | null;
  analysis: AnalyzeResponse | null;
  qa: QaRecord[];
  ranAt: string;
};
