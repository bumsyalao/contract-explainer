// Type-only re-exports, safe to import from browser code (no server modules are bundled).
export type { ApiErrorBody, ApiErrorCode } from "./errors";
export type { AnalyzeResponse } from "@/lib/pipeline/analyze-document";
import type { AnalyzeResponse } from "@/lib/pipeline/analyze-document";
import type { Location } from "@/lib/verify/verify";

export type Citation = { quote: string } & Location;

/** What /api/ask returns (token stats are not sent to the browser). */
export type AskResponse =
  | { status: "answered"; answer: string; citations: Citation[]; unverified_citations: number }
  | { status: "not_found"; reason: "document_does_not_say" | "no_verified_citation" };

/** What /api/sample returns. */
export type SampleResponse = {
  generatedWith: string;
  analysis: AnalyzeResponse;
  qa: { question: string; result: AskResponse }[];
};
