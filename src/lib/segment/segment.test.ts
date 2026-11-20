import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractPages, type Page } from "@/lib/pdf/extract";
import { segment } from "./segment";

const strip = (s: string) => s.replace(/\s+/g, "");

function checkInvariants(pages: Page[], clauses: ReturnType<typeof segment>["clauses"]) {
  const ids = clauses.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length); // unique ids
  for (const c of clauses) {
    const pageText = pages[c.page - 1].text;
    expect(c.text).toBe(pageText.slice(c.start, c.end)); // exact offsets
    expect(c.text).toBe(c.text.trim());
  }
  // Nothing lost: non-whitespace content per page is fully covered, in order.
  for (const p of pages) {
    const joined = clauses.filter((c) => c.page === p.page).map((c) => c.text).join("");
    expect(strip(joined)).toBe(strip(p.text));
  }
}

describe("segment (sample contract)", () => {
  it("finds numbered clauses with the right page", async () => {
    const doc = await extractPages(
      new Uint8Array(await readFile(path.join(process.cwd(), "public/samples/freelance-agreement.pdf"))),
    );
    const { clauses, structured } = segment(doc.pages);
    expect(structured).toBe(true);
    expect(clauses.map((c) => c.id)).toEqual([
      "preamble", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
    ]);
    const page = (id: string) => clauses.find((c) => c.id === id)!.page;
    expect([page("2"), page("5"), page("9")]).toEqual([1, 2, 3]);
    expect(clauses.find((c) => c.id === "2")!.text).toContain("90 days");
    checkInvariants(doc.pages, clauses);
  });
});

describe("segment (edge cases)", () => {
  it("labels a clause continuing onto the next page as -cont", () => {
    const pages: Page[] = [
      { page: 1, text: "1. FIRST. Alpha beta gamma.\n2. SECOND. This clause starts here and" },
      { page: 2, text: "keeps going on the next page.\n3. THIRD. Done." },
    ];
    const { clauses } = segment(pages);
    expect(clauses.map((c) => [c.id, c.page])).toEqual([
      ["1", 1], ["2", 1], ["2-cont", 2], ["3", 2],
    ]);
    checkInvariants(pages, clauses);
  });

  it("does not treat figures like '75 days' or '5% of' as headings", () => {
    const pages: Page[] = [
      { page: 1, text: "1. PAYMENT. Pay within\n75 days. A fee of\n5% of the total applies.\n2. END. Bye." },
    ];
    const { clauses } = segment(pages);
    expect(clauses.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("falls back to size chunks when there are no headings", () => {
    const sentence = "This is a plain sentence without any numbering. ";
    const pages: Page[] = [{ page: 1, text: sentence.repeat(120).trim() }];
    const { clauses, structured } = segment(pages);
    expect(structured).toBe(false);
    expect(clauses.length).toBeGreaterThan(1);
    expect(clauses.every((c) => c.text.length <= 2400)).toBe(true);
    expect(clauses[0].id).toBe("p1-1");
    checkInvariants(pages, clauses);
  });

  it("splits one very long clause into parts with unique ids", () => {
    const long = "Sentence number one is here. ".repeat(200);
    const pages: Page[] = [{ page: 1, text: `1. LONG. ${long}\n2. SHORT. Fine.` }];
    const { clauses } = segment(pages);
    expect(clauses.some((c) => c.id === "1.part2")).toBe(true);
    expect(clauses.at(-1)!.id).toBe("2");
    checkInvariants(pages, clauses);
  });

  it("makes duplicate heading numbers unique", () => {
    const pages: Page[] = [{ page: 1, text: "1. A. one.\n2. B. two.\n1. C. again." }];
    const ids = segment(pages).clauses.map((c) => c.id);
    expect(ids).toEqual(["1", "2", "1-2"]);
  });

  it("handles Article and Section styles", () => {
    const pages: Page[] = [{ page: 1, text: "Article I Definitions apply.\nSection 2.1 Payment is due." }];
    expect(segment(pages).clauses.map((c) => c.id)).toEqual(["I", "2.1"]);
  });
});
