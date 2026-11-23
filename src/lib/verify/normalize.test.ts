import { describe, expect, it } from "vitest";
import { SearchableText } from "./locate";
import { normalize, normalizeQuote } from "./normalize";

const found = (source: string, quote: string) => new SearchableText(source).locate(quote);

describe("layout-only matching", () => {
  it("ignores whitespace runs and line breaks", () => {
    expect(found("The Client\n  will   pay\teach invoice", "The Client will pay each invoice").ok).toBe(true);
  });

  it("ignores non-breaking, thin and zero-width spaces and soft hyphens", () => {
    expect(found("pay within 75 days", "pay within 75 days").ok).toBe(true);
    expect(found("ter­mina​tion clause", "termination clause").ok).toBe(true);
  });

  it("rejoins a word split by a line-break hyphen", () => {
    expect(found("may end this agree-\nment at any time", "may end this agreement at any time").ok).toBe(true);
  });

  it("keeps a real hyphen that happens to fall at a line break", () => {
    expect(found("a non-\ncompete applies worldwide", "a non-compete applies worldwide").ok).toBe(true);
  });

  it("maps curly quotes, dash variants and ligatures", () => {
    expect(found("the “Client”’s fee", `the "Client"'s fee`).ok).toBe(true);
    expect(found("12–month term — renews", "12-month term - renews").ok).toBe(true);
    expect(found("of\uFB01cial notice", "oficial notice").ok).toBe(false); // the ligature expands to two letters
    expect(found("ofﬁcial notice", "official notice").ok).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(found("The Client will pay", "the client will pay").ok).toBe(false);
  });

  it("never treats different numbers or words as a match", () => {
    expect(found("within 75 days of receipt", "within 57 days of receipt").ok).toBe(false);
    expect(found("notice of 90 days", "notice of 60 days").ok).toBe(false);
    expect(found("pay within 75 days", "pay within seventy five days").ok).toBe(false);
  });

  it("does not skip over missing words or accept ellipses", () => {
    expect(found("The Client may terminate at any time for any reason", "The Client may ... any reason").ok).toBe(false);
  });

  it("rejects quotes that are too short to be evidence", () => {
    expect(found("pay within 30 days", "30")).toEqual({ ok: false, reason: "quote_too_short" });
    expect(found("pay within 30 days", "   ")).toEqual({ ok: false, reason: "quote_too_short" });
  });

  it("reports quotes that are not in the text", () => {
    expect(found("pay within 30 days", "something never said")).toEqual({ ok: false, reason: "quote_not_found" });
  });
});

describe("offsets map back to the original text", () => {
  it("returns the original slice including line breaks and odd characters", () => {
    const source = "Intro. The Client\n  will pay each\ninvoice within 75 days. Outro.";
    const r = found(source, "The Client will pay each invoice within 75 days");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(source.slice(r.span.start, r.span.end)).toBe(
        "The Client\n  will pay each\ninvoice within 75 days",
      );
    }
  });

  it("maps a rejoined hyphenated word to the full original text", () => {
    const source = "You may end this agree-\nment at once.";
    const r = found(source, "end this agreement at once");
    expect(r.ok).toBe(true);
    if (r.ok) expect(source.slice(r.span.start, r.span.end)).toBe("end this agree-\nment at once");
  });

  it("finds the first occurrence", () => {
    const source = "pay promptly. pay promptly.";
    const r = found(source, "pay promptly.");
    expect(r.ok && r.span.start).toBe(0);
  });
});

describe("normalize internals", () => {
  it("keeps one entry per output character with matching offsets", () => {
    const n = normalize("a  b", true);
    expect(n.text).toBe("a b");
    expect(n.starts).toHaveLength(3);
    expect(n.ends[1]).toBe(3); // the collapsed space covers both original spaces
  });

  it("normalizeQuote trims and keeps case", () => {
    expect(normalizeQuote("  The  “Client” ")).toBe('The "Client"');
  });
});
