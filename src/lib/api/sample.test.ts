import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractPages } from "@/lib/pdf/extract";
import { guardClauses } from "@/lib/safety/ai-directed";
import { segment } from "@/lib/segment/segment";
import { normalizeQuote } from "@/lib/verify/normalize";
import { handleSample, SAMPLE_CACHE } from "./sample";

async function samplePages() {
  const bytes = new Uint8Array(await readFile(path.join(process.cwd(), "public/samples/freelance-agreement.pdf")));
  return (await extractPages(bytes)).pages;
}

describe("cached sample", () => {
  it("still matches the sample PDF (regenerate the cache if this fails)", async () => {
    const pages = await samplePages();
    expect(SAMPLE_CACHE.analysis.pages).toEqual(pages);
    expect(SAMPLE_CACHE.analysis.clauses).toEqual(segment(pages).clauses);
  });

  it("reports the same AI-directed text the detector finds now (none, for the sample)", async () => {
    const pages = await samplePages();
    expect(SAMPLE_CACHE.analysis.aiDirectedText).toEqual(guardClauses(segment(pages).clauses).findings);
    expect(SAMPLE_CACHE.analysis.aiDirectedText).toEqual([]);
  });

  it("has flags and key terms whose offsets point at their quotes on the right page", async () => {
    const pages = await samplePages();
    const items = [...SAMPLE_CACHE.analysis.flags, ...SAMPLE_CACHE.analysis.keyTerms.key_terms];
    expect(items.length).toBeGreaterThan(5);
    for (const it of items) {
      const slice = pages[it.page - 1].text.slice(it.start, it.end);
      expect(normalizeQuote(slice), `${it.clause_id}`).toBe(normalizeQuote(it.quote));
    }
  });

  it("has verified citations for every answered cached question", async () => {
    const pages = await samplePages();
    expect(SAMPLE_CACHE.qa.length).toBeGreaterThanOrEqual(3);
    for (const { result } of SAMPLE_CACHE.qa) {
      if (result.status !== "answered") continue;
      expect(result.citations.length).toBeGreaterThan(0);
      for (const c of result.citations) {
        expect(normalizeQuote(pages[c.page - 1].text.slice(c.start, c.end))).toBe(normalizeQuote(c.quote));
      }
    }
  });

  it("contains no token stats or dropped quote text", () => {
    const text = JSON.stringify(SAMPLE_CACHE);
    expect(text).not.toContain('"stats":{"inputTokens"');
    expect(SAMPLE_CACHE.analysis.droppedByReason).toBeTypeOf("object");
  });

  it("is served as JSON that browsers may cache", async () => {
    const res = handleSample();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
    expect((await res.json()).analysis.pages).toHaveLength(3);
  });
});
