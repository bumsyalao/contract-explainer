"use client";

import { useId, useState, type KeyboardEvent } from "react";
import type { AnalyzeResponse, SampleResponse } from "@/lib/api/types";
import type { Selection } from "@/lib/ui/highlight";
import { AskPanel } from "./AskPanel";
import { JumpLink } from "./JumpLink";
import { KeyTerms } from "./KeyTerms";
import { RiskList } from "./RiskList";

type Props = {
  data: AnalyzeResponse;
  saved: SampleResponse["qa"] | null;
  liveEnabled: boolean;
  activeKey: string | null;
  onShow: (key: string, sel: Selection) => void;
};

const DOC_TYPES: Record<string, string> = {
  lease: "Lease",
  freelance_agreement: "Freelance agreement",
  licence: "Licence",
  other: "Agreement",
};

type TabId = "risks" | "terms" | "ask";

export function Findings({ data, saved, liveEnabled, activeKey, onShow }: Props) {
  const [tab, setTab] = useState<TabId>("risks");
  const base = useId();
  const { keyTerms, flags, droppedByReason } = data;

  const removed = Object.entries(droppedByReason)
    .filter(([reason]) => reason !== "duplicate")
    .reduce((n, [, count]) => n + (count ?? 0), 0);

  const tabs: { id: TabId; label: string }[] = [
    { id: "risks", label: `Risks (${flags.length})` },
    { id: "terms", label: `Key terms (${keyTerms.key_terms.length})` },
    { id: "ask", label: "Ask a question" },
  ];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`${base}-tab-${tabs[next].id}`)?.focus();
  }

  return (
    <div className="findings">
      <header className="summary">
        <h2 className="summary__title">{DOC_TYPES[keyTerms.document_type] ?? "Agreement"}</h2>
        {keyTerms.parties.length > 0 && (
          <p className="summary__parties">
            {keyTerms.parties.map((p) => `${p.name} (${p.role})`).join(" and ")}
          </p>
        )}
        <p className="summary__text">{keyTerms.summary}</p>
        <p className="summary__check">
          Every highlighted quote was found in the document.
          {removed > 0 &&
            ` ${removed} AI ${removed === 1 ? "suggestion was" : "suggestions were"} removed because ${removed === 1 ? "its quote was" : "their quotes were"} not found.`}
          {!data.structured && " No numbered clauses were found, so the text is split into sections."}
        </p>
      </header>

      {data.aiDirectedText.length > 0 && (
        <section className="aiwarn" aria-labelledby={`${base}-aiwarn`}>
          <h3 id={`${base}-aiwarn`} className="aiwarn__title">
            This contract contains text aimed at AI readers
          </h3>
          <p className="aiwarn__text">
            Some wording in the document tries to give orders to an AI, such as hiding risks or calling the contract
            safe. Treat that as a red flag about whoever wrote it. We kept it away from the AI, so it did not affect
            the findings below. We find this with fixed patterns, so a reworded version could be missed.
          </p>
          <ul className="aiwarn__list">
            {data.aiDirectedText.map((f, i) => {
              const key = `ai:${f.clause_id}:${f.start}:${i}`;
              const show = () => onShow(key, { page: f.page, start: f.start, end: f.end });
              return (
                <li key={key} className="aiwarn__item" data-active={activeKey === key}>
                  <blockquote className="quote">{f.quote}</blockquote>
                  <p className="aiwarn__where">
                    <JumpLink clauseId={f.clause_id} page={f.page} onClick={show} />
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="tabs" role="tablist" aria-label="Findings" onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* All three panels stay mounted and the inactive ones are hidden, so the question history
          and any half-typed question survive a trip to another tab. */}
      <div role="tabpanel" id={`${base}-panel-risks`} aria-labelledby={`${base}-tab-risks`} className="tabpanel" hidden={tab !== "risks"}>
        <RiskList flags={flags} activeKey={activeKey} onShow={onShow} />
      </div>
      <div role="tabpanel" id={`${base}-panel-terms`} aria-labelledby={`${base}-tab-terms`} className="tabpanel" hidden={tab !== "terms"}>
        <KeyTerms terms={keyTerms.key_terms} activeKey={activeKey} onShow={onShow} />
      </div>
      <div role="tabpanel" id={`${base}-panel-ask`} aria-labelledby={`${base}-tab-ask`} className="tabpanel" hidden={tab !== "ask"}>
        <AskPanel data={data} saved={saved} liveEnabled={liveEnabled} activeKey={activeKey} onShow={onShow} onGoToRisks={() => setTab("risks")} />
      </div>

      <p className="findings__foot">
        This tool explains and flags. It is not legal advice. For anything important, check the contract with a
        qualified professional.
      </p>
    </div>
  );
}
