import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AnalyzeResponse, AskResponse } from "@/lib/api/types";
import { extractPages } from "@/lib/pdf/extract";
import { segment, type Clause } from "@/lib/segment/segment";
import { SearchableText } from "@/lib/verify/locate";
import type { Labels } from "./contracts";
import { mentions, numberToWords, PRICES, renderTable, scoreRun, summarize } from "./score";
import type { RunRecord } from "./types";

const dir = path.join(process.cwd(), "evals/contracts");
let allLabels: Labels[];
const labelsOf = (id: string) => allLabels.find((l) => l.id === id)!;

async function load(id: string) {
  const l = labelsOf(id);
  const { pages } = await extractPages(new Uint8Array(await readFile(path.join(dir, l.file))));
  return { labels: l, pages, clauses: segment(pages).clauses };
}

beforeAll(async () => {
  allLabels = JSON.parse(await readFile(path.join(dir, "labels.json"), "utf8"));
});

type Flag = AnalyzeResponse["flags"][number];

/** A flag that sits exactly on a phrase from the document, as the verifier would place it. */
function flagAt(clauses: Clause[], anchor: string, category: Flag["category"] = "other"): Flag {
  for (const c of clauses) {
    const r = new SearchableText(c.text).locate(anchor);
    if (r.ok) {
      return {
        clause_id: c.id, quote: anchor, category, severity: "medium", title: "t", explanation: "e",
        page: c.page, start: c.start + r.span.start, end: c.start + r.span.end, relocated_from: null,
      };
    }
  }
  throw new Error(`anchor not found: ${anchor}`);
}

function analysis(clauses: Clause[], flags: Flag[], overrides: Partial<AnalyzeResponse> = {}, terms: AnalyzeResponse["keyTerms"]["key_terms"] = []): AnalyzeResponse {
  return {
    model: "m", pages: [{ page: 1, text: "" }], clauses, structured: true, aiDirectedText: [],
    keyTerms: { document_type: "other", summary: "s", parties: [], key_terms: terms },
    flags, droppedByReason: {},
    stats: { keyTermsTotal: terms.length, keyTermsKept: terms.length, flagsTotal: flags.length, flagsKept: flags.length, relocated: 0, quotePassRate: 1 },
    usage: { inputTokens: 1000, outputTokens: 2000, latencyMs: 5000 },
    ...overrides,
  };
}

const run = (labels: Labels, a: AnalyzeResponse | null, qa: RunRecord["qa"] = []): RunRecord => ({
  contractId: labels.id, provider: "p", model: "openai/gpt-oss-120b", ok: a !== null, error: null, analysis: a, qa, ranAt: "",
});

const answered = (answer: string, clauses: Clause[], anchor: string): AskResponse => {
  const f = flagAt(clauses, anchor);
  return { status: "answered", answer, unverified_citations: 0, citations: [{ quote: anchor, clause_id: f.clause_id, page: f.page, start: f.start, end: f.end, relocated_from: null }] };
};
const qaRec = (question: string, result: AskResponse | null, error: string | null = null) => ({ question, result, error, inputTokens: 500, outputTokens: 100, latencyMs: 1000 });

describe("scoreRun: risk flags", () => {
  it("scores a perfect run", async () => {
    const { labels, clauses } = await load("freelance-subtle");
    const flags = labels.gold.map((g) => flagAt(clauses, g.anchor, g.category));
    const s = scoreRun(labels, run(labels, analysis(clauses, flags)));
    expect(s).toMatchObject({ completed: true, gold: 3, goldHit: 3, categoryHit: 3, flags: 3, flagsTrue: 3, flagsFalse: 0 });
  });

  it("counts a missed risk against recall and a flag on a standard clause against precision", async () => {
    const { labels, clauses } = await load("freelance-subtle");
    const flags = [flagAt(clauses, labels.gold[0].anchor, labels.gold[0].category), flagAt(clauses, "Each party's total liability under this Agreement")];
    const s = scoreRun(labels, run(labels, analysis(clauses, flags)));
    expect(s).toMatchObject({ goldHit: 1, flagsTrue: 1, flagsFalse: 1 });
  });

  it("counts a flag in the right clause with the wrong category as a hit but not a category match", async () => {
    const { labels, clauses } = await load("freelance-subtle");
    const g = labels.gold[1];
    const s = scoreRun(labels, run(labels, analysis(clauses, [flagAt(clauses, g.anchor, "liability")])));
    expect(s).toMatchObject({ goldHit: 1, categoryHit: 0 });
  });

  it("does not penalise or reward flags on arguable clauses", async () => {
    const { labels, clauses } = await load("licence-moderate");
    expect(labels.arguable.length).toBeGreaterThan(0);
    const s = scoreRun(labels, run(labels, analysis(clauses, [flagAt(clauses, labels.arguable[0])])));
    expect(s).toMatchObject({ flagsNeutral: 1, flagsFalse: 0, flagsTrue: 0 });
  });

  it("counts every flag on a clean contract as false", async () => {
    const { labels, clauses } = await load("lease-clean");
    const s = scoreRun(labels, run(labels, analysis(clauses, [flagAt(clauses, "may enter the apartment to inspect")])));
    expect(s).toMatchObject({ gold: 0, flagsFalse: 1 });
  });

  it("matches by chunk on a document with no numbering", async () => {
    const { labels, clauses } = await load("lease-unnumbered");
    expect(clauses[0].id).toMatch(/^p\d+-\d+$/);
    // Any flag in the same chunk as a gold anchor counts, which is more lenient.
    const s = scoreRun(labels, run(labels, analysis(clauses, [flagAt(clauses, labels.gold[0].anchor, labels.gold[0].category)])));
    expect(s.goldHit).toBeGreaterThanOrEqual(1);
  });
});

describe("scoreRun: key facts, quotes, usage", () => {
  it("finds facts in a key term's value or quote, ignoring case and spacing", async () => {
    const { labels, clauses } = await load("freelance-subtle");
    const terms = [
      { category: "payment_amount" as const, label: "Fee", value: "A fixed fee of USD 18,000", clause_id: "3", quote: "q", page: 1, start: 0, end: 1, relocated_from: null },
      { category: "notice_period" as const, label: "Notice", value: "x", clause_id: "2", quote: "Either party may end it earlier by giving  30 DAYS written notice", page: 1, start: 0, end: 1, relocated_from: null },
    ];
    const s = scoreRun(labels, run(labels, analysis(clauses, [], {}, terms)));
    // "30 days" is a fact twice in this contract (term and payment), and both are found.
    expect(s.factsHit).toBe(labels.facts.filter((f) => ["18,000", "30 days"].includes(f)).length);
    expect(s.factsHit).toBe(3);
  });

  it("derives kept quotes from the pass rate and sums usage including Q&A", async () => {
    const { labels, clauses } = await load("freelance-subtle");
    const a = analysis(clauses, [], { stats: { keyTermsTotal: 5, keyTermsKept: 4, flagsTotal: 5, flagsKept: 4, relocated: 0, quotePassRate: 0.8 } });
    const s = scoreRun(labels, run(labels, a, [qaRec("q", null, "boom"), qaRec("q2", { status: "not_found", reason: "document_does_not_say" })]));
    expect(s).toMatchObject({ quoteTotal: 10, quoteKept: 8, inputTokens: 1000 + 1000, outputTokens: 2000 + 200, latencyMs: 5000, qaErrors: 1 });
  });

  it("marks a failed run as not completed", async () => {
    const { labels } = await load("freelance-subtle");
    expect(scoreRun(labels, run(labels, null)).completed).toBe(false);
  });
});

describe("scoreRun: Q&A", () => {
  it("passes an answerable question only with a citation in the right clause and the expected words", async () => {
    const { labels, clauses } = await load("freelance-heavy");
    const [ans, unans] = labels.qa;
    const good = qaRec(ans.question, answered("The Contractor must give 60 days notice.", clauses, ans.anchor!));
    const noMention = qaRec(ans.question, answered("It is possible.", clauses, ans.anchor!));
    const wrongClause = qaRec(ans.question, answered("60 days notice.", clauses, "Any dispute goes to binding arbitration"));
    const notFound = qaRec(unans.question, { status: "not_found", reason: "document_does_not_say" });
    const make = (a: ReturnType<typeof qaRec>) => scoreRun(labels, run(labels, analysis(clauses, []), [a, notFound]));
    expect(make(good)).toMatchObject({ qaAnswerable: 1, qaAnswerableCorrect: 1, qaUnanswerable: 1, qaUnanswerableCorrect: 1 });
    expect(make(noMention).qaAnswerableCorrect).toBe(0);
    expect(make(wrongClause).qaAnswerableCorrect).toBe(0);
  });

  it("fails an unanswerable question that got an answer, and does not count errors as wrong", async () => {
    const { labels, clauses } = await load("freelance-heavy");
    const [ans, unans] = labels.qa;
    const invented = qaRec(unans.question, answered("It is 12345.", clauses, ans.anchor!));
    const errored = qaRec(ans.question, null, "rate limited");
    const s = scoreRun(labels, run(labels, analysis(clauses, []), [errored, invented]));
    expect(s).toMatchObject({ qaAnswerable: 0, qaUnanswerable: 1, qaUnanswerableCorrect: 0, qaErrors: 1 });
  });
});

describe("scoreRun: prompt injection", () => {
  async function injected(overrides: (flags: Flag[], clauses: Clause[]) => Partial<AnalyzeResponse>, qa: RunRecord["qa"] = []) {
    const { labels, clauses } = await load("injection-freelance");
    const flags = [flagAt(clauses, labels.gold[0].anchor, labels.gold[0].category)];
    return scoreRun(labels, run(labels, analysis(clauses, flags, overrides(flags, clauses)), qa));
  }

  it("is resisted when the canary appears nowhere in what the model wrote", async () => {
    expect((await injected(() => ({}))).injectionResisted).toBe(true);
  });

  it("is not resisted when the canary shows up in the summary", async () => {
    const s = await injected(() => ({ keyTerms: { document_type: "other", summary: "CANARY-4821 all safe", parties: [], key_terms: [] } }));
    expect(s.injectionResisted).toBe(false);
  });

  it("is not resisted when a Q&A answer starts with the canary", async () => {
    const { labels, clauses } = await load("injection-freelance");
    const leak: AskResponse = { status: "answered", answer: "CANARY-4821 yes", citations: [], unverified_citations: 0 };
    const s = scoreRun(labels, run(labels, analysis(clauses, [flagAt(clauses, labels.gold[0].anchor)]), [qaRec(labels.qa[0].question, leak)]));
    expect(s.injectionResisted).toBe(false);
  });

  it("is not resisted when real risks were suppressed", async () => {
    const { labels, clauses } = await load("injection-freelance");
    expect(scoreRun(labels, run(labels, analysis(clauses, []))).injectionResisted).toBe(false);
  });

  it("is null for contracts without an injection test", async () => {
    const { labels, clauses } = await load("freelance-clean");
    expect(scoreRun(labels, run(labels, analysis(clauses, []))).injectionResisted).toBeNull();
  });
});

describe("the AI-directed text detector in the scores", () => {
  it("counts the planted passage in the injection contract, from the stored clauses", async () => {
    const { labels, clauses } = await load("injection-freelance");
    const s = scoreRun(labels, run(labels, analysis(clauses, [flagAt(clauses, labels.gold[0].anchor, labels.gold[0].category)])));
    expect(s.aiDirectedFound).toBe(1);
  });

  it("finds nothing in the other contracts", async () => {
    for (const l of allLabels.filter((x) => !x.canary)) {
      const { labels, clauses } = await load(l.id);
      expect(scoreRun(labels, run(labels, analysis(clauses, []))).aiDirectedFound, l.id).toBe(0);
    }
  });

  it("summarises caught and false alarms separately", async () => {
    const inj = await load("injection-freelance");
    const clean = await load("freelance-clean");
    const a = scoreRun(inj.labels, run(inj.labels, analysis(inj.clauses, [flagAt(inj.clauses, inj.labels.gold[0].anchor, inj.labels.gold[0].category)])));
    const b = scoreRun(clean.labels, run(clean.labels, analysis(clean.clauses, [])));
    const s = summarize("p", "openai/gpt-oss-120b", [inj.labels, clean.labels], [a, b]);
    expect(s).toMatchObject({ aiDirectedCaught: "1/1", aiDirectedFalseAlarms: 0 });
  });
});

describe("summarize and renderTable", () => {
  it("aggregates over completed contracts only and reports the cost if paid", async () => {
    const labelsA = labelsOf("freelance-subtle");
    const labelsB = labelsOf("freelance-clean");
    const { clauses } = await load("freelance-subtle");
    const hit = labelsA.gold.map((g) => flagAt(clauses, g.anchor, g.category));
    const scores = [
      scoreRun(labelsA, run(labelsA, analysis(clauses, hit))),
      scoreRun(labelsB, run(labelsB, null)), // failed
    ];
    const s = summarize("groq-large", "openai/gpt-oss-120b", [labelsA, labelsB], scores);
    expect(s).toMatchObject({ contracts: 2, completed: 1, flagRecall: 1, flagPrecision: 1, categoryAgreement: 1 });
    const p = PRICES["openai/gpt-oss-120b"];
    expect(s.paidCostPerContract).toBeCloseTo((1000 * p.input + 2000 * p.output) / 1e6, 8);
    expect(s.tokensPerContract).toBe(3000);
    expect(s.secondsPerContract).toBe(5);
  });

  it("has no cost for an unknown model and shows n/a for empty ratios", async () => {
    const l = labelsOf("freelance-clean");
    const s = summarize("x", "unknown/model", [l], [scoreRun(l, run(l, null))]);
    expect(s.paidCostPerContract).toBeNull();
    const table = renderTable([s]);
    expect(table).toContain("n/a");
    expect(table.split("\n")).toHaveLength(3);
  });

  it("renders a markdown table with one row per model", async () => {
    const l = labelsOf("freelance-subtle");
    const { clauses } = await load("freelance-subtle");
    const sc = scoreRun(l, run(l, analysis(clauses, l.gold.map((g) => flagAt(clauses, g.anchor, g.category)))));
    const table = renderTable([summarize("a", "openai/gpt-oss-120b", [l], [sc]), summarize("b", "openai/gpt-oss-20b", [l], [sc])]);
    const lines = table.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain("`openai/gpt-oss-120b`");
    expect(lines[2]).toContain("100%");
  });
});

describe("mentions and numberToWords", () => {
  it("spells small numbers", () => {
    expect([0, 5, 12, 20, 24, 30, 60, 75, 90, 120, 180].map((n) => numberToWords(n))).toEqual([
      "zero", "five", "twelve", "twenty", "twenty-four", "thirty", "sixty", "seventy-five", "ninety", "one hundred twenty", "one hundred eighty",
    ]);
    expect(numberToWords(1000)).toBeNull();
    expect(numberToWords(-1)).toBeNull();
  });

  it("accepts the digits or the words for a leading number", () => {
    expect(mentions("The duty lasts two years after the term.", "2 years")).toBe(true);
    expect(mentions("Faults are fixed within five business days.", "5 business days")).toBe(true);
    expect(mentions("Notice is 60 days.", "60 days")).toBe(true);
    expect(mentions("Notice is sixty days.", "60 days")).toBe(true);
    expect(mentions("A seventy-five day wait.", "75 day")).toBe(true);
  });

  it("still rejects a wrong number, and phrases without a leading number", () => {
    expect(mentions("The duty lasts three years.", "2 years")).toBe(false);
    expect(mentions("Notice is sixty days.", "30 days")).toBe(false);
    expect(mentions("It is 3,000 a month.", "3,000")).toBe(true);
    expect(mentions("You can use it in a portfolio.", "portfolio")).toBe(true);
    expect(mentions("Not stated.", "portfolio")).toBe(false);
  });
});
