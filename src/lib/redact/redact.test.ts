import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractPages } from "@/lib/pdf/extract";
import { segment } from "@/lib/segment/segment";
import { FAKE, PII_PAGE } from "./fixtures";
import { findPartyNames } from "./parties";
import { addCustomTerm, applyRedactions, detect, normKey, redactQuestion, segmentPage } from "./redact";
import { findAll } from "./terms";
import type { Suggestion } from "./types";

const page = (text: string, n = 1) => ({ page: n, text });
const all = (s: Suggestion[]) => new Set(s.map((x) => x.id));
const byValue = (s: Suggestion[], value: string) => s.find((x) => x.value === value);

describe("findAll (custom terms)", () => {
  it("finds every occurrence, ignoring case by default", () => {
    expect(findAll("Ada met ada and ADA.", "ada")).toHaveLength(3);
    expect(findAll("Ada met ada and ADA.", "ada", true)).toHaveLength(1);
  });
  it("finds a name that wraps onto a second line, and maps back to the original text", () => {
    const text = "Signed by Jordan\n   Example on the day.";
    const [span] = findAll(text, "Jordan Example");
    expect(text.slice(span.start, span.end)).toBe("Jordan\n   Example");
  });
  it("finds a word split by a hyphen at the end of a line", () => {
    const text = "The Contractor, Jor-\ndan Example, agrees.";
    const [span] = findAll(text, "Jordan Example");
    expect(text.slice(span.start, span.end)).toBe("Jor-\ndan Example");
  });
  it("does not match inside a longer word", () => {
    const text = "The Annual fee and Ann's share.";
    const spans = findAll(text, "Ann");
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("Ann");
    expect(spans[0].start).toBe(text.indexOf("Ann's"));
  });
  it("ignores empty and one-letter terms", () => {
    expect(findAll("abc", "")).toEqual([]);
    expect(findAll("abc", "a")).toEqual([]);
  });
  it("handles curly quotes", () => {
    expect(findAll("It’s Jordan’s house", "Jordan's house")).toHaveLength(1);
  });
});

describe("findPartyNames", () => {
  it("reads names from the definitions the contract gives itself", () => {
    const text = `This agreement is made between ${FAKE.company}, a fictional company (the "Client"), and ${FAKE.person}, a fictional freelance designer (the "Contractor").`;
    expect(findPartyNames(text)).toEqual([
      { value: FAKE.company, kind: "COMPANY", role: "Client" },
      { value: FAKE.person, kind: "PERSON", role: "Contractor" },
    ]);
  });
  it("copes with curly quotes, 'hereinafter', and a description after the name", () => {
    const text = `Between ${FAKE.company2} (hereinafter “Landlord”) and Dr Ada Example, a person (the ‘Tenant’).`;
    const names = findPartyNames(text).map((p) => p.value);
    expect(names).toContain(FAKE.company2);
    expect(names).toContain("Dr Ada Example");
  });
  it("finds nothing when there is no definition", () => {
    expect(findPartyNames("The Client will pay the Contractor on time.")).toEqual([]);
  });
});

describe("detect", () => {
  const found = detect([page(PII_PAGE)]);

  it("groups a detail that appears twice into one suggestion with two places", () => {
    const person = byValue(found, FAKE.person)!;
    expect(person.occurrences).toHaveLength(2); // the definition and the signature line
  });

  it("names the contract's own parties with high confidence and says why", () => {
    const company = byValue(found, FAKE.company)!;
    expect(company).toMatchObject({ kind: "COMPANY", source: "contract", confidence: "high" });
    expect(company.reason).toContain("the Client");
  });

  it("finds each kind of detail on the page", () => {
    const kinds = new Set(found.map((s) => s.kind));
    for (const k of ["EMAIL", "PHONE", "IBAN", "ACCOUNT", "DOB", "ID", "ADDRESS", "POSTCODE", "COMPANY", "PERSON"]) expect(kinds.has(k as never), k).toBe(true);
  });

  it("gives every suggestion a unique id and at least one place", () => {
    expect(new Set(found.map((s) => s.id)).size).toBe(found.length);
    for (const s of found) expect(s.occurrences.length).toBeGreaterThan(0);
  });

  it("treats the same email written in another case as one detail", () => {
    const f = detect([page(`Write ${FAKE.email} or ${FAKE.email.toUpperCase()}.`)]);
    expect(f.filter((s) => s.kind === "EMAIL")).toHaveLength(1);
    expect(f[0].occurrences).toHaveLength(2);
  });

  it("treats the same phone number written with other spacing as one detail", () => {
    const f = detect([page(`Call ${FAKE.phoneUs2} or ${FAKE.phoneUs2.replace(/-/g, " ")}.`)]);
    expect(f.filter((s) => s.kind === "PHONE")).toHaveLength(1);
  });

  it("is deterministic and never changes its input", () => {
    const input = [page(PII_PAGE)];
    const before = JSON.stringify(input);
    expect(JSON.stringify(detect(input))).toBe(JSON.stringify(detect(input)));
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("addCustomTerm", () => {
  const pages = [page("Jordan lives at the old mill.\nJordan Example signs here."), page("See Jordan again.", 2)];

  it("finds every place, across pages", () => {
    const s = addCustomTerm(pages, "Jordan", "PERSON", [])!;
    expect(s.occurrences).toHaveLength(3);
    expect(s).toMatchObject({ source: "custom", kind: "PERSON", confidence: "high" });
  });
  it("returns null when the text is not in the document", () => {
    expect(addCustomTerm(pages, "Nobody Here", "PERSON", [])).toBeNull();
    expect(addCustomTerm(pages, "  ", "PERSON", [])).toBeNull();
  });
  it("reuses an existing suggestion for the same detail instead of making a second label", () => {
    const first = detect([page(`Contact ${FAKE.email}.`)]);
    const again = addCustomTerm([page(`Contact ${FAKE.email}.`)], FAKE.email.toUpperCase(), "EMAIL", first)!;
    expect(again.id).toBe(first[0].id);
  });
  it("outranks an automatic detection when they overlap", () => {
    const text = "Lives at 12 Sample Street today.";
    const auto = detect([page(text)]);
    const custom = addCustomTerm([page(text)], "12 Sample Street today", "ADDRESS", auto)!;
    const out = applyRedactions([page(text)], [...auto, custom], new Set([...all(auto), custom.id]));
    expect(out.pages[0].text).toBe("Lives at [ADDRESS_1].");
  });
});

describe("applyRedactions", () => {
  const pages = [page(PII_PAGE)];
  const suggestions = detect(pages);

  it("replaces selected details with consistent labels and leaves nothing behind", () => {
    const out = applyRedactions(pages, suggestions, all(suggestions));
    const text = out.pages[0].text;
    for (const v of [FAKE.email, FAKE.phoneIntl, FAKE.iban, FAKE.account, FAKE.sortCode, FAKE.dob, FAKE.ssn, FAKE.street, FAKE.ukPostcode, FAKE.company, FAKE.person, FAKE.titled]) {
      expect(text, `still contains ${v}`).not.toContain(v);
    }
    // The same person gets the same label in both places.
    expect(text.match(/\[PERSON_1\]/g)).toHaveLength(2);
    expect(out.labels.find((l) => l.original === FAKE.person)).toMatchObject({ label: "[PERSON_1]", count: 2 });
  });

  it("numbers labels per kind in order of first appearance", () => {
    const out = applyRedactions(pages, suggestions, all(suggestions));
    const company = out.labels.find((l) => l.kind === "COMPANY")!;
    expect(company.label).toBe("[COMPANY_1]");
    const person = out.pages[0].text.indexOf("[PERSON_1]");
    const titled = out.pages[0].text.indexOf("[PERSON_2]");
    expect(person).toBeGreaterThanOrEqual(0);
    expect(titled).toBeGreaterThan(person);
  });

  it("keeps the contract readable around the labels", () => {
    const out = applyRedactions(pages, suggestions, all(suggestions));
    expect(out.pages[0].text).toContain('between [COMPANY_1], a fictional company (the "Client"), and [PERSON_1]');
  });

  it("only replaces what was selected", () => {
    const keep = byValue(suggestions, FAKE.email)!;
    const ids = all(suggestions);
    ids.delete(keep.id);
    const text = applyRedactions(pages, suggestions, ids).pages[0].text;
    expect(text).toContain(FAKE.email);
    expect(text).not.toContain(FAKE.phoneIntl);
  });

  it("replaces nothing when nothing is selected", () => {
    const out = applyRedactions(pages, suggestions, new Set());
    expect(out.pages[0].text).toBe(PII_PAGE);
    expect(out.replaced).toBe(0);
    expect(out.labels).toEqual([]);
  });

  it("never changes the original pages", () => {
    const before = JSON.stringify(pages);
    applyRedactions(pages, suggestions, all(suggestions));
    expect(JSON.stringify(pages)).toBe(before);
  });

  it("keeps every clause number, so the redacted contract still splits into clauses", () => {
    const text = `1. CONTACT. Phone ${FAKE.phoneIntl}. 2. FEES. Pay USD 100. 3. TERM. One year.`;
    const out = applyRedactions([page(text)], detect([page(text)]), all(detect([page(text)])));
    expect(out.pages[0].text).toBe("1. CONTACT. Phone [PHONE_1]. 2. FEES. Pay USD 100. 3. TERM. One year.");
  });

  it("works across pages and keeps page numbers", () => {
    const two = [page(`Hello ${FAKE.person}.`, 1), page(`Bye ${FAKE.person}.`, 2)];
    const custom = addCustomTerm(two, FAKE.person, "PERSON", [])!;
    const out = applyRedactions(two, [custom], new Set([custom.id]));
    expect(out.pages.map((p) => [p.page, p.text])).toEqual([[1, "Hello [PERSON_1]."], [2, "Bye [PERSON_1]."]]);
  });

  it("finds a name split over two lines and replaces all of it", () => {
    const wrapped = [page("Signed by Jordan\n   Example today.")];
    const s = addCustomTerm(wrapped, FAKE.person, "PERSON", [])!;
    expect(applyRedactions(wrapped, [s], new Set([s.id])).pages[0].text).toBe("Signed by [PERSON_1] today.");
  });

  it("the redacted text no longer contains any selected original, for every kind", () => {
    const text = applyRedactions(pages, suggestions, all(suggestions)).pages[0].text;
    for (const s of suggestions) for (const o of s.occurrences) {
      expect(text.includes(PII_PAGE.slice(o.start, o.end)), s.value).toBe(false);
    }
  });
});

describe("segmentPage", () => {
  const pages = [page(PII_PAGE)];
  const suggestions = detect(pages);

  it("joins back into the original text", () => {
    const segs = segmentPage(pages[0], suggestions, all(suggestions));
    expect(segs.map((s) => s.text).join("")).toBe(PII_PAGE);
  });
  it("marks selected pieces with their label and unselected ones as kept", () => {
    const keep = byValue(suggestions, FAKE.email)!;
    const ids = all(suggestions);
    ids.delete(keep.id);
    const segs = segmentPage(pages[0], suggestions, ids);
    expect(segs.find((s) => s.text === FAKE.email)).toMatchObject({ selected: false, label: undefined });
    expect(segs.find((s) => s.text === FAKE.person)).toMatchObject({ selected: true, label: "[PERSON_1]" });
  });
  it("uses the same labels as applyRedactions", () => {
    const labels = new Set(applyRedactions(pages, suggestions, all(suggestions)).labels.map((l) => l.label));
    const shown = new Set(segmentPage(pages[0], suggestions, all(suggestions)).flatMap((s) => (s.label ? [s.label] : [])));
    expect(shown).toEqual(labels);
  });
});

describe("redactQuestion", () => {
  const pages = [page(PII_PAGE)];
  const suggestions = detect(pages);
  const { labels } = applyRedactions(pages, suggestions, all(suggestions));

  it("replaces a redacted name in a question with the same label", () => {
    const q = redactQuestion(`Can ${FAKE.person} end this early?`, labels);
    expect(q).toEqual({ text: "Can [PERSON_1] end this early?", changed: true });
  });
  it("matches in any case and across extra spaces", () => {
    expect(redactQuestion(`can  ${FAKE.person.toUpperCase()} leave?`, labels).text).toBe("can  [PERSON_1] leave?");
  });
  it("replaces personal details that were not in the contract, with an unnumbered label", () => {
    expect(redactQuestion("Please email me at someone.else@example.net about it.", labels).text).toBe("Please email me at [EMAIL] about it.");
  });
  it("reuses the contract's label when the same email appears in the question", () => {
    expect(redactQuestion(`Is ${FAKE.email} the contact?`, labels).text).toBe("Is [EMAIL_1] the contact?");
  });
  it("leaves an ordinary question alone", () => {
    expect(redactQuestion("Is there a late fee?", labels)).toEqual({ text: "Is there a late fee?", changed: false });
    expect(redactQuestion("How much notice is USD 2,000 worth?", labels).changed).toBe(false);
  });
});

describe("normKey", () => {
  it("normalises by kind", () => {
    expect(normKey("EMAIL", ` ${FAKE.email.toUpperCase()} `)).toBe(FAKE.email);
    expect(normKey("PHONE", FAKE.phoneUs)).toBe(FAKE.phoneUs.replace(/\D/g, ""));
    expect(normKey("PERSON", "Jordan   Example")).toBe("jordan example");
  });
});

describe("on the real contracts in this repo", () => {
  const dir = path.join(process.cwd(), "evals/contracts");
  it("finds only names and addresses, never numbers, in the synthetic eval contracts and the sample", async () => {
    const labels: { file: string }[] = JSON.parse(await readFile(path.join(dir, "labels.json"), "utf8"));
    const files = [...labels.map((l) => path.join(dir, l.file)), path.join(process.cwd(), "public/samples/freelance-agreement.pdf")];
    for (const f of files) {
      const { pages } = await extractPages(new Uint8Array(await readFile(f)));
      const kinds = new Set(detect(pages).map((s) => s.kind));
      for (const bad of ["EMAIL", "PHONE", "IBAN", "CARD", "ID", "ACCOUNT", "DOB", "URL", "POSTCODE"]) {
        expect(kinds.has(bad as never), `${path.basename(f)} flagged ${bad}`).toBe(false);
      }
    }
  });

  it("redacting never changes how a contract splits into clauses (same ids, same pages)", async () => {
    const labels: { file: string }[] = JSON.parse(await readFile(path.join(dir, "labels.json"), "utf8"));
    const files = [
      ...labels.map((l) => path.join(dir, l.file)),
      path.join(process.cwd(), "public/samples/freelance-agreement.pdf"),
      path.join(process.cwd(), "public/samples/redaction-example.pdf"),
    ];
    for (const f of files) {
      const { pages } = await extractPages(new Uint8Array(await readFile(f)));
      const s = detect(pages);
      const redacted = applyRedactions(pages, s, all(s)).pages;
      const shape = (ps: typeof pages) => segment(ps).clauses.map((c) => `${c.id}@${c.page}`);
      expect(shape(redacted), path.basename(f)).toEqual(shape(pages));
    }
  });

  it("the redaction example is full of details, finds every kind, and leaves none behind", async () => {
    const { pages } = await extractPages(new Uint8Array(await readFile(path.join(process.cwd(), "public/samples/redaction-example.pdf"))));
    const s = detect(pages);
    const kinds = new Set(s.map((x) => x.kind));
    for (const k of ["PERSON", "COMPANY", "ADDRESS", "POSTCODE", "EMAIL", "PHONE", "IBAN", "ACCOUNT", "ID", "DOB"]) expect(kinds.has(k as never), k).toBe(true);
    const text = applyRedactions(pages, s, all(s)).pages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
    for (const v of [FAKE.company, FAKE.person, FAKE.street, FAKE.street2, FAKE.ukPostcode, FAKE.zip, FAKE.email, FAKE.phoneIntl, FAKE.iban, FAKE.account, FAKE.sortCode, FAKE.dob, FAKE.ssn, FAKE.titled]) {
      expect(text, v).not.toContain(v);
    }
    expect(text).toContain("USD 18,000"); // ordinary contract content is untouched
    expect(text).toContain("24 hours notice");
  });

  it("finds the parties of a synthetic contract and redacting them leaves no trace", async () => {
    const { pages } = await extractPages(new Uint8Array(await readFile(path.join(dir, "freelance-heavy.pdf"))));
    const s = detect(pages);
    const out = applyRedactions(pages, s, all(s));
    const joined = out.pages.map((p) => p.text).join("\n");
    expect(joined).not.toContain("Harbour Lane Studio Ltd");
    expect(joined).not.toContain("Maya Example");
    expect(joined).toContain("[COMPANY_1]");
  });
});
