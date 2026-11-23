import { describe, expect, it } from "vitest";
import type { Clause } from "@/lib/segment/segment";
import { findClauseFor, splitForHighlight } from "./highlight";

const clauses: Clause[] = [
  { id: "1", page: 1, start: 0, end: 20, text: "First clause text.. " .trim() + "x".repeat(0) },
  { id: "2", page: 1, start: 25, end: 60, text: "Second clause has a quoted bit." },
  { id: "3", page: 2, start: 0, end: 18, text: "Third on page two." },
];
// Make the first clause length consistent with its offsets.
clauses[0] = { ...clauses[0], end: clauses[0].start + clauses[0].text.length };
clauses[1] = { ...clauses[1], end: clauses[1].start + clauses[1].text.length };

describe("findClauseFor", () => {
  it("finds the clause on the right page that contains the range", () => {
    expect(findClauseFor(clauses, { page: 1, start: 30, end: 40 })?.id).toBe("2");
    expect(findClauseFor(clauses, { page: 2, start: 0, end: 5 })?.id).toBe("3");
  });
  it("does not match the same offsets on another page", () => {
    expect(findClauseFor(clauses, { page: 2, start: 30, end: 40 })).toBeNull();
  });
  it("returns null when the range spills outside the clause", () => {
    expect(findClauseFor(clauses, { page: 1, start: 10, end: 40 })).toBeNull();
  });
});

describe("splitForHighlight", () => {
  it("splits around the quoted words using page offsets", () => {
    const c = clauses[1];
    const start = c.start + c.text.indexOf("quoted bit");
    const parts = splitForHighlight(c, { page: 1, start, end: start + "quoted bit".length });
    expect(parts).toEqual({ before: "Second clause has a ", marked: "quoted bit", after: "." });
  });
  it("keeps all the text and never goes out of range", () => {
    const c = clauses[1];
    const p = splitForHighlight(c, { page: 1, start: c.start - 50, end: c.end + 50 });
    expect(p.before + p.marked + p.after).toBe(c.text);
    expect(p.marked).toBe(c.text);
  });
});
