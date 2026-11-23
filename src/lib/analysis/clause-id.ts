/**
 * Models sometimes copy the whole label ("[clause 2 | page 1]") or "clause 2"
 * instead of just the id. Reduce any of those to the bare id ("2").
 * Unknown shapes are returned trimmed, so the verifier can still reject them.
 */
export function normalizeClauseId(raw: string): string {
  const trimmed = raw.trim();
  const labelled = /clause\s+([^\s|\]]+)/i.exec(trimmed);
  if (labelled) return labelled[1];
  return trimmed.replace(/^[\[\(]+|[\]\)]+$/g, "").trim();
}
