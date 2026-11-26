import type { AnalyzeResponse, ApiErrorCode, AskResponse, SampleResponse } from "@/lib/api/types";
import type { Page } from "@/lib/pdf/pages";
import type { Clause } from "@/lib/segment/segment";

/** Matches the server limit. Duplicated on purpose so server code stays out of the browser bundle. */
export const MAX_UPLOAD_MB = 4;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: ApiErrorCode | "NETWORK",
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: { error?: { code?: ApiErrorCode; message?: string; retryAfterSeconds?: number } } = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  throw new ApiClientError(
    body.error?.message ?? "Something went wrong. Please try again.",
    body.error?.code ?? "INTERNAL",
    body.error?.retryAfterSeconds,
  );
}

async function send(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiClientError("Could not reach the server. Check your connection and try again.", "NETWORK");
  }
}

/** Checks we can do before uploading, so people get an instant answer. */
export function checkFile(file: File): string | null {
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) return "Please choose a PDF file.";
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `That file is larger than ${MAX_UPLOAD_MB} MB. Try a smaller PDF.`;
  return null;
}

/**
 * Send already-redacted text pages for analysis. The original PDF and the original text never
 * leave the browser: only the pages passed here are sent.
 */
export async function analyzeText(pages: Page[]): Promise<AnalyzeResponse> {
  return parse<AnalyzeResponse>(
    await send("/api/analyze-text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pages }),
    }),
  );
}

export async function loadSample(): Promise<SampleResponse> {
  return parse<SampleResponse>(await send("/api/sample"));
}

export async function askQuestion(question: string, clauses: Clause[]): Promise<AskResponse> {
  return parse<AskResponse>(
    await send("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, clauses }),
    }),
  );
}
