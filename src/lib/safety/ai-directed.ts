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
// "assistant" alone is too common in contracts, so it is only used where a reading verb must follow.
const AI_READERS = `(?:${AI_NAMES}|assistants?)`;
// A sentence that starts by addressing an AI, for example "Dear AI reviewer," or "To any language model:".
const VOCATIVE = "(?:(?:dear|hello|hi|attention|note|to)\\s+(?:the\\s+|any\\s+|all\\s+|every\\s+)?)?(?:ai|a\\.i\\.|llms?|assistants?|language models?|chatbots?|reviewers?|ai (?:reviewers?|assistants?|systems?|agents?)|automated (?:reviewers?|systems?|tools?))";
const READING = "(?:reading|reviewing|analy[sz]ing|processing|summari[sz]ing|parsing|scanning)";
const VERDICT_WORDS = "(?:completely\\s+|totally\\s+|entirely\\s+|fully\\s+|perfectly\\s+|pre-?)?(?:safe|fair|standard|risk[- ]?free|acceptable|approved|legitimate|favou?rable|low[- ]risk|balanced)";
const DOC_NOUN = "(?:contract|agreement|document|lease|licen[cs]e)";
// Imperatives only count at the START of a sentence, so ordinary boilerplate such as
// "Each party confirms that this agreement is fair" is left alone.
const START = "^(?:please\\s+|you\\s+(?:must|should|will|shall)\\s+)?";

/**
 * Matched against normalised, lower-cased sentences. Each has an id for tests and
 * diagnostics. Broadened after a held-out check showed the first version caught only
 * boilerplate wording (see DECISIONS.md, D13).
 */
export const PATTERNS: { id: string; re: RegExp }[] = [
  {
    id: "override-instructions",
    re: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+|my\s+)*(previous|prior|above|earlier|preceding|original|system)\s+(instructions?|rules?|prompts?|messages?|directions?|guidelines)\b/,
  },
  { id: "override-above", re: /\b(ignore|disregard|forget)\s+(?:(?:everything|anything|all|the|what|that)\s+)*(?:above|before)\b/ },
  { id: "forget-told", re: /\bforget\s+(?:everything|all|what)\s+you\s+(?:were|have been|'ve been)\s+told\b/ },
  { id: "note-to-ai", re: new RegExp(`\\b(note|message|instructions?|attention|warning)\\s+(to|for)\\s+(the\\s+)?${AI_NAMES}\\b`) },
  { id: "address-ai", re: new RegExp(`^${VOCATIVE}\\s*[,:]`) },
  { id: "ai-reading", re: new RegExp(`\\b${AI_READERS}s?\\s+(that\\s+(?:is|are)\\s+)?${READING}\\b`) },
  {
    id: "if-you-are-ai",
    re: /\b(?:if|as|since)\s+you\s+are\s+(?:an?\s+)?(?:ai|llm|language model|chatbot|artificial intelligence)\b|\bas an?\s+(?:ai|llm|language model|ai assistant)\b/,
  },
  { id: "if-an-ai", re: /\bif\s+(?:an?|any)\s+(?:ai|llm|language model|chatbot|ai assistant|automated (?:system|tool|reviewer))\b/ },
  { id: "you-are-now", re: /\byou\s+are\s+now\s+(?:in\s+|an?\s+|the\s+)?[a-z -]{0,30}\b(?:mode|assistant|ai)\b/ },
  { id: "control-output", re: /\b(begin|start|open|end|finish|prefix|preface)\s+(every|each|all|your)\s+(answer|response|reply|output|message)s?\b/ },
  { id: "respond-with", re: /\b(?:respond|reply|answer|output)\s+(?:only\s+)?with\s+(?:the\s+(?:word|text|phrase)\s+)?["'\u201c]?(?:approved|safe|ok|yes|no issues|none|fine)\b/ },
  { id: "when-asked", re: /\bwhen\s+(?:asked|prompted|queried)\s+(?:about|for|whether|if)\b[^.]{0,60}\b(?:answer|say|respond|reply)\b/ },
  {
    id: "suppress-findings",
    re: new RegExp(`${START}(?:do not|don't|never)\\s+(?:report|mention|flag|disclose|reveal|list|point out)\\s+(?:(?:any|the|anything|everything)\\s+)*(?:(?:in|about)\\s+(?:this|the)\\s+${DOC_NOUN}\\s+)?(?:as\\s+)?(?:an?\\s+)?(?:risks?|issues?|problems?|concerns?|red flags?|findings?)\\b`),
  },
  {
    id: "declare-verdict",
    re: new RegExp(`${START}(?:state|say|report|tell|respond|answer|conclude|confirm)\\s+(?:to the user\\s+|the user\\s+)?(?:that\\s+)?(?:this|the)\\s+${DOC_NOUN}\\s+is\\s+${VERDICT_WORDS}\\b`),
  },
  {
    id: "mark-verdict",
    re: new RegExp(`${START}(?:mark|treat|describe|summari[sz]e|rate|label|classify|present|consider|regard)\\s+(?:this|the)\\s+${DOC_NOUN}\\s+as\\s+(?:being\\s+)?${VERDICT_WORDS}\\b`),
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

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

/**
 * Undo cheap evasions before matching: letters spaced apart ("i g n o r e") and digits or
 * symbols swapped for letters inside a word ("1gn0re"). Digits in ordinary numbers, such as
 * "30 days", are left alone because only words that mix letters and digits are rewritten.
 */
export function undoCheapEvasions(text: string): string {
  const joined = text.replace(/\b(?:[a-z] ){3,}[a-z]\b/gi, (m) => m.replace(/ /g, ""));
  return joined.replace(/\S+/g, (word) => {
    if (!/[a-z]/i.test(word) || !/[0-9@$]/.test(word)) return word;
    if (/^[\d.,%$@]+[a-z]{0,3}$/i.test(word)) return word; // 30d, 5%, $100
    return word.replace(/[01345 7@$]/g, (c) => LEET[c] ?? c);
  });
}

/** Which pattern ids match this sentence. Layout noise (line breaks, soft hyphens, odd spaces) is ignored. */
export function matchPatterns(sentence: string): string[] {
  const s = undoCheapEvasions(normalizeQuote(sentence).toLowerCase());
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
