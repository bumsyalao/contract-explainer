import { describe, expect, it } from "vitest";
import { FAKE } from "./fixtures";
import type { LabelEntry } from "./redact";
import { makeReveal } from "./reveal";

const labels: LabelEntry[] = [
  { label: "[PERSON_1]", original: FAKE.person, kind: "PERSON", key: "jordan example", count: 2 },
  { label: "[COMPANY_1]", original: FAKE.company, kind: "COMPANY", key: "northwind digital ltd", count: 1 },
];

describe("makeReveal", () => {
  const reveal = makeReveal(labels);
  it("puts originals back, every time a label appears", () => {
    expect(reveal("[COMPANY_1] pays [PERSON_1]. [PERSON_1] signs.")).toBe(`${FAKE.company} pays ${FAKE.person}. ${FAKE.person} signs.`);
  });
  it("leaves labels it does not know, and ordinary brackets, alone", () => {
    expect(reveal("[PERSON_9] and [Schedule A] and [text addressed to AI readers removed]")).toBe("[PERSON_9] and [Schedule A] and [text addressed to AI readers removed]");
  });
  it("does nothing when nothing was redacted", () => {
    expect(makeReveal([])("[PERSON_1]")).toBe("[PERSON_1]");
  });
  it("does not re-interpret an original that itself looks like a label", () => {
    const tricky = makeReveal([{ label: "[PERSON_1]", original: "[PERSON_2]", kind: "PERSON", key: "x", count: 1 }]);
    expect(tricky("[PERSON_1]")).toBe("[PERSON_2]");
  });
});
