/**
 * The redaction tool's core. Runs in the browser, so the original text never leaves the device.
 *
 *   detect(pages)                       what looks personal, grouped by distinct detail
 *   addCustomTerm(pages, text, kind)    something only the person knows, such as a name
 *   applyRedactions(pages, ..., ids)    the redacted pages plus the label-to-original map
 *   segmentPage(...)                    a page cut into pieces for the review screen
 *   redactQuestion(question, labels)    the same replacements for a question the person types
 *
 * It does NOT find every name or address. The review screen says so.
 */
import type { Page } from "@/lib/pdf/extract";
import { detectOnPage, resolveOverlaps } from "./detectors";
import { findPartyNames } from "./parties";
import { findAll } from "./terms";
import type { Kind, Occurrence, Source, Suggestion } from "./types";

export type LabelEntry = {
  /** For example [PERSON_1]. */
  label: string;
  /** The original text, as first seen. Stays in the browser. */
  original: string;
  kind: Kind;
  /** Normalised form, so the same detail written another way gets the same label. */
  key: string;
  /** How many places were replaced. */
  count: number;
};

/** The same detail written slightly differently maps to the same key (and so the same label). */
export function normKey(kind: Kind, value: string): string {
  switch (kind) {
    case "EMAIL":
      return value.trim().toLowerCase();
    case "PHONE":
    case "CARD":
    case "IBAN":
    case "ACCOUNT":
    case "ID":
      return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    default:
      return value.replace(/\s+/g, " ").trim().toLowerCase();
  }
}

type Placed = { page: number; start: number; end: number; suggestion: Suggestion };

const PARTY_PRIORITY = 98;
const CUSTOM_PRIORITY = 100;

// ------------------------------------------------------------------------------------------ detect

/** Find what looks personal in the pages, grouped so each distinct detail appears once. */
export function detect(pages: Page[]): Suggestion[] {
  type Span = { page: number; start: number; end: number; kind: Kind; priority: number; confidence: "high" | "medium"; reason: string; source: Source };
  const byPage = new Map<number, Span[]>();
  const push = (s: Span) => byPage.set(s.page, [...(byPage.get(s.page) ?? []), s]);

  for (const p of pages) {
    for (const s of detectOnPage(p.text)) push({ ...s, page: p.page, source: "detected" });
  }

  // Names the contract gives itself, replaced everywhere they appear (signature lines too).
  const parties = new Map<string, { kind: Kind; role: string }>();
  for (const p of pages) for (const party of findPartyNames(p.text)) parties.set(party.value, { kind: party.kind, role: party.role });
  for (const [value, info] of parties) {
    for (const p of pages) {
      for (const span of findAll(p.text, value, true)) {
        push({
          page: p.page,
          ...span,
          kind: info.kind,
          priority: PARTY_PRIORITY,
          confidence: "high",
          reason: `Named as "the ${info.role}" in the contract`,
          source: "contract",
        });
      }
    }
  }

  const groups = new Map<string, Suggestion>();
  const ordered: Suggestion[] = [];
  for (const p of pages) {
    for (const s of resolveOverlaps(byPage.get(p.page) ?? [])) {
      const value = p.text.slice(s.start, s.end);
      const key = `${s.kind}|${normKey(s.kind, value)}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          id: `d${ordered.length + 1}`,
          kind: s.kind,
          value,
          occurrences: [],
          source: s.source,
          confidence: s.confidence,
          reason: s.reason,
          priority: s.priority,
        };
        groups.set(key, g);
        ordered.push(g);
      }
      g.occurrences.push({ page: p.page, start: s.start, end: s.end });
    }
  }
  return ordered;
}

/**
 * Add something the person typed. Finds every place it occurs. Returns the existing suggestion if
 * that detail is already in the list, and `null` when the text is not in the document at all.
 */
export function addCustomTerm(pages: Page[], term: string, kind: Kind, existing: Suggestion[]): Suggestion | null {
  const value = term.replace(/\s+/g, " ").trim();
  if (value.length < 2) return null;
  const occurrences: Occurrence[] = pages.flatMap((p) => findAll(p.text, value).map((span) => ({ page: p.page, ...span })));
  if (occurrences.length === 0) return null;

  const key = normKey(kind, value);
  const match = existing.find((s) => s.kind === kind && normKey(s.kind, s.value) === key);
  if (match) return { ...match, occurrences, source: match.source === "custom" ? "custom" : match.source, priority: Math.max(match.priority, CUSTOM_PRIORITY) };

  const n = existing.filter((s) => s.source === "custom").length + 1;
  return { id: `c${n}-${key.replace(/[^a-z0-9]/g, "").slice(0, 12)}`, kind, value, occurrences, source: "custom", confidence: "high", reason: "Added by you", priority: CUSTOM_PRIORITY };
}

// ------------------------------------------------------------------------------------------ planning

/** Which spans win when details overlap, keeping the strongest, then the longest. */
function resolvePlaced(placed: Placed[]): Placed[] {
  const sorted = [...placed].sort(
    (a, b) => b.suggestion.priority - a.suggestion.priority || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: Placed[] = [];
  for (const s of sorted) {
    if (!kept.some((k) => k.page === s.page && s.start < k.end && k.start < s.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.page - b.page || a.start - b.start);
}

function placementsOf(suggestions: Suggestion[], include: (s: Suggestion) => boolean): Placed[] {
  return resolvePlaced(suggestions.filter(include).flatMap((suggestion) => suggestion.occurrences.map((o) => ({ ...o, suggestion }))));
}

/** [KIND_n] labels in order of first appearance, one per distinct detail actually replaced. */
function assignLabels(placed: Placed[]): Map<string, string> {
  const labels = new Map<string, string>();
  const counters = new Map<Kind, number>();
  for (const p of placed) {
    if (labels.has(p.suggestion.id)) continue;
    const n = (counters.get(p.suggestion.kind) ?? 0) + 1;
    counters.set(p.suggestion.kind, n);
    labels.set(p.suggestion.id, `[${p.suggestion.kind}_${n}]`);
  }
  return labels;
}

// ------------------------------------------------------------------------------------------ apply

export type Redacted = {
  pages: Page[];
  labels: LabelEntry[];
  /** How many places were replaced. */
  replaced: number;
};

/** Replace every selected detail with its label. The original pages are not changed. */
export function applyRedactions(pages: Page[], suggestions: Suggestion[], selectedIds: ReadonlySet<string>): Redacted {
  const placed = placementsOf(suggestions, (s) => selectedIds.has(s.id));
  const labelOf = assignLabels(placed);

  const out = pages.map((page) => {
    let text = page.text;
    // From the end backwards, so earlier offsets stay valid.
    for (const p of placed.filter((x) => x.page === page.page).sort((a, b) => b.start - a.start)) {
      text = text.slice(0, p.start) + labelOf.get(p.suggestion.id)! + text.slice(p.end);
    }
    return { page: page.page, text };
  });

  const entries = new Map<string, LabelEntry>();
  for (const p of placed) {
    const label = labelOf.get(p.suggestion.id)!;
    const e = entries.get(label) ?? { label, original: p.suggestion.value, kind: p.suggestion.kind, key: normKey(p.suggestion.kind, p.suggestion.value), count: 0 };
    e.count++;
    entries.set(label, e);
  }
  return { pages: out, labels: [...entries.values()], replaced: placed.length };
}

// ------------------------------------------------------------------------------------------ preview

export type Segment = {
  text: string;
  /** Set when this piece is a detected detail. */
  suggestionId?: string;
  /** True when it will be replaced. */
  selected?: boolean;
  /** The label it becomes, when selected. */
  label?: string;
};

/** Cut one page into pieces so the review screen can show found details, kept or replaced. */
export function segmentPage(page: Page, suggestions: Suggestion[], selectedIds: ReadonlySet<string>): Segment[] {
  const all = placementsOf(suggestions, () => true).filter((p) => p.page === page.page);
  const labelOf = assignLabels(placementsOf(suggestions, (s) => selectedIds.has(s.id)));
  const out: Segment[] = [];
  let cursor = 0;
  for (const p of all) {
    if (p.start > cursor) out.push({ text: page.text.slice(cursor, p.start) });
    const selected = selectedIds.has(p.suggestion.id);
    out.push({ text: page.text.slice(p.start, p.end), suggestionId: p.suggestion.id, selected, label: selected ? labelOf.get(p.suggestion.id) : undefined });
    cursor = p.end;
  }
  if (cursor < page.text.length) out.push({ text: page.text.slice(cursor) });
  return out;
}

// ------------------------------------------------------------------------------------------ questions

/**
 * Apply the same replacements to a question the person types, so a name they redacted from the
 * contract does not slip out in a question. Anything else that looks personal (an email, a phone
 * number) is replaced too, with an unnumbered label such as [EMAIL].
 */
export function redactQuestion(question: string, labels: LabelEntry[]): { text: string; changed: boolean } {
  type Hit = { start: number; end: number; label: string; priority: number };
  const hits: Hit[] = [];

  for (const l of labels) {
    for (const span of findAll(question, l.original)) hits.push({ ...span, label: l.label, priority: 100 });
  }
  for (const s of resolveOverlaps(detectOnPage(question))) {
    const value = question.slice(s.start, s.end);
    const key = normKey(s.kind, value);
    const known = labels.find((l) => l.kind === s.kind && l.key === key);
    hits.push({ start: s.start, end: s.end, label: known?.label ?? `[${s.kind}]`, priority: s.priority });
  }

  const kept = resolveOverlaps(hits).sort((a, b) => b.start - a.start);
  let text = question;
  for (const h of kept) text = text.slice(0, h.start) + h.label + text.slice(h.end);
  return { text, changed: text !== question };
}
