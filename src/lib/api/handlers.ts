import { z } from "zod";
import { MAX_PAGES, MAX_BYTES } from "@/lib/pdf/extract";
import type { LlmProvider } from "@/lib/llm/types";
import { answerQuestion } from "@/lib/qa/answer";
import { MAX_QUESTION_CHARS } from "@/lib/qa/prompts";
import { analyzeDocument } from "@/lib/pipeline/analyze-document";
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

    const result = await answerQuestion(getProvider(), parsed.data.clauses, parsed.data.question);
    // Do not send token stats to the browser.
    const { stats: _stats, ...publicResult } = result;
    void _stats;
    return Response.json(publicResult, { headers: JSON_HEADERS });
  } catch (err) {
    return errorResponse(err);
  }
}
