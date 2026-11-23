"use client";

import type { AnalyzeResponse } from "@/lib/api/types";
import type { Selection } from "@/lib/ui/highlight";
import { clauseLabel, FLAG_CATEGORY_LABELS, SEVERITY_LABELS, sortFlags } from "@/lib/ui/labels";
import { JumpLink } from "./JumpLink";

type Props = {
  flags: AnalyzeResponse["flags"];
  activeKey: string | null;
  onShow: (key: string, sel: Selection) => void;
};

export function RiskList({ flags, activeKey, onShow }: Props) {
  if (flags.length === 0) {
    return (
      <p className="empty">
        No risky clauses were found with a quote we could verify. That does not mean the contract is safe, so read it
        before you sign.
      </p>
    );
  }

  const sorted = sortFlags(flags);
  return (
    <ul className="list">
      {sorted.map((f, i) => {
        const key = `risk:${f.clause_id}:${f.start}:${i}`;
        const show = () => onShow(key, { page: f.page, start: f.start, end: f.end });
        return (
          // The row is clickable for mouse users. The jump link is the keyboard path.
          <li key={key} className={`risk risk--${f.severity}`} data-active={activeKey === key} onClick={show}>
            <p className="risk__meta">
              <span className="risk__sev">{SEVERITY_LABELS[f.severity]}</span>
              <span className="risk__cat">{FLAG_CATEGORY_LABELS[f.category]}</span>
            </p>
            <h3 className="risk__title">{f.title}</h3>
            <p className="risk__why">{f.explanation}</p>
            <blockquote className="quote">{f.quote}</blockquote>
            <p className="risk__where">
              <JumpLink clauseId={f.clause_id} page={f.page} onClick={show} />
              {f.relocated_from && (
                <span className="risk__note">
                  The AI first pointed to {clauseLabel(f.relocated_from)}. The quote is in {clauseLabel(f.clause_id)}.
                </span>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
