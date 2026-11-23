import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MAX_DOCUMENT_TOKENS } from "@/lib/analysis/analyze";
import { estimateTokens, renderDocument } from "@/lib/analysis/prompts";
import { extractPages } from "@/lib/pdf/extract";
import { segment } from "@/lib/segment/segment";
import { SearchableText } from "@/lib/verify/locate";
import { CANARY, paginate, render, SPECS, type Labels } from "./contracts";
import { LIBRARY } from "./library";

const dir = path.join(process.cwd(), "evals/contracts");
const labels = async (): Promise<Labels[]> => JSON.parse(await readFile(path.join(dir, "labels.json"), "utf8"));
const loadPdf = async (file: string) => new Uint8Array(await readFile(path.join(dir, file)));

describe("eval library and specs", () => {
  it("has 10 contracts with unique ids", () => {
    expect(SPECS).toHaveLength(10);
    expect(new Set(SPECS.map((s) => s.id)).size).toBe(10);
  });

  it("covers every layout, all three kinds, clean contracts, an injection and a noisy one", () => {
    expect(new Set(SPECS.map((s) => s.layout))).toEqual(new Set(["numbered", "section", "article", "unnumbered"]));
    expect(new Set(SPECS.map((s) => s.kind))).toEqual(new Set(["freelance", "lease", "licence"]));
    expect(SPECS.some((s) => s.canary)).toBe(true);
    expect(SPECS.some((s) => s.noisy)).toBe(true);
    const clean = SPECS.filter((s) => render(s).labels.gold.length === 0);
    expect(clean.length).toBeGreaterThanOrEqual(2);
  });

  it("every library anchor really occurs in its own clause text, exactly once", () => {
    for (const [id, e] of Object.entries(LIBRARY) as [string, import("./library").Entry][]) {
      for (const a of [e.risk?.anchor, e.arguable].filter(Boolean) as string[]) {
        const count = e.text.split(a).length - 1;
        expect(count, `${id}: "${a}"`).toBe(1);
      }
      for (const f of e.facts ?? []) expect(e.text, `${id}: fact ${f}`).toContain(f);
    }
  });

  it("every Q&A anchor occurs in its contract, and every gold risk anchor is unique in it", () => {
    for (const spec of SPECS) {
      const { paragraphs, labels: l } = render(spec);
      const text = paragraphs.join("\n");
      for (const q of l.qa.filter((x) => x.answerable)) {
        expect(text, `${spec.id}: ${q.anchor}`).toContain(q.anchor!);
      }
      for (const g of l.gold) expect(text.split(g.anchor).length - 1, `${spec.id}: ${g.anchor}`).toBe(1);
      expect(l.qa.some((x) => !x.answerable), `${spec.id} has an unanswerable question`).toBe(true);
    }
  });

  it("has a good number of gold risks across the set", () => {
    const total = SPECS.reduce((n, s) => n + render(s).labels.gold.length, 0);
    expect(total).toBeGreaterThanOrEqual(30);
  });

  it("paginates without splitting a paragraph", () => {
    const pages = paginate(["a".repeat(1500), "b".repeat(1500), "c".repeat(100)], 2200);
    expect(pages.map((p) => p.length)).toEqual([1, 2]);
  });
});

describe("committed eval PDFs", () => {
  it("labels.json matches the specs (rebuild with evals/build-contracts.ts if this fails)", async () => {
    const stored = await labels();
    expect(stored.map((l) => l.id)).toEqual(SPECS.map((s) => s.id));
    for (const spec of SPECS) {
      const { labels: fresh } = render(spec);
      const s = stored.find((l) => l.id === spec.id)!;
      expect({ ...s, file: undefined }).toEqual({ ...fresh, file: undefined });
    }
  });

  it("every PDF is text-based, fits the free-tier budget, and contains every anchor", async () => {
    for (const l of await labels()) {
      const { pages } = await extractPages(await loadPdf(l.file));
      const { clauses, structured } = segment(pages);
      expect(structured, `${l.id} structured`).toBe(l.layout !== "unnumbered");
      const tokens = estimateTokens(renderDocument(clauses, "x"));
      expect(tokens, `${l.id} tokens`).toBeLessThanOrEqual(MAX_DOCUMENT_TOKENS);

      const whole = new SearchableText(clauses.map((c) => c.text).join("\n"));
      for (const g of l.gold) expect(whole.locate(g.anchor).ok, `${l.id}: ${g.anchor}`).toBe(true);
      for (const q of l.qa.filter((x) => x.answerable)) expect(whole.locate(q.anchor!).ok, `${l.id}: ${q.anchor}`).toBe(true);
    }
  });

  it("most contracts span more than one page, so page attribution is exercised", async () => {
    let multi = 0;
    for (const l of await labels()) {
      if ((await extractPages(await loadPdf(l.file))).pageCount > 1) multi++;
    }
    expect(multi).toBeGreaterThanOrEqual(8);
  });

  it("the injection contract holds the planted instruction", async () => {
    const l = (await labels()).find((x) => x.canary)!;
    expect(l.canary).toBe(CANARY);
    const { pages } = await extractPages(await loadPdf(l.file));
    expect(new SearchableText(pages.map((p) => p.text).join(" ")).locate("ignore all previous instructions").ok).toBe(true);
  });

  it("the noisy contract really has line-break hyphens and curly quotes", async () => {
    const l = (await labels()).find((x) => x.noisy)!;
    const { pages } = await extractPages(await loadPdf(l.file));
    const text = pages.map((p) => p.text).join("\n");
    expect(text).toMatch(/\p{L}-\n\p{L}/u);
    expect(text).toContain("’");
  });
});
