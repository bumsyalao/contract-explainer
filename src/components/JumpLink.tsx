"use client";

import { locationLabel } from "@/lib/ui/labels";

/** The link that takes you to the exact clause and page, and highlights the quote there. */
export function JumpLink({
  clauseId,
  page,
  onClick,
}: {
  clauseId: string;
  page: number;
  onClick: () => void;
}) {
  const label = locationLabel(clauseId, page);
  return (
    <button type="button" className="jump" onClick={onClick} aria-label={`Show ${label} in the contract`}>
      {label}
    </button>
  );
}
