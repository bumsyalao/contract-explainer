import type { Clause } from "@/lib/segment/segment";
import { SearchableText } from "./locate";
import type { DropReason, Location } from "./verify";

export type Resolved =
  | { ok: true; location: Location }
  | { ok: false; reason: Exclude<DropReason, "duplicate"> };

export class ClauseIndex {
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
