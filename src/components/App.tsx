"use client";

import { useRef, useState } from "react";
import type { AnalyzeResponse, SampleResponse } from "@/lib/api/types";
import { extractPagesInBrowser, BrowserReadError } from "@/lib/pdf/extract-browser";
import { ExtractError, type Page } from "@/lib/pdf/pages";
import { detect, type LabelEntry, type Redacted } from "@/lib/redact/redact";
import type { Suggestion } from "@/lib/redact/types";
import { analyzeText, ApiClientError, checkFile, loadSample } from "@/lib/ui/client";
import { Landing } from "./Landing";
import { RedactionReview } from "./RedactionReview";
import { Workspace } from "./Workspace";

type Phase =
  | { kind: "idle"; error?: { message: string; rateLimited: boolean } }
  | { kind: "reading"; what: string }
  | { kind: "review"; error?: string }
  | { kind: "analysing"; what: string }
  | {
      kind: "ready";
      data: AnalyzeResponse;
      name: string;
      /** Saved answers for the sample, so suggested questions need no live call. */
      saved: SampleResponse["qa"] | null;
      /** What was redacted before analysis. The originals stay in this browser. */
      redaction: { labels: LabelEntry[]; replaced: number } | null;
    };

/** The work in progress on the review screen. Kept here so a failed analysis does not lose it. */
type Review = { name: string; pages: Page[]; suggestions: Suggestion[]; selected: Set<string> };

export function App({ liveEnabled }: { liveEnabled: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [review, setReview] = useState<Review | null>(null);
  // Lets us ignore a slow response if the person has started something else.
  const latest = useRef(0);

  function fail(id: number, err: unknown) {
    if (id !== latest.current) return;
    const known = err instanceof ApiClientError || err instanceof ExtractError || err instanceof BrowserReadError;
    setPhase({
      kind: "idle",
      error: { message: known ? err.message : "Something went wrong. Please try again.", rateLimited: err instanceof ApiClientError && err.code === "RATE_LIMITED" },
    });
  }

  /** Read the PDF here in the browser and find what looks personal. Nothing is uploaded. */
  async function onFile(file: File) {
    const problem = checkFile(file);
    if (problem) {
      setPhase({ kind: "idle", error: { message: problem, rateLimited: false } });
      return;
    }
    const id = ++latest.current;
    setPhase({ kind: "reading", what: file.name });
    try {
      const pages = await extractPagesInBrowser(file);
      if (id !== latest.current) return;
      const suggestions = detect(pages);
      setReview({ name: file.name, pages, suggestions, selected: new Set(suggestions.map((s) => s.id)) });
      setPhase({ kind: "review" });
    } catch (err) {
      fail(id, err);
    }
  }

  /** Send only the redacted text. On failure, go back to the review screen with the choices intact. */
  async function onAnalyse(redacted: Redacted) {
    if (!review) return;
    const id = ++latest.current;
    const name = review.name;
    setPhase({ kind: "analysing", what: name });
    try {
      const data = await analyzeText(redacted.pages);
      if (id !== latest.current) return;
      // The original text is no longer needed. Only the label map is kept, for optional reading.
      setReview(null);
      setPhase({ kind: "ready", data, name, saved: null, redaction: { labels: redacted.labels, replaced: redacted.replaced } });
    } catch (err) {
      if (id !== latest.current) return;
      setPhase({ kind: "review", error: err instanceof ApiClientError ? err.message : "Something went wrong. Please try again." });
    }
  }

  /** The made-up example goes through exactly the same path as a file the person chooses. */
  async function onExample() {
    try {
      const res = await fetch("/samples/redaction-example.pdf");
      if (!res.ok) throw new Error("not found");
      await onFile(new File([await res.blob()], "redaction-example.pdf", { type: "application/pdf" }));
    } catch {
      setPhase({ kind: "idle", error: { message: "Could not load the example. Please try again.", rateLimited: false } });
    }
  }

  async function onSample() {
    const id = ++latest.current;
    setReview(null);
    setPhase({ kind: "analysing", what: "the sample contract" });
    try {
      const sample = await loadSample();
      if (id === latest.current) {
        setPhase({ kind: "ready", data: sample.analysis, name: "Sample contract", saved: sample.qa, redaction: null });
      }
    } catch (err) {
      fail(id, err);
    }
  }

  function reset() {
    latest.current++;
    setReview(null);
    setPhase({ kind: "idle" });
  }

  return (
    <div className="app">
      <header className="bar">
        <span className="bar__name">Contract Explainer</span>
        {phase.kind === "ready" && (
          <span className="bar__file" title={phase.name}>
            {phase.saved ? "Sample contract (saved result)" : phase.name}
          </span>
        )}
        {phase.kind === "review" && review && (
          <span className="bar__file" title={review.name}>
            Review: {review.name}
          </span>
        )}
        <span className="bar__note">Explains and flags. Not legal advice.</span>
        {(phase.kind === "ready" || phase.kind === "review") && (
          <button type="button" className="btn btn--quiet" onClick={reset}>
            Start over
          </button>
        )}
      </header>

      {phase.kind === "ready" ? (
        <Workspace key={phase.name} data={phase.data} saved={phase.saved} liveEnabled={liveEnabled} redaction={phase.redaction} />
      ) : phase.kind === "review" && review ? (
        <RedactionReview
          name={review.name}
          pages={review.pages}
          suggestions={review.suggestions}
          selected={review.selected}
          liveEnabled={liveEnabled}
          error={phase.error ?? null}
          onChange={(next) => setReview({ ...review, suggestions: next.suggestions, selected: next.selected })}
          onAnalyse={onAnalyse}
          onCancel={reset}
        />
      ) : (
        <Landing
          liveEnabled={liveEnabled}
          loading={phase.kind === "reading" ? { what: phase.what, stage: "reading" } : phase.kind === "analysing" ? { what: phase.what, stage: "analysing" } : null}
          error={phase.kind === "idle" ? (phase.error ?? null) : null}
          onFile={onFile}
          onSample={onSample}
          onExample={onExample}
        />
      )}
    </div>
  );
}
