import { DocumentTooLongError } from "@/lib/analysis/analyze";
import { InvalidModelOutputError } from "@/lib/analysis/call";
import { InvalidJsonError, ProviderError, RateLimitError } from "@/lib/llm/types";
import { ExtractError } from "@/lib/pdf/extract";
import { QuestionError } from "@/lib/qa/answer";

export type ApiErrorCode =
  | "FILE_TOO_LARGE"
  | "TOO_MANY_PAGES"
  | "NOT_A_PDF"
  | "SCANNED_PDF"
  | "DOCUMENT_TOO_LONG"
  | "BAD_REQUEST"
  | "BAD_QUESTION"
  | "RATE_LIMITED"
  | "MODEL_OUTPUT_INVALID"
  | "MODEL_UNAVAILABLE"
  | "INTERNAL";

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string; retryAfterSeconds?: number };
};

export class BadRequestError extends Error {
  constructor(
    message: string,
    public code: "BAD_REQUEST" | "FILE_TOO_LARGE" = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "BadRequestError";
  }
}

/**
 * Turn any error into a safe, friendly response. Messages here are written by us:
 * we never forward an upstream message, because those can echo the contract.
 */
export function toApiError(err: unknown): { status: number; body: ApiErrorBody } {
  const make = (status: number, code: ApiErrorCode, message: string, retryAfterSeconds?: number) => ({
    status,
    body: { error: { code, message, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) } },
  });

  if (err instanceof BadRequestError) return make(err.code === "FILE_TOO_LARGE" ? 413 : 400, err.code, err.message);
  if (err instanceof ExtractError) {
    const map = {
      TOO_LARGE: [413, "FILE_TOO_LARGE"],
      TOO_MANY_PAGES: [422, "TOO_MANY_PAGES"],
      NOT_A_PDF: [422, "NOT_A_PDF"],
      SCANNED_PDF: [422, "SCANNED_PDF"],
      EMPTY: [422, "NOT_A_PDF"],
    } as const;
    const [status, code] = map[err.code];
    return make(status, code, err.message);
  }
  if (err instanceof DocumentTooLongError) return make(413, "DOCUMENT_TOO_LONG", err.message);
  if (err instanceof QuestionError) return make(400, "BAD_QUESTION", err.message);
  if (err instanceof RateLimitError) {
    const secs = err.retryAfterMs !== undefined ? Math.max(1, Math.ceil(err.retryAfterMs / 1000)) : undefined;
    const message =
      secs === undefined
        ? "The free AI model is busy. Please try again in a minute."
        : secs <= 120
          ? `The free AI model is busy. Please try again in about ${secs} seconds.`
          : "The free AI model has hit its daily limit. Please try again later, or use the sample contract.";
    return make(429, "RATE_LIMITED", message, secs);
  }
  if (err instanceof InvalidModelOutputError || err instanceof InvalidJsonError) {
    return make(502, "MODEL_OUTPUT_INVALID", "The AI model gave an answer we could not use. Please try again.");
  }
  if (err instanceof ProviderError) {
    if (err.status === 413) return make(413, "DOCUMENT_TOO_LONG", err.message);
    return make(502, "MODEL_UNAVAILABLE", "The AI model could not be reached right now. Please try again.");
  }
  return make(500, "INTERNAL", "Something went wrong on our side. Please try again.");
}

/** Safe to log: names and codes only, never messages or contract text. */
export function describeForLog(err: unknown): string {
  if (err instanceof ExtractError) return `ExtractError:${err.code}`;
  if (err instanceof ProviderError) return `ProviderError:${err.status ?? "none"}`;
  return err instanceof Error ? err.name : "UnknownError";
}
