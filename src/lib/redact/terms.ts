import { normalize, normalizeQuote } from "@/lib/verify/normalize";

const isAlnum = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * Every place `term` occurs in `text`, as spans in the ORIGINAL text. Matching ignores layout:
 * extra spaces, line breaks, curly quotes and a word split by a hyphen at the end of a line, so
 * a name that wraps onto a second line is still found. A term must not start or end inside a
 * longer word, so "Ann" does not match inside "Annual".
 */
export function findAll(text: string, term: string, caseSensitive = false): { start: number; end: number }[] {
  const q = normalizeQuote(term);
  if (q.length < 2) return [];
  const spans = new Map<string, { start: number; end: number }>();

  for (const joinHyphens of [true, false]) {
    const n = normalize(text, joinHyphens);
    let hay = n.text;
    let needle = q;
    if (!caseSensitive) {
      const lower = hay.toLowerCase();
      // Lower-casing can change the length of unusual characters, which would break the offsets.
      if (lower.length === hay.length) {
        hay = lower;
        needle = q.toLowerCase();
      }
    }
    for (let from = hay.indexOf(needle); from >= 0; from = hay.indexOf(needle, from + 1)) {
      const to = from + needle.length;
      const before = n.text[from - 1];
      const after = n.text[to];
      if (isAlnum(needle[0]) && isAlnum(before)) continue;
      if (isAlnum(needle[needle.length - 1]) && isAlnum(after)) continue;
      const span = { start: n.starts[from], end: n.ends[to - 1] };
      spans.set(`${span.start}:${span.end}`, span);
    }
  }
  return [...spans.values()].sort((a, b) => a.start - b.start);
}
