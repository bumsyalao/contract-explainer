/**
 * Kill switch for the public demo. Set LIVE_ANALYSIS=off in the environment to
 * serve only the saved sample: no uploads, no live questions, no model calls.
 * Anything else (or unset) leaves live analysis on.
 */
export function isLiveEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LIVE_ANALYSIS?.trim().toLowerCase() !== "off";
}
