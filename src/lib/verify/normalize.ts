/**
 * Layout-only text normalisation for exact quote matching.
 *
 * We ignore only things that PDF extraction or a model can change without
 * changing the words: whitespace and line breaks, odd space characters, soft
 * hyphens, zero-width characters, a word split by a line-break hyphen, curly
 * versus straight quotes, dash variants and typographic ligatures.
 * Case, digits, words and all other punctuation must match exactly.
 *
 * Every output character remembers where it came from in the original text, so
 * a match in the normalised text can be mapped back to exact original offsets
 * for highlighting.
 */

export type Normalized = {
  text: string;
  /** starts[i] / ends[i]: the original [start, end) that produced text[i]. */
  starts: number[];
  ends: number[];
};

const REMOVABLE = new Set(["­", "​", "‌", "‍", "⁠", "﻿"]);
const SINGLE_QUOTES = new Set(["‘", "’", "‚", "‛"]);
const DOUBLE_QUOTES = new Set(["“", "”", "„", "‟"]);
const DASHES = new Set(["‐", "‑", "‒", "–", "—", "―", "−"]);
// Hyphens that PDFs use to split a word across lines.
const BREAK_HYPHENS = new Set(["-", "‐", "‑"]);
const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "st",
  "ﬆ": "st",
};

const isSpace = (ch: string) => /\s/.test(ch);
const isLetter = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch);

/**
 * @param joinHyphens true: "termi-\nnation" becomes "termination".
 *                    false: it becomes "termi-nation", and "non-\ncompete"
 *                    becomes "non-compete". The caller tries both, because a
 *                    line-break hyphen can be a real hyphen or a split word.
 */
export function normalize(input: string, joinHyphens: boolean): Normalized {
  const out: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const emit = (chars: string, s: number, e: number) => {
    for (const c of chars) {
      out.push(c);
      starts.push(s);
      ends.push(e);
    }
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (REMOVABLE.has(ch)) {
      i++;
      continue;
    }

    // Line-break hyphenation: letter, hyphen, optional spaces, newline, spaces, letter.
    if (BREAK_HYPHENS.has(ch) && isLetter(out[out.length - 1])) {
      let j = i + 1;
      while (j < input.length && (input[j] === " " || input[j] === "\t")) j++;
      if (input[j] === "\r" && input[j + 1] === "\n") j++;
      if (input[j] === "\n") {
        j++;
        while (j < input.length && isSpace(input[j])) j++;
        if (isLetter(input[j])) {
          if (!joinHyphens) emit("-", i, i + 1);
          i = j;
          continue;
        }
      }
    }

    if (isSpace(ch)) {
      let j = i + 1;
      while (j < input.length && (isSpace(input[j]) || REMOVABLE.has(input[j]))) j++;
      emit(" ", i, j);
      i = j;
      continue;
    }

    if (SINGLE_QUOTES.has(ch)) emit("'", i, i + 1);
    else if (DOUBLE_QUOTES.has(ch)) emit('"', i, i + 1);
    else if (DASHES.has(ch)) emit("-", i, i + 1);
    else if (LIGATURES[ch]) emit(LIGATURES[ch], i, i + 1);
    else emit(ch, i, i + 1);
    i++;
  }

  return { text: out.join(""), starts, ends };
}

/** Normalise a model quote: same rules, trimmed. Hyphens are kept as written. */
export function normalizeQuote(quote: string): string {
  return normalize(quote, false).text.trim();
}
