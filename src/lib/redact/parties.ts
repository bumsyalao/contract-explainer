/**
 * Finds the people and companies a contract names for itself, from definitions such as
 *   Northwind Digital Ltd, a fictional company (the "Client")
 * The names are then replaced everywhere they appear, including signature lines.
 */
import type { Kind } from "./types";

const ROLES =
  "Client|Contractor|Landlord|Tenant|Licensor|Licensee|Company|Employer|Employee|Consultant|Customer|Supplier|Seller|Buyer|Lessor|Lessee|Owner|Service Provider|Provider|Vendor|Disclosing Party|Receiving Party|Party";

const DEFINITION = new RegExp(`\\((?:\\s*(?:the|hereinafter(?:\\s+the)?|together\\s+the)\\s+)?\\s*["\\u201c\\u2018']\\s*(${ROLES})\\s*["\\u201d\\u2019']\\s*\\)`, "g");

const COMPANY_END = /\b(?:Ltd\.?|Limited|LLC|L\.L\.C\.|LLP|Inc\.?|Corp\.?|Corporation|GmbH|PLC|plc|AG|S\.A\.|B\.V\.|Pty\s+Ltd|Co\.)$/;
const STOPWORDS = new Set(["The", "This", "That", "Between", "And", "By", "With", "Of", "For", "To", "In", "On", "At", "From", "As", "Agreement", "Contract", "Lease", "Licence", "License", "Dated", "Date"]);
const ROLE_WORDS = new Set(ROLES.split("|"));

export type PartyName = { value: string; kind: Kind; role: string };

/** The capitalised words that end `window`, once any ", a fictional company"-style description is cut off. */
function trailingName(window: string): string | null {
  const cut = window.replace(/,\s+(?:a|an|the)\s+[^,()]*$/, "").replace(/\s+$/, "");
  const m = /((?:[A-Z][\w&'’.-]*)(?:[ \t]+(?:[A-Z][\w&'’.-]*|&))*)$/.exec(cut);
  if (!m) return null;
  const words = m[1].split(/[ \t]+/);
  while (words.length > 0 && STOPWORDS.has(words[0])) words.shift();
  const name = words.join(" ").replace(/[.,;:]+$/, (tail) => (COMPANY_END.test(words.join(" ")) ? tail : ""));
  if (name.length < 3 || ROLE_WORDS.has(name)) return null;
  return name;
}

export function findPartyNames(text: string): PartyName[] {
  const out: PartyName[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(DEFINITION)) {
    // Look back at most 160 characters, and not past the previous definition.
    const lookBack = text.slice(Math.max(0, m.index - 160), m.index);
    const afterLastDefinition = lookBack.slice(lookBack.lastIndexOf(")") + 1);
    const name = trailingName(afterLastDefinition);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ value: name, kind: COMPANY_END.test(name) ? "COMPANY" : "PERSON", role: m[1] });
  }
  return out;
}
