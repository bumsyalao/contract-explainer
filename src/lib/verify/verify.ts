import type { RawAnalysis } from "@/lib/analysis/analyze";
import type { KeyTerms, RiskFlag } from "@/lib/analysis/schemas";
import type { Clause } from "@/lib/segment/segment";
import { SearchableText } from "./locate";
import { normalizeQuote } from "./normalize";

/**
 * Where a verified quote lives. Page and offsets come from OUR segmenter,
 * never from the model. start/end are offsets into that page's text, so the UI
 * can highlight exactly the quoted words.
 */
export type Location = {
  clause_id: string;
  page: number;
  start: number;
  end: number;
  /** Set when the model cited the wrong clause and we found the quote in exactly one other. */
  relocated_from: string | null;
};

export type VerifiedFlag = RiskFlag & Location;
export type VerifiedKeyTerm = KeyTerms["key_terms"][number] & Location;

export type DropReason = "quote_too_short" | "quote_not_found" | "ambiguous_quote" | "duplicate";

/**
 * Kept for diagnostics and evals. It contains model text taken from the
 * contract, so it must not be stored or logged anywhere persistent.
 */
export type Dropped = {
  kind: "flag" | "key_term";
  reason: DropReason;
  clause_id: string;
  quote: string;
  label: string;
};

export type VerifiedAnalysis = {
  /** Only quotes are verified. summary, value and explanation fields are written by the model. */
  keyTerms: Omit<KeyTerms, "key_terms"> & { key_terms: VerifiedKeyTerm[] };
  flags: VerifiedFlag[];
  dropped: Dropped[];
  stats: {
    keyTermsTotal: number;
    keyTermsKept: number;
    flagsTotal: number;
    flagsKept: number;
    relocated: number;
    /** kept / total across key terms and flags. 1 when there was nothing to check. */
    quotePassRate: number;
  };
};

type Resolved =
  | { ok: true; location: Location }
  | { ok: false; reason: Exclude<DropReason, "duplicate"> };

class ClauseIndex {
  private byId = new Map<string, { clause: Clause; searchable: SearchableText }>();
  private ordered: { clause: Clause; searchable: SearchableText }[];

  constructor(clauses: Clause[]) {
    this.ordered = clauses.map((clause) => ({ clause, searchable: new SearchableText(clause.text) }));
    for (const entry of this.ordered) this.byId.set(entry.clause.id, entry);
  }

  resolve(citedId: string, quote: string): Resolved {
    const make = (clause: Clause, span: { start: number; end: number }, from: string | null): Resolved => ({
      ok: true,
      location: {
        clause_id: clause.id,
        page: clause.page,
        // Offsets were found inside the clause text, which starts at clause.start on its page.
        start: clause.start + span.start,
        end: clause.start + span.end,
        relocated_from: from,
      },
    });

    // 1. The cited clause.
    const cited = this.byId.get(citedId);
    if (cited) {
      const r = cited.searchable.locate(quote);
      if (r.ok) return make(cited.clause, r.span, null);
      if (r.reason === "quote_too_short") return { ok: false, reason: "quote_too_short" };
    }

    // 2. Everywhere else. Move it only if exactly one other clause contains the quote.
    const matches: { clause: Clause; span: { start: number; end: number } }[] = [];
    for (const entry of this.ordered) {
      if (entry.clause.id === citedId) continue;
      const r = entry.searchable.locate(quote);
      if (r.ok) matches.push({ clause: entry.clause, span: r.span });
      else if (r.reason === "quote_too_short") return { ok: false, reason: "quote_too_short" };
    }
    if (matches.length === 1) return make(matches[0].clause, matches[0].span, citedId);
    if (matches.length > 1) return { ok: false, reason: "ambiguous_quote" };
    return { ok: false, reason: "quote_not_found" };
  }
}

/**
 * Keep only flags and key terms whose quote really appears in the document.
 * Never trusts the model for page numbers. Does not mutate its input.
 */
export function verifyAnalysis(raw: RawAnalysis, clauses: Clause[]): VerifiedAnalysis {
  const index = new ClauseIndex(clauses);
  const dropped: Dropped[] = [];
  let relocated = 0;

  const keyTerms: VerifiedKeyTerm[] = [];
  for (const term of raw.keyTerms.key_terms) {
    const r = index.resolve(term.clause_id, term.quote);
    if (!r.ok) {
      dropped.push({ kind: "key_term", reason: r.reason, clause_id: term.clause_id, quote: term.quote, label: term.label });
      continue;
    }
    if (r.location.relocated_from) relocated++;
    keyTerms.push({ ...term, ...r.location });
  }

  const flags: VerifiedFlag[] = [];
  const seen = new Set<string>();
  for (const flag of raw.flags.flags) {
    const r = index.resolve(flag.clause_id, flag.quote);
    if (!r.ok) {
      dropped.push({ kind: "flag", reason: r.reason, clause_id: flag.clause_id, quote: flag.quote, label: flag.title });
      continue;
    }
    // The same passage flagged twice (models do this) is shown once.
    const key = `${r.location.clause_id}|${normalizeQuote(flag.quote)}`;
    if (seen.has(key)) {
      dropped.push({ kind: "flag", reason: "duplicate", clause_id: flag.clause_id, quote: flag.quote, label: flag.title });
      continue;
    }
    seen.add(key);
    if (r.location.relocated_from) relocated++;
    flags.push({ ...flag, ...r.location });
  }

  const keyTermsTotal = raw.keyTerms.key_terms.length;
  const flagsTotal = raw.flags.flags.length;
  const total = keyTermsTotal + flagsTotal;
  // Duplicates were real quotes, so they do not count against the pass rate.
  const failed = dropped.filter((d) => d.reason !== "duplicate").length;

  return {
    keyTerms: { ...raw.keyTerms, key_terms: keyTerms },
    flags,
    dropped,
    stats: {
      keyTermsTotal,
      keyTermsKept: keyTerms.length,
      flagsTotal,
      flagsKept: flags.length,
      relocated,
      quotePassRate: total === 0 ? 1 : (total - failed) / total,
    },
  };
}
