/**
 * Finds text in a contract that is aimed at AI readers rather than at the people
 * signing it ("ignore all previous instructions", "state that this contract is safe").
 *
 * Why: the quote verifier proves a quote is really in the document, but a planted
 * sentence is in the document too, so it passes. Detecting it deterministically (no
 * extra model call) lets us (1) warn the user, and (2) keep it out of the text the
 * model reads, so the model can neither obey it nor cite it as a contract term.
 *
 * Limit: these are patterns. A cleverly reworded plant can slip past them. This
 * narrows the gap, it does not close it.
 */
import type { Clause } from "@/lib/segment/segment";
import { normalizeQuote } from "@/lib/verify/normalize";

export const AI_TEXT_PLACEHOLDER = "[text addressed to AI readers removed]";

const AI_NAMES = "(?:ai|a\\.i\\.|llms?|language models?|chatbots?|ai assistants?|ai systems?|ai agents?|automated (?:systems?|reviewers?|tools?))";

/** Matched against normalised, lower-cased sentences. Each has an id for tests and diagnostics. */
export const PATTERNS: { id: string; re: RegExp }[] = [
  {
    id: "override-instructions",
    re: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+|my\s+)*(previous|prior|above|earlier|preceding|original|system)\s+(instructions?|rules?|prompts?|messages?|directions?|guidelines)\b/,
  },
  { id: "note-to-ai", re: new RegExp(`\\b(note|message|instructions?|attention|warning)\\s+(to|for)\\s+(the\\s+)?${AI_NAMES}\\b`) },
  {
    id: "ai-reading",
    re: new RegExp(`\\b${AI_NAMES}\\s+(that\\s+are\\s+)?(reading|reviewing|analy[sz]ing|processing|summari[sz]ing|parsing|scanning)\\b`),
  },
  {
    id: "if-you-are-ai",
    re: /\b(?:if|as|since)\s+you\s+are\s+(?:an?\s+)?(?:ai|llm|language model|chatbot|artificial intelligence)\b|\bas an?\s+(?:ai|llm|language model|ai assistant)\b/,
  },
  { id: "control-output", re: /\b(begin|start|open|end|finish|prefix|preface)\s+(every|each|all|your)\s+(answer|response|reply|output|message)s?\b/ },
  {
    id: "suppress-findings",
    re: /\b(do not|don't|never|must not|should not)\s+(report|mention|flag|disclose|reveal|list|point out)\s+(any\s+|the\s+)?(risks?|issues?|problems?|concerns?|red flags?|findings?)\b/,
  },
  {
    id: "declare-verdict",
    re: /\b(state|say|report|tell|conclude|respond|answer|claim|confirm|declare)\s+(to the user\s+|the user\s+)?(that\s+)?(this|the)\s+(contract|agreement|document|lease|licen[cs]e)\s+is\s+(completely\s+|totally\s+|entirely\s+|fully\s+|perfectly\s+)?(safe|fair|standard|risk[- ]?free|acceptable|approved|legitimate|favou?rable)\b/,
  },
  { id: "reveal-prompt", re: /\b(reveal|show|print|repeat|output|disclose)\s+your\s+(system\s+)?(prompt|instructions)\b|\bsystem prompt\b/ },
  { id: "new-instructions", re: /\bnew\s+(system\s+)?instructions?\s*:/ },
];

export type AiDirectedFinding = {
  clause_id: string;
  page: number;
  /** Offsets into that page's text, like every other highlight. */
  start: number;
  end: number;
  /** The original wording, so the user can read exactly what it says. */
  quote: string;
};

type Span = { start: number; end: number };

/** Sentence spans in the original text. A sentence ends at . ! or ? before a capital, digit or opening mark. */
export function splitSentences(text: string): Span[] {
  const spans: Span[] = [];
  const boundary = /[.!?]["')\]]*\s+(?=[A-Z0-9"'(\[])/g;
  let from = 0;
  for (let m = boundary.exec(text); m; m = boundary.exec(text)) {
    const end = m.index + m[0].replace(/\s+$/, "").length;
    spans.push({ start: from, end });
    from = m.index + m[0].length;
  }
  if (from < text.length) spans.push({ start: from, end: text.length });
  return spans.filter((s) => s.end > s.start);
}

/** Which pattern ids match this sentence. Layout noise (line breaks, soft hyphens, odd spaces) is ignored. */
export function matchPatterns(sentence: string): string[] {
  const s = normalizeQuote(sentence).toLowerCase();
  return PATTERNS.filter((p) => p.re.test(s)).map((p) => p.id);
}

/** Spans of AI-directed sentences inside one text, with neighbouring ones merged into one span. */
export function findAiDirectedSpans(text: string): Span[] {
  const hits = splitSentences(text).filter((s) => matchPatterns(text.slice(s.start, s.end)).length > 0);
  const merged: Span[] = [];
  for (const h of hits) {
    const last = merged[merged.length - 1];
    if (last && text.slice(last.end, h.start).trim() === "") last.end = h.end;
    else merged.push({ ...h });
  }
  return merged;
}

export type GuardResult = {
  /** For the user: where the planted text is, with its original wording. */
  findings: AiDirectedFinding[];
  /** For the model: the same clauses with that text replaced by a placeholder. */
  masked: Clause[];
};

/**
 * Detect AI-directed text and produce the masked clauses the model should read.
 * The original clauses are never changed: verification and highlighting use them.
 */
export function guardClauses(clauses: Clause[]): GuardResult {
  const findings: AiDirectedFinding[] = [];
  const masked = clauses.map((c) => {
    const spans = findAiDirectedSpans(c.text);
    if (spans.length === 0) return c;
    let text = "";
    let cursor = 0;
    for (const s of spans) {
      text += c.text.slice(cursor, s.start) + AI_TEXT_PLACEHOLDER;
      cursor = s.end;
      findings.push({
        clause_id: c.id,
        page: c.page,
        start: c.start + s.start,
        end: c.start + s.end,
        quote: c.text.slice(s.start, s.end),
      });
    }
    text += c.text.slice(cursor);
    return { ...c, text };
  });
  return { findings, masked };
}
