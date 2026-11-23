"use client";

import { useState } from "react";
import type { AnalyzeResponse, SampleResponse } from "@/lib/api/types";
import type { Selection } from "@/lib/ui/highlight";
import { DocumentView } from "./DocumentView";
import { Findings } from "./Findings";

export type ActiveQuote = { key: string; sel: Selection; nonce: number };

export function Workspace({ data, saved }: { data: AnalyzeResponse; saved: SampleResponse["qa"] | null }) {
  const [active, setActive] = useState<ActiveQuote | null>(null);

  /** One entry point for every "show me where" link, so they all highlight the same way. */
  function show(key: string, sel: Selection) {
    setActive((prev) => ({ key, sel, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  return (
    <main className="workspace">
      <section className="pane pane--findings" id="findings" aria-label="Findings">
        <Findings data={data} saved={saved} activeKey={active?.key ?? null} onShow={show} />
      </section>
      <section className="pane pane--document" aria-label="Contract text">
        <DocumentView data={data} active={active} />
      </section>
    </main>
  );
}
