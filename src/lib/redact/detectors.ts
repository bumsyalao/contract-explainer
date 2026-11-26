/**
 * Detectors for personal details in one page of text. Pure and deterministic: no model,
 * no network, so they run in the browser and the original text never leaves the device.
 *
 * They aim for few false alarms: checksums where one exists (IBAN, card), context words
 * where one helps ("account number", "date of birth"), and plain shapes otherwise. They
 * do NOT find every name or address. The review screen says so and lets the person add more.
 */
import type { RawSpan } from "./types";
import { digitsOf, ibanValid, looksLikeDate, luhnValid, ssnValid } from "./validators";

type Finder = (text: string) => RawSpan[];

function* matches(re: RegExp, text: string) {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (let m = r.exec(text); m; m = r.exec(text)) {
    if (m[0] === "") r.lastIndex++;
    yield m;
  }
}

/** Span of a capture group. Uses the `d` flag's indices when present. */
function groupSpan(m: RegExpExecArray, group: number): { start: number; end: number } | null {
  const idx = (m as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices?.[group];
  return idx ? { start: idx[0], end: idx[1] } : null;
}

const CURRENCY_BEFORE = /(?:USD|EUR|GBP|CAD|AUD|[$£€])\s*$/i;

/**
 * Turns "signed by" into a pattern that matches in any letter case, for use in the LABEL part
 * of a regex while the VALUE part stays case-sensitive (so "Signed by: the contractor" is not a name).
 */
const ci = (words: string) => words.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`).replace(/ /g, "\\s+");

// ---------------------------------------------------------------------------- numbers with a checksum

const findEmails: Finder = (t) =>
  [...matches(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g, t)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    kind: "EMAIL" as const,
    confidence: "high" as const,
    reason: "Looks like an email address",
    priority: 80,
  }));

const findUrls: Finder = (t) =>
  [...matches(/\b(?:https?:\/\/|www\.)[^\s<>"')\]]*[^\s<>"')\].,;:!?]/gi, t)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    kind: "URL" as const,
    confidence: "medium" as const,
    reason: "Web address that may identify someone",
    priority: 70,
  }));

const findIbans: Finder = (t) =>
  [...matches(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g, t)]
    .filter((m) => ibanValid(m[0]))
    .map((m) => ({
      start: m.index,
      end: m.index + m[0].length,
      kind: "IBAN" as const,
      confidence: "high" as const,
      reason: "Valid IBAN (bank account number, passes the checksum)",
      priority: 95,
    }));

const findCards: Finder = (t) =>
  [...matches(/(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g, t)]
    .filter((m) => luhnValid(digitsOf(m[0])))
    .map((m) => ({
      start: m.index,
      end: m.index + m[0].length,
      kind: "CARD" as const,
      confidence: "high" as const,
      reason: "Payment card number (passes the Luhn check)",
      priority: 95,
    }));

const findSsn: Finder = (t) =>
  [...matches(/(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g, t)]
    .filter((m) => ssnValid(m[0]))
    .map((m) => ({
      start: m.index,
      end: m.index + m[0].length,
      kind: "ID" as const,
      confidence: "high" as const,
      reason: "Looks like a US Social Security number",
      priority: 90,
    }));

const findNino: Finder = (t) =>
  [...matches(/\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/g, t)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    kind: "ID" as const,
    confidence: "high" as const,
    reason: "Looks like a UK National Insurance number",
    priority: 90,
  }));

// ---------------------------------------------------------------------------- phone numbers

function phoneOk(m: RegExpExecArray, text: string, minDigits: number, maxDigits: number): boolean {
  const digits = digitsOf(m[0]).length;
  if (digits < minDigits || digits > maxDigits) return false;
  if (looksLikeDate(m[0])) return false;
  if (CURRENCY_BEFORE.test(text.slice(Math.max(0, m.index - 6), m.index))) return false;
  return true;
}

const findPhones: Finder = (t) => {
  const out: RawSpan[] = [];
  const add = (m: RegExpExecArray) =>
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "PHONE",
      confidence: "medium",
      reason: "Looks like a phone number",
      priority: 60,
    });
  // International: a leading plus sign, then 9 to 15 digits with spaces, dots, dashes or brackets
  for (const m of matches(/(?<![\w+])\+\d[\d\s().-]{7,18}\d(?![\w])/g, t)) if (phoneOk(m, t, 9, 15)) add(m);
  // US and Canada: 3 + 3 + 4 digits, with the area code optionally in brackets
  for (const m of matches(/(?<![\w.$£€-])(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])/g, t)) if (phoneOk(m, t, 10, 10)) add(m);
  // UK national: a leading 0 then 10 or 11 digits in three groups
  for (const m of matches(/(?<![\w.+-])0\d{2,4}[\s-]\d{3,4}[\s-]\d{3,4}(?![\w-])/g, t)) if (phoneOk(m, t, 10, 11)) add(m);
  // UK mobile and some other numbers come in two groups (5 + 6 digits)
  for (const m of matches(/(?<![\w.+-])0\d{3,4}[\s-]\d{5,6}(?![\w-])/g, t)) if (phoneOk(m, t, 10, 11)) add(m);
  return out;
};

// ---------------------------------------------------------------------------- context-based

/** A value that follows a label such as "account number:". Only the value is redacted. */
function labelled(
  re: RegExp,
  kind: RawSpan["kind"],
  reason: string,
  priority: number,
  confidence: RawSpan["confidence"],
  accept: (value: string) => boolean,
): Finder {
  return (t) => {
    const out: RawSpan[] = [];
    for (const m of matches(new RegExp(re.source, re.flags.replace("d", "") + "d"), t)) {
      const g = groupSpan(m, 1);
      if (g && accept(t.slice(g.start, g.end))) out.push({ ...g, kind, confidence, reason, priority });
    }
    return out;
  };
}

const findAccounts = labelled(
  /\b(?:account|acct|a\/c|sort\s*code|routing|swift|bic)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9 -]{4,30}[A-Z0-9])/gi,
  "ACCOUNT",
  "Follows an account or sort code label",
  92,
  "high",
  (v) => digitsOf(v).length >= 6,
);

const findTaxIds = labelled(
  /\b(?:VAT|EIN|TIN|tax\s*id|company\s*(?:registration\s*)?(?:no\.?|number)|registration\s*(?:no\.?|number))\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9 -]{4,20}[A-Z0-9])/gi,
  "ID",
  "Follows a tax or registration number label",
  88,
  "medium",
  (v) => digitsOf(v).length >= 5,
);

const findPersonalIds = labelled(
  /\b(?:passport|driver'?s?\s*licen[cs]e|driving\s*licen[cs]e|national\s*id|id\s*card)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9 -]{4,15}[A-Z0-9])/gi,
  "ID",
  "Follows a passport, licence or ID label",
  88,
  "medium",
  (v) => digitsOf(v).length >= 3 && v.replace(/[^A-Za-z0-9]/g, "").length >= 6,
);

const findBirthDates = labelled(
  /\b(?:date\s+of\s+birth|d\.o\.b\.?|dob|born(?:\s+on)?)\b[\s:]*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/gi,
  "DOB",
  "Follows a date of birth label",
  85,
  "high",
  () => true,
);

// ---------------------------------------------------------------------------- places

const US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

const findPostcodes: Finder = (t) => {
  const out: RawSpan[] = [];
  const add = (start: number, end: number, reason: string) =>
    out.push({ start, end, kind: "POSTCODE", confidence: "medium", reason, priority: 50 });
  for (const m of matches(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g, t)) add(m.index, m.index + m[0].length, "Looks like a UK postcode");
  for (const m of matches(/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/g, t)) {
    add(m.index, m.index + m[0].length, "Looks like a Canadian postal code");
  }
  // US ZIP codes are only taken after a state abbreviation, or they would match any 5 digits.
  for (const m of matches(new RegExp(`\\b(?:${US_STATES})\\s+(\\d{5}(?:-\\d{4})?)\\b`, "gd"), t)) {
    const g = groupSpan(m, 1);
    if (g) add(g.start, g.end, "ZIP code after a US state");
  }
  return out;
};

const STREET_WORDS =
  "Street|St\\.?|Road|Rd\\.?|Avenue|Ave\\.?|Lane|Ln\\.?|Drive|Dr\\.?|Boulevard|Blvd\\.?|Court|Ct\\.?|Way|Place|Pl\\.?|Close|Crescent|Terrace|Square|Gardens|Row|Walk|Hill|Park|Mews";

const findAddresses: Finder = (t) =>
  [
    ...matches(
      new RegExp(
        `\\b\\d{1,5}[A-Za-z]?(?:[-\\u2013]\\d{1,5})?\\s+(?:[A-Z][A-Za-z'\\u2019.-]*\\s+){1,4}(?:${STREET_WORDS})\\b(?:,?\\s+(?:Apt|Apartment|Flat|Unit|Suite|Ste)\\.?\\s*[\\w-]+)?`,
        "g",
      ),
      t,
    ),
  ].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    kind: "ADDRESS" as const,
    confidence: "medium" as const,
    reason: "Looks like a street address",
    priority: 55,
  }));

// ---------------------------------------------------------------------------- names

/**
 * The later words of a name. Same line only (no newline), and never a label such as "Witness:"
 * or a joining word such as "And". Keeps a name from swallowing whatever follows it.
 */
const NAME_STOP = "Witness|Witnessed|Date|Dated|Signature|Signed|Address|Title|Email|Phone|Tel|Name|Position|On|And|Of|For|To|By|At|Agrees|Agree";
const NAME_TAIL = `(?:[ \\t]+(?!(?:${NAME_STOP})\\b)(?![A-Za-z'\u2019-]+:)[A-Z][a-z'\u2019-]+)`;


const TITLE_NAME = new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof)\\.?[ \\t]+[A-Z][a-z'\u2019-]+${NAME_TAIL}{0,2}`, "g");

const findTitledNames: Finder = (t) =>
  [...matches(TITLE_NAME, t)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    kind: "PERSON" as const,
    confidence: "medium" as const,
    reason: "Name after a title such as Mr, Ms or Dr",
    priority: 40,
  }));

const findLabelledNames = labelled(
  new RegExp(
    `\\b(?:${ci("full name")}|${ci("print name")}|${ci("signed by")}|${ci("witnessed by")}|${ci("witness")}|${ci("name of tenant")}|${ci("name of landlord")}|${ci("name of employee")}|${ci("name of contractor")}|${ci("name of client")})[ \\t]*[:\\-][ \\t]*([A-Z][a-z'\u2019-]+${NAME_TAIL}{1,3})`,
    "g",
  ),
  "PERSON",
  "Follows a name label such as Signed by",
  42,
  "medium",
  () => true,
);

const COMPANY_SUFFIX = "(?:Ltd\\.?|Limited|LLC|L\\.L\\.C\\.|LLP|Inc\\.?|Corp\\.?|Corporation|GmbH|PLC|plc|AG|S\\.A\\.|B\\.V\\.|Pty\\s+Ltd|Co\\.)";
const LEADING_STOPWORDS = new Set(["The", "This", "That", "These", "Those", "Between", "And", "By", "With", "Of", "For", "To", "In", "On", "At", "From", "As"]);

const findCompanies: Finder = (t) => {
  const out: RawSpan[] = [];
  for (const m of matches(new RegExp(`\\b(?:[A-Z][\\w&'\\u2019.-]*\\s+){1,5}${COMPANY_SUFFIX}(?![\\w])`, "g"), t)) {
    let start = m.index;
    let text = m[0];
    // Trim leading words such as "The" or "Between" that are not part of the name.
    for (;;) {
      const first = /^(\S+)\s+/.exec(text);
      if (first && LEADING_STOPWORDS.has(first[1])) {
        start += first[0].length;
        text = text.slice(first[0].length);
      } else break;
    }
    if (/\s/.test(text)) {
      out.push({ start, end: start + text.length, kind: "COMPANY", confidence: "medium", reason: "Company name (ends in Ltd, Inc, LLC or similar)", priority: 30 });
    }
  }
  return out;
};

export const DETECTORS: Finder[] = [
  findIbans,
  findCards,
  findSsn,
  findNino,
  findAccounts,
  findTaxIds,
  findPersonalIds,
  findBirthDates,
  findEmails,
  findUrls,
  findPhones,
  findPostcodes,
  findAddresses,
  findTitledNames,
  findLabelledNames,
  findCompanies,
];

/** All spans every detector finds on one page, before overlaps are resolved. */
export function detectOnPage(text: string): RawSpan[] {
  return DETECTORS.flatMap((d) => d(text));
}

/** Keep the highest-priority, then longest, spans that do not overlap. Sorted by position. */
export function resolveOverlaps<T extends { start: number; end: number; priority: number }>(spans: T[]): T[] {
  const byStrength = [...spans].sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: T[] = [];
  for (const s of byStrength) {
    if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}
