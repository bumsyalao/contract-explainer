import { describe, expect, it } from "vitest";
import { DocumentTooLongError } from "@/lib/analysis/analyze";
import { InvalidModelOutputError } from "@/lib/analysis/call";
import { InvalidJsonError, ProviderError, RateLimitError } from "@/lib/llm/types";
import { ExtractError } from "@/lib/pdf/extract";
import { QuestionError } from "@/lib/qa/answer";
import { BadRequestError, describeForLog, toApiError } from "./errors";

const code = (e: unknown) => toApiError(e).body.error.code;
const status = (e: unknown) => toApiError(e).status;

describe("toApiError", () => {
  it("maps extraction problems to clear 4xx errors", () => {
    expect([status(new ExtractError("SCANNED_PDF", "x")), code(new ExtractError("SCANNED_PDF", "x"))]).toEqual([422, "SCANNED_PDF"]);
    expect([status(new ExtractError("TOO_LARGE", "x")), code(new ExtractError("TOO_LARGE", "x"))]).toEqual([413, "FILE_TOO_LARGE"]);
    expect(code(new ExtractError("TOO_MANY_PAGES", "x"))).toBe("TOO_MANY_PAGES");
    expect(code(new ExtractError("NOT_A_PDF", "x"))).toBe("NOT_A_PDF");
  });

  it("maps size and input errors", () => {
    expect([status(new DocumentTooLongError(9999)), code(new DocumentTooLongError(9999))]).toEqual([413, "DOCUMENT_TOO_LONG"]);
    expect([status(new QuestionError("q")), code(new QuestionError("q"))]).toEqual([400, "BAD_QUESTION"]);
    expect([status(new BadRequestError("b")), code(new BadRequestError("b"))]).toEqual([400, "BAD_REQUEST"]);
    expect([status(new BadRequestError("b", "FILE_TOO_LARGE")), code(new BadRequestError("b", "FILE_TOO_LARGE"))]).toEqual([413, "FILE_TOO_LARGE"]);
  });

  it("gives a wait time for short rate limits", () => {
    const r = toApiError(new RateLimitError("429", 7200));
    expect(r.status).toBe(429);
    expect(r.body.error).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 8 });
    expect(r.body.error.message).toContain("8 seconds");
  });

  it("explains a daily limit when the wait is very long", () => {
    const r = toApiError(new RateLimitError("429", 3 * 60 * 60 * 1000));
    expect(r.body.error.message).toContain("daily limit");
    expect(r.body.error.message).toContain("sample");
  });

  it("handles a rate limit with no wait time", () => {
    const r = toApiError(new RateLimitError("429"));
    expect(r.status).toBe(429);
    expect(r.body.error.retryAfterSeconds).toBeUndefined();
  });

  it("maps bad model output to 502 with a retry message", () => {
    expect([status(new InvalidModelOutputError("x", ["a"])), code(new InvalidModelOutputError("x", ["a"]))]).toEqual([502, "MODEL_OUTPUT_INVALID"]);
    expect(code(new InvalidJsonError("x", "raw"))).toBe("MODEL_OUTPUT_INVALID");
  });

  it("maps provider errors, and 413 to document too long", () => {
    expect(code(new ProviderError("x", 500))).toBe("MODEL_UNAVAILABLE");
    expect([status(new ProviderError("x", 413)), code(new ProviderError("x", 413))]).toEqual([413, "DOCUMENT_TOO_LONG"]);
  });

  it("hides unknown errors behind a generic message", () => {
    const r = toApiError(new Error("GROQ_API_KEY is not set, token gsk_abc, CONTRACT TEXT"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/GROQ|gsk_|CONTRACT/);
  });

  it("never forwards an upstream message", () => {
    const r = toApiError(new ProviderError("echo CONTRACT TEXT SECRET", 502));
    expect(JSON.stringify(r.body)).not.toContain("CONTRACT TEXT");
  });
});

describe("describeForLog", () => {
  it("logs names and codes, never messages", () => {
    expect(describeForLog(new ExtractError("SCANNED_PDF", "contract words"))).toBe("ExtractError:SCANNED_PDF");
    expect(describeForLog(new ProviderError("secret", 429))).toBe("ProviderError:429");
    expect(describeForLog(new Error("secret"))).toBe("Error");
    expect(describeForLog("weird")).toBe("UnknownError");
  });
});
