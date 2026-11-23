import { RateLimitError } from "./types";

export type RetryOptions = {
  maxRetries?: number;
  baseMs?: number;
  /** Never wait longer than this for one retry. */
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Retry only on rate limits (HTTP 429), with exponential backoff and jitter.
 * If the provider says how long to wait, we honour that, unless it is longer
 * than maxWaitMs (a daily quota), in which case we give up immediately.
 * After the last retry the RateLimitError is rethrown so the UI can show a
 * friendly "busy, try again" message instead of a crash.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseMs = 1000,
    maxWaitMs = 20_000,
    sleep = realSleep,
    random = Math.random,
  } = opts;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof RateLimitError) || attempt >= maxRetries) throw err;
      // A long wait means a daily quota, not a short burst. Retrying inside a
      // web request would just waste attempts, so surface it straight away.
      if (err.retryAfterMs !== undefined && err.retryAfterMs > maxWaitMs) throw err;
      const backoff = baseMs * 2 ** attempt * (0.75 + random() * 0.5);
      await sleep(err.retryAfterMs ?? backoff);
    }
  }
}
