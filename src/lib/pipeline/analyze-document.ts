import { analyze } from "@/lib/analysis/analyze";
import type { LlmProvider } from "@/lib/llm/types";
import { extractPages, type Page } from "@/lib/pdf/extract";
import { segment, type Clause } from "@/lib/segment/segment";
import { verifyAnalysis, type DropReason, type VerifiedAnalysis } from "@/lib/verify/verify";

/** What the browser receives. Contains the document text, so it is never stored server-side. */
export type AnalyzeResponse = {
  model: string;
  /** Full page text. quote offsets (start, end) index into these. */
  pages: Page[];
  clauses: Clause[];
  /** false when no numbered headings were found and we fell back to size chunks. */
  structured: boolean;
  keyTerms: VerifiedAnalysis["keyTerms"];
  flags: VerifiedAnalysis["flags"];
  /** Counts only. The dropped quotes themselves stay on the server and are not returned. */
  droppedByReason: Partial<Record<DropReason, number>>;
  stats: VerifiedAnalysis["stats"];
  usage: { inputTokens: number; outputTokens: number; latencyMs: number };
};

/** PDF bytes in, verified analysis out. Everything stays in memory. */
export async function analyzeDocument(provider: LlmProvider, pdf: Uint8Array): Promise<AnalyzeResponse> {
  const { pages } = await extractPages(pdf);
  const { clauses, structured } = segment(pages);
  const raw = await analyze(provider, clauses);
  const verified = verifyAnalysis(raw, clauses);

  const droppedByReason: AnalyzeResponse["droppedByReason"] = {};
  for (const d of verified.dropped) droppedByReason[d.reason] = (droppedByReason[d.reason] ?? 0) + 1;

  const a = raw.stats.keyTerms;
  const b = raw.stats.flags;
  return {
    model: raw.model,
    pages,
    clauses,
    structured,
    keyTerms: verified.keyTerms,
    flags: verified.flags,
    droppedByReason,
    stats: verified.stats,
    usage: {
      inputTokens: a.inputTokens + b.inputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
      latencyMs: a.latencyMs + b.latencyMs,
    },
  };
}
