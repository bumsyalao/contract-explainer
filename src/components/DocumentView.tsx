"use client";

import { useEffect } from "react";
import type { AnalyzeResponse } from "@/lib/api/types";
import { findClauseFor, splitForHighlight } from "@/lib/ui/highlight";
import { clauseLabel } from "@/lib/ui/labels";
import { useReveal } from "./reveal";
import type { ActiveQuote } from "./Workspace";

export function DocumentView({ data, active }: { data: AnalyzeResponse; active: ActiveQuote | null }) {
  const reveal = useReveal();
  const activeClause = active ? findClauseFor(data.clauses, active.sel) : null;

  // Bring the highlighted words into view whenever a new "show me where" link is used.
  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("active-quote")?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  return (
    <div className="doc">
      <p className="doc__back" hidden={!active}>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => document.getElementById("findings")?.scrollIntoView({ block: "start" })}
        >
          Back to findings
        </button>
      </p>

      {data.pages.map((p) => (
        <article key={p.page} className="sheet" aria-label={`Page ${p.page}`}>
          <p className="sheet__page">Page {p.page}</p>
          {data.clauses
            .filter((c) => c.page === p.page)
            .map((c) => {
              const isActive = activeClause?.id === c.id && activeClause.page === c.page;
              const parts = isActive && active ? splitForHighlight(c, active.sel) : null;
              return (
                <div key={c.id} id={`clause-${c.id}`} className="clause" data-active={isActive}>
                  <span className="clause__label">{clauseLabel(c.id)}</span>
                  <p className="clause__text">
                    {parts ? (
                      <>
                        {reveal(parts.before)}
                        {/* key restarts the highlighter animation on every new selection */}
                        <mark id="active-quote" key={active!.nonce} className="marker">
                          {reveal(parts.marked)}
                        </mark>
                        {reveal(parts.after)}
                      </>
                    ) : (
                      reveal(c.text)
                    )}
                  </p>
                </div>
              );
            })}
        </article>
      ))}
    </div>
  );
}
