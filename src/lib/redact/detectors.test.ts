import { describe, expect, it } from "vitest";
import { detectOnPage, resolveOverlaps } from "./detectors";
import { FAKE, LOOKALIKE, NUMBERS_PAGE, PII_PAGE } from "./fixtures";
import type { Kind } from "./types";
import { ibanValid, looksLikeDate, luhnValid, ssnValid } from "./validators";

/** What the detectors pick out of `text`, as [kind, text] pairs after overlaps are resolved. */
function found(text: string): [Kind, string][] {
  return resolveOverlaps(detectOnPage(text)).map((s) => [s.kind, text.slice(s.start, s.end)]);
}
const has = (text: string, kind: Kind, value: string) => found(text).some(([k, v]) => k === kind && v === value);

describe("validators", () => {
  it("Luhn accepts a test card and rejects a near miss and repeated digits", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid(LOOKALIKE.badCard.replace(/ /g, ""))).toBe(false);
    expect(luhnValid("0000000000000000")).toBe(false);
    expect(luhnValid("123")).toBe(false);
  });
  it("IBAN mod-97 accepts the documentation example and rejects a changed digit", () => {
    expect(ibanValid(FAKE.iban)).toBe(true);
    expect(ibanValid(LOOKALIKE.badIban)).toBe(false);
    expect(ibanValid("not an iban")).toBe(false);
  });
  it("SSN rules", () => {
    expect(ssnValid(FAKE.ssn)).toBe(true);
    for (const bad of LOOKALIKE.badSsns) expect(ssnValid(bad), bad).toBe(false);
  });
  it("dates are recognised", () => {
    expect(looksLikeDate(LOOKALIKE.isoDate)).toBe(true);
    expect(looksLikeDate(LOOKALIKE.slashDate)).toBe(true);
    expect(looksLikeDate(FAKE.phoneUs2)).toBe(false);
  });
});

describe("detectors find what they should", () => {
  it.each([
    ["EMAIL", FAKE.email],
    ["EMAIL", FAKE.email2],
    ["PHONE", FAKE.phoneIntl],
    ["PHONE", FAKE.phoneUs],
    ["PHONE", FAKE.phoneUs2],
    ["PHONE", FAKE.phoneUk],
    ["PHONE", FAKE.phoneUkMobile],
    ["IBAN", FAKE.iban],
    ["CARD", FAKE.card],
    ["ID", FAKE.ssn],
    ["ID", FAKE.nino],
    ["POSTCODE", FAKE.ukPostcode],
    ["POSTCODE", FAKE.caPostcode],
    ["ADDRESS", FAKE.street],
    ["ADDRESS", FAKE.street2],
    ["PERSON", FAKE.titled],
    ["PERSON", FAKE.titled2],
    ["COMPANY", FAKE.company],
    ["COMPANY", FAKE.company2],
    ["URL", FAKE.url],
  ] as [Kind, string][])("%s: %s", (kind, value) => {
    expect(has(`Please contact us at the details here: ${value} for more.`, kind, value)).toBe(true);
  });

  it("takes only the value after a label, not the label", () => {
    expect(has(`Account number: ${FAKE.account}`, "ACCOUNT", FAKE.account)).toBe(true);
    expect(has(`Sort code ${FAKE.sortCode}`, "ACCOUNT", FAKE.sortCode)).toBe(true);
    expect(has(`Date of birth: ${FAKE.dob}`, "DOB", FAKE.dob)).toBe(true);
    expect(has(`DOB: ${FAKE.dobNumeric}`, "DOB", FAKE.dobNumeric)).toBe(true);
    expect(has(`Signed by: ${FAKE.person}`, "PERSON", FAKE.person)).toBe(true);
    expect(has(`Springfield, IL ${FAKE.zip}`, "POSTCODE", FAKE.zip)).toBe(true);
  });

  it("finds a UK National Insurance number written without spaces", () => {
    expect(has(`NI: ${FAKE.nino.replace(/ /g, "")}.`, "ID", FAKE.nino.replace(/ /g, ""))).toBe(true);
  });

  it("finds each detail on a realistic page", () => {
    const f = found(PII_PAGE);
    for (const [kind, value] of [
      ["EMAIL", FAKE.email],
      ["PHONE", FAKE.phoneIntl],
      ["IBAN", FAKE.iban],
      ["ACCOUNT", FAKE.account],
      ["ACCOUNT", FAKE.sortCode],
      ["DOB", FAKE.dob],
      ["ID", FAKE.ssn],
      ["ADDRESS", FAKE.street],
      ["POSTCODE", FAKE.ukPostcode],
      ["COMPANY", FAKE.company],
      ["PERSON", FAKE.person],
      ["PERSON", FAKE.titled],
    ] as [Kind, string][]) {
      expect(f.some(([k, v]) => k === kind && v === value), `${kind}: ${value}`).toBe(true);
    }
  });

  it("trims leading words like The or Between off a company name", () => {
    expect(has("This agreement is between Northwind Digital Ltd and others.", "COMPANY", "Northwind Digital Ltd")).toBe(true);
    expect(has("The Northwind Digital Ltd team.", "COMPANY", "Northwind Digital Ltd")).toBe(true);
  });
});

describe("names do not swallow what follows them", () => {
  it("stops before a label word on the same line", () => {
    expect(has(`Signed by: ${FAKE.person}   Witness: ${FAKE.titled}`, "PERSON", FAKE.person)).toBe(true);
    expect(has("Signed by: Jordan Example Witness: Ada Lovelace", "PERSON", "Jordan Example")).toBe(true);
  });
  it("stops at the end of the line", () => {
    expect(has("Signed by: Jordan Example\nClause 7 applies.", "PERSON", "Jordan Example")).toBe(true);
    expect(has("Dr Ada Example\nClause 7 applies.", "PERSON", "Dr Ada Example")).toBe(true);
  });
  it("stops before And, Of and the like", () => {
    expect(has("Mr John Sample And Ms Jane Sample agree.", "PERSON", "Mr John Sample")).toBe(true);
  });
  it("needs capital letters, so ordinary words after the label are not a name", () => {
    expect(found("Signed by: the contractor on the day.").filter(([k]) => k === "PERSON")).toEqual([]);
  });
});

describe("detectors leave ordinary contract numbers alone", () => {
  it("finds nothing at all in money, dates, durations and references", () => {
    expect(found(NUMBERS_PAGE)).toEqual([]);
  });

  it.each([
    `The fee is ${LOOKALIKE.moneyThatLooksLikeAPhone} per year.`,
    `Total: ${LOOKALIKE.dollarPhoneLike}.`,
    `Dated ${LOOKALIKE.isoDate}.`,
    `Dated ${LOOKALIKE.slashDate}.`,
    `A 16 digit reference ${LOOKALIKE.sixteenDigitReference} is not a card.`,
    `Pay ${LOOKALIKE.badCard} (fails the card checksum).`,
    `Code ${LOOKALIKE.badIban} fails the IBAN checksum.`,
    `Number ${LOOKALIKE.badSsns[0]} is not a valid SSN.`,
    "The rent rises on 1 July 2026 by 3 percent.",
    "30 days, 60 days, 90 days and 180 days.",
    "Word counts: 12 months, 24 months, 36 months.",
  ])("ignores %j", (text) => {
    expect(found(text).filter(([k]) => ["PHONE", "CARD", "IBAN", "ID"].includes(k))).toEqual([]);
  });

  it("does not take a bare 5 digit number for a ZIP code", () => {
    expect(found("The deposit is 62704 units.").filter(([k]) => k === "POSTCODE")).toEqual([]);
  });

  it("does not make a street address out of a duration", () => {
    expect(found("within 30 days Court action applies, 12 months Way of working")).toEqual([]);
  });
});

describe("resolveOverlaps", () => {
  it("keeps the stronger of two overlapping spans, then the longer, sorted by position", () => {
    const spans = [
      { start: 0, end: 10, priority: 60 },
      { start: 5, end: 15, priority: 95 },
      { start: 20, end: 25, priority: 10 },
      { start: 22, end: 30, priority: 10 },
    ];
    expect(resolveOverlaps(spans)).toEqual([
      { start: 5, end: 15, priority: 95 },
      { start: 22, end: 30, priority: 10 },
    ]);
  });

  it("a card number is not also reported as a phone number", () => {
    const text = `Card ${FAKE.card} on file.`;
    expect(found(text).map(([k]) => k)).toEqual(["CARD"]);
  });

  it("an email is not also reported as a web address", () => {
    expect(found(`Write to ${FAKE.email}.`).map(([k]) => k)).toEqual(["EMAIL"]);
  });
});
