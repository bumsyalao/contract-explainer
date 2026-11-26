"use client";

import type { AnalyzeResponse } from "@/lib/api/types";
import type { Selection } from "@/lib/ui/highlight";
import { TERM_CATEGORY_LABELS } from "@/lib/ui/labels";
import { JumpLink } from "./JumpLink";
import { useReveal } from "./reveal";

type Props = {
  terms: AnalyzeResponse["keyTerms"]["key_terms"];
  activeKey: string | null;
  onShow: (key: string, sel: Selection) => void;
};

export function KeyTerms({ terms, activeKey, onShow }: Props) {
  const reveal = useReveal();
  if (terms.length === 0) {
    return <p className="empty">No key terms were found with a quote we could verify.</p>;
  }
  const sorted = [...terms].sort((a, b) => a.page - b.page || a.start - b.start);
  return (
    <ul className="list">
      {sorted.map((t, i) => {
        const key = `term:${t.clause_id}:${t.start}:${i}`;
        const show = () => onShow(key, { page: t.page, start: t.start, end: t.end });
        return (
          <li key={key} className="term" data-active={activeKey === key} onClick={show}>
            <p className="term__meta">{TERM_CATEGORY_LABELS[t.category]}</p>
            <p className="term__line">
              <span className="term__label">{reveal(t.label)}</span>
              <span className="term__value">{reveal(t.value)}</span>
            </p>
            <p className="term__where">
              <JumpLink clauseId={t.clause_id} page={t.page} onClick={show} />
            </p>
          </li>
        );
      })}
    </ul>
  );
}
