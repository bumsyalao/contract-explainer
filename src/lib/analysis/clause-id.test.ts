import { describe, expect, it } from "vitest";
import { normalizeClauseId } from "./clause-id";

describe("normalizeClauseId", () => {
  it.each([
    ["2", "2"],
    [" 7 ", "7"],
    ["[clause 2 | page 1]", "2"],
    ["clause 3.2", "3.2"],
    ["Clause 7-cont", "7-cont"],
    ["[clause p2-1 | page 2]", "p2-1"],
    ["(5)", "5"],
    ["preamble", "preamble"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeClauseId(input)).toBe(expected);
  });
});
