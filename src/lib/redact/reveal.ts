/**
 * Swap labels such as [PERSON_1] back to the original text, for the person's own reading.
 * Pure and display-only: it changes what is shown, never what was sent, and the originals
 * stay in the browser.
 */
import type { LabelEntry } from "./redact";

export function makeReveal(labels: LabelEntry[]): (text: string) => string {
  if (labels.length === 0) return (text) => text;
  const originals = new Map(labels.map((l) => [l.label, l.original]));
  return (text) => text.replace(/\[[A-Z]+_\d+\]/g, (label) => originals.get(label) ?? label);
}
