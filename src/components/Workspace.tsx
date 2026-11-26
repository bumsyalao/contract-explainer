"use client";

import { useMemo, useState } from "react";
import type { AnalyzeResponse, SampleResponse } from "@/lib/api/types";
import type { LabelEntry } from "@/lib/redact/redact";
import { makeReveal } from "@/lib/redact/reveal";
import type { Selection } from "@/lib/ui/highlight";
import { DocumentView } from "./DocumentView";
import { Findings } from "./Findings";
import { RevealProvider } from "./reveal";

export type ActiveQuote = { key: string; sel: Selection; nonce: number };

type Props = {
  data: AnalyzeResponse;
  saved: SampleResponse["qa"] | null;
  liveEnabled: boolean;
  /** What was redacted on this device before analysis. The originals never left the browser. */
  redaction: { labels: LabelEntry[]; replaced: number } | null;
};

const identity = (text: string) => text;

export function Workspace({ data, saved, liveEnabled, redaction }: Props) {
  const [active, setActive] = useState<ActiveQuote | null>(null);
  const [revealed, setRevealed] = useState(false);
  const labels = useMemo(() => redaction?.labels ?? [], [redaction]);
  const reveal = useMemo(() => (revealed ? makeReveal(labels) : identity), [revealed, labels]);

  /** One entry point for every "show me where" link, so they all highlight the same way. */
  function show(key: string, sel: Selection) {
    setActive((prev) => ({ key, sel, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  return (
    <RevealProvider value={reveal}>
      <main className="workspace">
        <section className="pane pane--findings" id="findings" aria-label="Findings">
          {redaction && redaction.replaced > 0 && (
            <div className="redactbar" role="status">
              <p className="redactbar__text">
                {redaction.replaced} {redaction.replaced === 1 ? "place was" : "places were"} redacted on your device before analysis. The AI
                never saw the originals.
              </p>
              <button type="button" className="btn btn--quiet" aria-pressed={revealed} onClick={() => setRevealed((r) => !r)}>
                {revealed ? "Hide original details" : "Show original details"}
              </button>
            </div>
          )}
          <Findings data={data} saved={saved} liveEnabled={liveEnabled} labels={labels} activeKey={active?.key ?? null} onShow={show} />
        </section>
        <section className="pane pane--document" aria-label="Contract text">
          <DocumentView data={data} active={active} />
        </section>
      </main>
    </RevealProvider>
  );
}
