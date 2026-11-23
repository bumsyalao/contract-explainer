import { describe, expect, it } from "vitest";
import { FLAG_CATEGORIES, KEY_TERM_CATEGORIES } from "@/lib/analysis/schemas";
import { clauseLabel, FLAG_CATEGORY_LABELS, locationLabel, sortFlags, TERM_CATEGORY_LABELS } from "./labels";

describe("labels", () => {
  it("has a plain label for every flag and key-term category", () => {
    for (const c of FLAG_CATEGORIES) expect(FLAG_CATEGORY_LABELS[c], c).toBeTruthy();
    for (const c of KEY_TERM_CATEGORIES) expect(TERM_CATEGORY_LABELS[c], c).toBeTruthy();
  });

  it.each([
    ["7", "Clause 7"],
    ["3.2", "Clause 3.2"],
    ["preamble", "Opening"],
    ["7-cont", "Clause 7 (continued)"],
    ["4.part2", "Clause 4 (part 2)"],
    ["p2-3", "Section 3"],
  ])("clauseLabel(%j) is %j", (id, label) => {
    expect(clauseLabel(id)).toBe(label);
  });

  it("builds the jump-link text", () => {
    expect(locationLabel("7", 2)).toBe("Clause 7, page 2");
  });

  it("sorts flags worst first, then by position, without mutating the input", () => {
    const flags = [
      { id: "a", severity: "low" as const, page: 1, start: 0 },
      { id: "b", severity: "high" as const, page: 3, start: 5 },
      { id: "c", severity: "high" as const, page: 2, start: 9 },
      { id: "d", severity: "medium" as const, page: 1, start: 4 },
      { id: "e", severity: "high" as const, page: 2, start: 1 },
    ];
    const copy = [...flags];
    expect(sortFlags(flags).map((f) => f.id)).toEqual(["e", "c", "b", "d", "a"]);
    expect(flags).toEqual(copy);
  });
});
