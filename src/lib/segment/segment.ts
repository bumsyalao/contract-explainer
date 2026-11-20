import type { Page } from "@/lib/pdf/extract";

export type Clause = {
  /** Stable id the model must cite, e.g. "7", "3.2", "7-cont", "p2-1". */
  id: string;
  /** 1-based page this clause text sits on. Clauses never cross pages. */
  page: number;
  /** Offsets into that page's text. text === pages[page-1].text.slice(start, end). */
  start: number;
  end: number;
  text: string;
};

export type Segmentation = {
  clauses: Clause[];
  /** true if numbered headings were found, false if we fell back to size chunks. */
  structured: boolean;
};

// Heading at the start of a line: "5. ", "3.2 ", "4) ", "Article IV", "Section 2.1".
const HEADING =
  /^(?:(?:Article|Section|Clause)\s+(\d{1,2}(?:\.\d{1,2})*|[IVXLC]{1,6})\b[.:]?|(\d{1,2}(?:\.\d{1,2}){0,3})[.)])[ \t]+(?=[A-Z"(])/gm;

const MIN_HEADINGS_FOR_STRUCTURE = 2;
const TARGET_CHARS = 1200;
const MAX_CHARS = 2400;

type Raw = { id: string | null; page: number; start: number; end: number };

function trimmed(text: string, start: number, end: number) {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end };
}

/** Split [start,end) into pieces near TARGET_CHARS, preferring sentence ends. */
function chunkRange(text: string, start: number, end: number): [number, number][] {
  const out: [number, number][] = [];
  let from = start;
  while (end - from > MAX_CHARS) {
    const windowEnd = Math.min(from + MAX_CHARS, end);
    const window = text.slice(from + TARGET_CHARS, windowEnd);
    const m = /[.;:]\s+/.exec(window);
    const cut = m ? from + TARGET_CHARS + m.index + m[0].length : windowEnd;
    out.push([from, cut]);
    from = cut;
  }
  out.push([from, end]);
  return out;
}

export function segment(pages: Page[]): Segmentation {
  // 1. Find headings on every page.
  const headingsByPage = pages.map((p) => {
    const found: { id: string; index: number }[] = [];
    for (const m of p.text.matchAll(HEADING)) {
      found.push({ id: (m[1] ?? m[2]) as string, index: m.index });
    }
    return found;
  });
  const totalHeadings = headingsByPage.reduce((n, h) => n + h.length, 0);
  const structured = totalHeadings >= MIN_HEADINGS_FOR_STRUCTURE;

  // 2. Cut each page into raw pieces.
  const raws: Raw[] = [];
  pages.forEach((p, i) => {
    const heads = structured ? headingsByPage[i] : [];
    const bounds = [0, ...heads.map((h) => h.index), p.text.length];
    for (let b = 0; b < bounds.length - 1; b++) {
      const id = b === 0 ? null : heads[b - 1].id;
      if (b === 0 && heads.length > 0 && heads[0].index === 0) continue; // empty lead
      raws.push({ id, page: p.page, start: bounds[b], end: bounds[b + 1] });
    }
  });

  // 3. Name pieces, trim, chunk oversized ones, make ids unique.
  const clauses: Clause[] = [];
  const used = new Set<string>();
  const unique = (id: string) => {
    let candidate = id;
    for (let n = 2; used.has(candidate); n++) candidate = `${id}-${n}`;
    used.add(candidate);
    return candidate;
  };

  let lastId: string | null = null;
  const perPageCounter = new Map<number, number>();
  for (const raw of raws) {
    const pageText = pages[raw.page - 1].text;
    const t = trimmed(pageText, raw.start, raw.end);
    if (t.start >= t.end) continue;

    let baseId: string;
    if (!structured) {
      const n = (perPageCounter.get(raw.page) ?? 0) + 1;
      perPageCounter.set(raw.page, n);
      baseId = `p${raw.page}-${n}`;
    } else if (raw.id) {
      baseId = raw.id;
      lastId = raw.id;
    } else {
      // Text before the first heading on a page: continuation or preamble.
      baseId = lastId ? `${lastId}-cont` : "preamble";
    }

    const pieces = chunkRange(pageText, t.start, t.end);
    pieces.forEach(([s, e], k) => {
      const tt = trimmed(pageText, s, e);
      if (tt.start >= tt.end) return;
      const id = unique(k === 0 ? baseId : `${baseId}.part${k + 1}`);
      clauses.push({
        id,
        page: raw.page,
        start: tt.start,
        end: tt.end,
        text: pageText.slice(tt.start, tt.end),
      });
    });
  }

  return { clauses, structured };
}
