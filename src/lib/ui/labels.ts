import type { FLAG_CATEGORIES, KEY_TERM_CATEGORIES } from "@/lib/analysis/schemas";

type FlagCategory = (typeof FLAG_CATEGORIES)[number];
type TermCategory = (typeof KEY_TERM_CATEGORIES)[number];
export type Severity = "low" | "medium" | "high";

/** Plain words for the people reading, not the names we use in code. */
export const FLAG_CATEGORY_LABELS: Record<FlagCategory, string> = {
  auto_renewal: "Automatic renewal",
  unilateral_termination: "One-sided ending",
  liability: "Liability",
  indemnity: "Covering the other side's costs",
  ip_assignment: "Who owns the work",
  non_compete: "Limits on other work",
  payment_terms: "Payment terms",
  penalty: "Penalties and fees",
  dispute_resolution: "Disputes",
  one_sided_terms: "One-sided terms",
  other: "Other",
};

export const TERM_CATEGORY_LABELS: Record<TermCategory, string> = {
  start_date: "Dates",
  end_date: "Dates",
  term_length: "Length of the agreement",
  payment_amount: "Money",
  payment_schedule: "Payment timing",
  notice_period: "Notice to end",
  renewal: "Renewal",
  penalty: "Penalties and fees",
  deposit: "Deposit",
  governing_law: "Governing law",
  other: "Other",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  high: "High risk",
  medium: "Medium risk",
  low: "Low risk",
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Worst first, then in the order they appear in the contract. */
export function sortFlags<T extends { severity: Severity; page: number; start: number }>(flags: T[]): T[] {
  return [...flags].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.page - b.page || a.start - b.start,
  );
}

/** "7" -> "Clause 7". Also handles the ids our segmenter makes for odd layouts. */
export function clauseLabel(id: string): string {
  if (id === "preamble") return "Opening";
  const cont = /^(.+)-cont$/.exec(id);
  if (cont) return `Clause ${cont[1]} (continued)`;
  const part = /^(.+)\.part(\d+)$/.exec(id);
  if (part) return `Clause ${part[1]} (part ${part[2]})`;
  const fallback = /^p(\d+)-(\d+)$/.exec(id);
  if (fallback) return `Section ${fallback[2]}`;
  return `Clause ${id}`;
}

/** The text of a link that jumps to a quote: "Clause 7, page 2". */
export function locationLabel(clauseId: string, page: number): string {
  return `${clauseLabel(clauseId)}, page ${page}`;
}
