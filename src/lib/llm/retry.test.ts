import { describe, expect, it } from "vitest";
import { withRetry } from "./retry";
import { ProviderError, RateLimitError } from "./types";

const noJitter = { random: () => 0.5 }; // multiplier = 1.0

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    expect(await withRetry(async () => 42)).toBe(42);
  });

  it("retries 429s with exponential backoff, then succeeds", async () => {
    const waits: number[] = [];
    let n = 0;
    const result = await withRetry(
      async () => {
        if (++n < 3) throw new RateLimitError("429");
        return "ok";
      },
      { ...noJitter, baseMs: 100, sleep: async (ms) => void waits.push(ms) },
    );
    expect(result).toBe("ok");
    expect(waits).toEqual([100, 200]);
  });

  it("honours a short retryAfterMs", async () => {
    const waits: number[] = [];
    let n = 0;
    await withRetry(
      async () => {
        if (++n === 1) throw new RateLimitError("429", 5000);
        return "ok";
      },
      { ...noJitter, maxWaitMs: 8000, sleep: async (ms) => void waits.push(ms) },
    );
    expect(waits).toEqual([5000]);
  });

  it("gives up immediately when the wait exceeds maxWaitMs (daily quota)", async () => {
    let calls = 0;
    const waits: number[] = [];
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new RateLimitError("daily limit", 3 * 60 * 60 * 1000);
        },
        { maxWaitMs: 20_000, sleep: async (ms) => void waits.push(ms) },
      ),
    ).rejects.toMatchObject({ retryAfterMs: 10_800_000 });
    expect(calls).toBe(1);
    expect(waits).toEqual([]);
  });

  it("rethrows the RateLimitError after maxRetries", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new RateLimitError("429");
        },
        { maxRetries: 2, sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toBe(3); // first try plus two retries
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new ProviderError("bad request", 400);
      }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
  });
});
