import { normalize, normalizeQuote, type Normalized } from "./normalize";

/** Quotes shorter than this prove almost nothing ("30" appears everywhere). Tunable. */
export const MIN_QUOTE_CHARS = 6;

export type Span = { start: number; end: number };

export type LocateResult =
  | { ok: true; span: Span }
  | { ok: false; reason: "quote_too_short" | "quote_not_found" };

/** A text prepared once and searched many times. */
export class SearchableText {
  private variants: Normalized[];

  constructor(public readonly text: string) {
    // A line-break hyphen can be a split word or a real hyphen, so keep both readings.
    this.variants = [normalize(text, true), normalize(text, false)];
  }

  /** Find a quote. On success, span is in ORIGINAL text offsets. */
  locate(quote: string): LocateResult {
    const q = normalizeQuote(quote);
    if (q.length < MIN_QUOTE_CHARS) return { ok: false, reason: "quote_too_short" };
    for (const v of this.variants) {
      const idx = v.text.indexOf(q);
      if (idx >= 0) {
        return { ok: true, span: { start: v.starts[idx], end: v.ends[idx + q.length - 1] } };
      }
    }
    return { ok: false, reason: "quote_not_found" };
  }
}
