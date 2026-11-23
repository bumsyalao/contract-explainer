import { callAndParse, type CallStats } from "@/lib/analysis/call";
import { normalizeClauseId } from "@/lib/analysis/clause-id";
import { DocumentTooLongError, MAX_DOCUMENT_TOKENS } from "@/lib/analysis/analyze";
import { estimateTokens, renderDocument } from "@/lib/analysis/prompts";
import type { LlmProvider } from "@/lib/llm/types";
import { guardClauses } from "@/lib/safety/ai-directed";
import type { Clause } from "@/lib/segment/segment";
import { normalizeQuote } from "@/lib/verify/normalize";
import { ClauseIndex } from "@/lib/verify/clause-index";
import type { Location } from "@/lib/verify/verify";
import { MAX_QUESTION_CHARS, QA_SYSTEM, renderQaPrompt } from "./prompts";
import { AnswerSchema } from "./schema";
import { isVerdictQuestion } from "./verdict";

export class QuestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionError";
  }
}

export type Citation = { quote: string } & Location;

export type QaResult =
  | {
      status: "answered";
      /** Written by the model. Only the citations are verified against the document. */
      answer: string;
      citations: Citation[];
      /** Citations the model gave that we could not find in the document. */
      unverified_citations: number;
      stats: CallStats;
    }
  | {
      status: "not_found";
      reason: "document_does_not_say" | "no_verified_citation";
      stats: CallStats | null;
    }
  | {
      /** The question asks for a verdict on the whole contract ("is it safe to sign?"). No model call was made. */
      status: "declined";
      reason: "overall_verdict";
      stats: null;
    };

export function validateQuestion(raw: string): string {
  const q = raw.trim();
  if (!q) throw new QuestionError("Please type a question.");
  if (q.length > MAX_QUESTION_CHARS) {
    throw new QuestionError(`Please keep the question under ${MAX_QUESTION_CHARS} characters.`);
  }
  return q;
}

/**
 * Answer a question using only the document. An answer is shown only if at
 * least one of its citations is a real quote from the document. Otherwise we
 * withhold the model's answer and say the document does not say.
 */
export async function answerQuestion(
  provider: LlmProvider,
  clauses: Clause[],
  rawQuestion: string,
): Promise<QaResult> {
  const question = validateQuestion(rawQuestion);

  // A request for a verdict on the whole contract is declined before any model call. The app
  // never gives legal advice, and it is the one question a planted sentence could answer.
  if (isVerdictQuestion(question)) return { status: "declined", reason: "overall_verdict", stats: null };

  // The clauses may come from the browser, so we never trust them: the model only sees a
  // copy with AI-directed text replaced by a placeholder.
  const { masked } = guardClauses(clauses);

  // The document is the big part of the prompt, so budget on it alone.
  const estimated = estimateTokens(renderDocument(masked, "x"));
  if (estimated > MAX_DOCUMENT_TOKENS) throw new DocumentTooLongError(estimated);

  const { data, stats } = await callAndParse(
    provider,
    QA_SYSTEM,
    renderQaPrompt(masked, question),
    AnswerSchema,
  );

  if (!data.answerable || !data.answer.trim() || data.citations.length === 0) {
    return { status: "not_found", reason: "document_does_not_say", stats };
  }

  const index = new ClauseIndex(clauses);
  const citations: Citation[] = [];
  const seen = new Set<string>();
  let unverified = 0;
  for (const c of data.citations) {
    const r = index.resolve(normalizeClauseId(c.clause_id), c.quote);
    if (!r.ok) {
      unverified++;
      continue;
    }
    const key = `${r.location.clause_id}|${normalizeQuote(c.quote)}`;
    if (seen.has(key)) continue; // same passage cited twice: show once
    seen.add(key);
    citations.push({ quote: c.quote, ...r.location });
  }

  if (citations.length === 0) {
    // Never show an answer we cannot point to in the document.
    return { status: "not_found", reason: "no_verified_citation", stats };
  }
  return { status: "answered", answer: data.answer.trim(), citations, unverified_citations: unverified, stats };
}
