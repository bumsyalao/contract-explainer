import { z } from "zod";
import { MAX_PAGES, MAX_BYTES } from "@/lib/pdf/pages";
import type { LlmProvider } from "@/lib/llm/types";
import { answerQuestion, validateQuestion } from "@/lib/qa/answer";
import { isVerdictQuestion } from "@/lib/qa/verdict";
import { MAX_QUESTION_CHARS } from "@/lib/qa/prompts";
import { analyzeDocument, analyzeText } from "@/lib/pipeline/analyze-document";
import { assertReadablePages } from "@/lib/pdf/pages";
import { BadRequestError, describeForLog, LiveDisabledError, toApiError } from "./errors";
import { isLiveEnabled } from "./live";

const JSON_HEADERS = { "Cache-Control": "no-store" };

function errorResponse(err: unknown): Response {
  const { status, body } = toApiError(err);
  // Names and codes only. Never log messages or contract text.
  console.error(`[api] ${describeForLog(err)}`);
  return Response.json(body, { status, headers: JSON_HEADERS });
}

/** Multipart overhead allowance on top of the PDF size cap. */
const MULTIPART_SLACK_BYTES = 64 * 1024;

export async function handleAnalyze(
  req: Request,
  getProvider: () => LlmProvider,
  live: () => boolean = isLiveEnabled,
): Promise<Response> {
  try {
    if (!live()) throw new LiveDisabledError();
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES + MULTIPART_SLACK_BYTES) {
      throw new BadRequestError(`That file is larger than ${MAX_BYTES / 1024 / 1024} MB. Try a smaller PDF.`, "FILE_TOO_LARGE");
    }

    let file: FormDataEntryValue | null;
    try {
      file = (await req.formData()).get("file");
    } catch {
      throw new BadRequestError("Please upload a PDF file.");
    }
    if (!(file instanceof File)) throw new BadRequestError("Please upload a PDF file.");

    // Read into memory only. Nothing is written to disk or kept after the response.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await analyzeDocument(getProvider(), bytes);
    return Response.json(result, { headers: JSON_HEADERS });
  } catch (err) {
    return errorResponse(err);
  }
}

/** The browser sends the clauses back with each question, because the server stores nothing. */
const AskBodySchema = z.object({
  question: z.string(),
  clauses: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        page: z.number().int().min(1).max(MAX_PAGES),
        start: z.number().int().min(0),
        end: z.number().int().min(0),
        text: z.string().min(1).max(20_000),
      }),
    )
    .min(1)
    .max(300),
});

const MAX_ASK_BODY_BYTES = 256 * 1024;

export async function handleAsk(
  req: Request,
  getProvider: () => LlmProvider,
  live: () => boolean = isLiveEnabled,
): Promise<Response> {
  try {
    if (!live()) throw new LiveDisabledError();
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_ASK_BODY_BYTES) throw new BadRequestError("That request is too large.");
    const text = await req.text();
    if (text.length > MAX_ASK_BODY_BYTES) throw new BadRequestError("That request is too large.");

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new BadRequestError("Please send a question and the document clauses as JSON.");
    }
    const parsed = AskBodySchema.safeParse(json);
    if (!parsed.success) throw new BadRequestError("Please send a question and the document clauses as JSON.");
    if (parsed.data.question.length > MAX_QUESTION_CHARS * 4) {
      // Cheap early guard. answerQuestion applies the exact limit.
      throw new BadRequestError(`Please keep the question under ${MAX_QUESTION_CHARS} characters.`);
    }

    // Decline a verdict question before anything else, so it needs no model, no key and no quota.
    const question = validateQuestion(parsed.data.question);
    if (isVerdictQuestion(question)) {
      return Response.json({ status: "declined", reason: "overall_verdict" }, { headers: JSON_HEADERS });
    }

    const result = await answerQuestion(getProvider(), parsed.data.clauses, question);
    // Do not send token stats to the browser.
    const { stats: _stats, ...publicResult } = result;
    void _stats;
    return Response.json(publicResult, { headers: JSON_HEADERS });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Text pages, already redacted in the browser. The original PDF never reaches the server on
 * this path. Pages must be numbered 1, 2, 3 and so on, and are trimmed here so the pages we
 * analyse are exactly the pages we send back.
 */
const AnalyzeTextBodySchema = z.object({
  pages: z
    .array(z.object({ page: z.number().int().min(1).max(MAX_PAGES), text: z.string().max(60_000) }))
    .min(1)
    .max(MAX_PAGES),
});

const MAX_TEXT_BODY_BYTES = 512 * 1024;

export async function handleAnalyzeText(
  req: Request,
  getProvider: () => LlmProvider,
  live: () => boolean = isLiveEnabled,
): Promise<Response> {
  try {
    if (!live()) throw new LiveDisabledError();
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_TEXT_BODY_BYTES) throw new BadRequestError("That text is too large.");
    const raw = await req.text();
    if (raw.length > MAX_TEXT_BODY_BYTES) throw new BadRequestError("That text is too large.");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new BadRequestError("Please send the document pages as JSON.");
    }
    const parsed = AnalyzeTextBodySchema.safeParse(json);
    if (!parsed.success) throw new BadRequestError("Please send the document pages as JSON.");

    const pages = parsed.data.pages.map((p) => ({ page: p.page, text: p.text.trim() }));
    if (pages.some((p, i) => p.page !== i + 1)) throw new BadRequestError("Pages must be numbered 1, 2, 3 and so on.");
    assertReadablePages(pages);

    return Response.json(await analyzeText(getProvider(), pages), { headers: JSON_HEADERS });
  } catch (err) {
    return errorResponse(err);
  }
}
