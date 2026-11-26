"use client";

import { useId, useMemo, useState } from "react";
import type { Page } from "@/lib/pdf/pages";
import { addCustomTerm, applyRedactions, segmentPage, type Redacted } from "@/lib/redact/redact";
import { KIND_LABELS, type Kind, type Suggestion } from "@/lib/redact/types";

type Props = {
  name: string;
  pages: Page[];
  suggestions: Suggestion[];
  selected: ReadonlySet<string>;
  liveEnabled: boolean;
  /** Shown when a previous attempt to analyse failed, so the work here is never lost. */
  error: string | null;
  onChange: (next: { suggestions: Suggestion[]; selected: Set<string> }) => void;
  onAnalyse: (redacted: Redacted) => void;
  onCancel: () => void;
};

const KIND_ORDER: Kind[] = ["PERSON", "COMPANY", "ADDRESS", "POSTCODE", "EMAIL", "PHONE", "URL", "IBAN", "CARD", "ACCOUNT", "ID", "DOB", "OTHER"];
const ADDABLE: Kind[] = ["PERSON", "COMPANY", "ADDRESS", "EMAIL", "PHONE", "ID", "OTHER"];

function download(pages: Page[], name: string) {
  const body = pages.map((p) => `--- Page ${p.page} ---\n\n${p.text}`).join("\n\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\.pdf$/i, "") || "document"}-redacted.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RedactionReview({ name, pages, suggestions, selected, liveEnabled, error, onChange, onAnalyse, onCancel }: Props) {
  const [view, setView] = useState<"sent" | "found">("sent");
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<Kind>("PERSON");
  const [feedback, setFeedback] = useState("");
  const termId = useId();
  const kindId = useId();

  const redacted = useMemo(() => applyRedactions(pages, suggestions, selected), [pages, suggestions, selected]);
  const groups = KIND_ORDER.map((k) => ({ kind: k, items: suggestions.filter((s) => s.kind === k) })).filter((g) => g.items.length > 0);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ suggestions, selected: next });
  }

  function addOwn(e: React.FormEvent) {
    e.preventDefault();
    const found = addCustomTerm(pages, term, kind, suggestions);
    if (!found) {
      setFeedback(term.trim().length < 2 ? "Type at least two characters." : "That text is not in the document.");
      return;
    }
    const exists = suggestions.some((s) => s.id === found.id);
    const nextSuggestions = exists ? suggestions.map((s) => (s.id === found.id ? found : s)) : [...suggestions, found];
    onChange({ suggestions: nextSuggestions, selected: new Set(selected).add(found.id) });
    setFeedback(`Added. Found in ${found.occurrences.length} ${found.occurrences.length === 1 ? "place" : "places"}.`);
    setTerm("");
  }

  const places = redacted.replaced;
  const details = redacted.labels.length;

  return (
    <main className="workspace">
      <section className="pane pane--findings" aria-label="What to redact">
        <div className="findings review">
          <h2 className="summary__title">Check what will be sent</h2>
          <p className="summary__text">
            This page runs on your device. Your PDF and its original text stay here. Only the redacted text is sent for analysis.
          </p>

          <p className="notice">
            <strong>This tool cannot find every detail.</strong> It looks for emails, phone numbers, bank and card numbers, ID numbers, dates
            of birth, postcodes, street addresses, and the people and companies the contract names. It cannot know any other name or address.
            Read the preview and add anything else below.
          </p>

          {error && (
            <div className="alert" role="alert">
              <p>{error}</p>
              <p>Your choices are kept. You can try again.</p>
            </div>
          )}

          <p className="review__count" aria-live="polite">
            {places === 0
              ? "Nothing will be replaced. The AI would see the document exactly as it is."
              : `${places} ${places === 1 ? "place" : "places"} will be replaced (${details} different ${details === 1 ? "detail" : "details"}).`}
          </p>

          {suggestions.length === 0 && <p className="empty">Nothing was found automatically. That does not mean the document has nothing sensitive.</p>}

          {suggestions.length > 0 && (
            <p className="review__bulk">
              <button type="button" className="btn btn--quiet" onClick={() => onChange({ suggestions, selected: new Set(suggestions.map((s) => s.id)) })}>
                Select all
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => onChange({ suggestions, selected: new Set() })}>
                Select none
              </button>
            </p>
          )}

          {groups.map((g) => (
            <fieldset key={g.kind} className="review__group">
              <legend className="review__legend">
                {KIND_LABELS[g.kind]} ({g.items.length})
              </legend>
              <ul className="review__list">
                {g.items.map((s) => {
                  const id = `${termId}-${s.id}`;
                  return (
                    <li key={s.id} className="review__item">
                      <input id={id} type="checkbox" className="review__check" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                      <label htmlFor={id} className="review__label">
                        <span className="review__value">{s.value}</span>
                        <span className="review__meta">
                          {s.occurrences.length} {s.occurrences.length === 1 ? "place" : "places"}. {s.reason}
                          {s.confidence === "medium" ? ". Check this one" : ""}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}

          <form className="review__add" onSubmit={addOwn}>
            <h3 className="review__addtitle">Add something yourself</h3>
            <p className="ask__hint">Type a name, address or number exactly as it appears. Every place it occurs is replaced, even across line breaks.</p>
            <div className="review__addrow">
              <label className="sr-only" htmlFor={termId}>
                Text to redact
              </label>
              <input id={termId} className="ask__input" type="text" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="For example: Jordan Example" autoComplete="off" />
              <label className="sr-only" htmlFor={kindId}>
                What it is
              </label>
              <select id={kindId} className="review__select" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {ADDABLE.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn--secondary" disabled={term.trim().length < 2}>
                Add
              </button>
            </div>
            <p className="review__feedback" aria-live="polite">
              {feedback}
            </p>
          </form>

          <div className="review__actions">
            <button type="button" className="btn btn--primary" disabled={!liveEnabled} onClick={() => onAnalyse(redacted)}>
              Analyse redacted text
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => download(redacted.pages, name)}>
              Download redacted text
            </button>
            <button type="button" className="btn btn--quiet" onClick={onCancel}>
              Choose a different file
            </button>
          </div>
          {!liveEnabled && (
            <p className="review__feedback">
              Live AI analysis is switched off on this demo, so you can redact and download the text here but not analyse it. Nothing was uploaded.
            </p>
          )}
        </div>
      </section>

      <section className="pane pane--document" aria-label="Preview">
        <div className="doc">
          <div className="review__views" role="group" aria-label="Preview">
            <button type="button" className="tab" aria-pressed={view === "sent"} onClick={() => setView("sent")}>
              What will be sent
            </button>
            <button type="button" className="tab" aria-pressed={view === "found"} onClick={() => setView("found")}>
              What was found
            </button>
          </div>
          {pages.map((page) => (
            <article key={page.page} className="sheet" aria-label={`Page ${page.page}`}>
              <p className="sheet__page">Page {page.page}</p>
              <div className="review__text">
                {segmentPage(page, suggestions, selected).map((seg, i) => {
                  if (!seg.suggestionId) return <span key={i}>{seg.text}</span>;
                  if (view === "sent") {
                    return seg.selected ? (
                      <span key={i} className="redacted">
                        {seg.label}
                      </span>
                    ) : (
                      <span key={i} className="kept" title="Found, but not redacted">
                        {seg.text}
                      </span>
                    );
                  }
                  return (
                    <span key={i} className={seg.selected ? "found" : "kept"} title={seg.selected ? `Will become ${seg.label}` : "Found, but not redacted"}>
                      {seg.text}
                    </span>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
