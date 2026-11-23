import type { Clause } from "@/lib/segment/segment";

export type Selection = {
  page: number;
  /** Offsets into that page's text, as returned by the API. */
  start: number;
  end: number;
};

/** The clause on a page that contains the whole selected range. */
export function findClauseFor(clauses: Clause[], sel: Selection): Clause | null {
  return (
    clauses.find((c) => c.page === sel.page && c.start <= sel.start && sel.end <= c.end) ?? null
  );
}

/** Cut a clause's text into the part before, inside and after the selection. */
export function splitForHighlight(clause: Clause, sel: Selection) {
  const from = Math.max(0, sel.start - clause.start);
  const to = Math.min(clause.text.length, sel.end - clause.start);
  return {
    before: clause.text.slice(0, from),
    marked: clause.text.slice(from, to),
    after: clause.text.slice(to),
  };
}
