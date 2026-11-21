import { describe, expect, it } from "vitest";
import { GeminiProvider } from "./gemini";
import { InvalidJsonError, ProviderError, RateLimitError } from "./types";

const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
const req = { system: "SYS", prompt: "CONTRACT TEXT", schema };

function okBody(text: string) {
  return {
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
    usage: { total_input_tokens: 100, total_output_tokens: 20, total_thought_tokens: 30 },
  };
}

function makeProvider(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  const p = new GeminiProvider({ name: "t", model: "m-1", apiKey: "SECRET-KEY", fetchImpl });
  return { p, calls };
}

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });

describe("GeminiProvider", () => {
  it("always sends store:false, the schema, and the system instruction separately", async () => {
    const { p, calls } = makeProvider(() => json(okBody('{"ok":true}')));
    await p.generate(req);
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.store).toBe(false);
    expect(sent.model).toBe("m-1");
    expect(sent.system_instruction).toBe("SYS");
    expect(sent.input).toBe("CONTRACT TEXT");
    expect(sent.response_format).toEqual({ type: "text", mime_type: "application/json", schema });
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
  });

  it("sends the key in a header, never in the URL or body", async () => {
    const { p, calls } = makeProvider(() => json(okBody('{"ok":true}')));
    await p.generate(req);
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("SECRET-KEY");
    expect(calls[0].url).not.toContain("SECRET-KEY");
    expect(calls[0].init.body as string).not.toContain("SECRET-KEY");
  });

  it("parses JSON output and counts thinking tokens as output", async () => {
    const { p } = makeProvider(() => json(okBody('{"ok":true}')));
    const r = await p.generate(req);
    expect(r.json).toEqual({ ok: true });
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(r.model).toBe("m-1");
  });

  it("maps 429 to RateLimitError and reads Retry-After", async () => {
    const { p } = makeProvider(() => json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429, { "retry-after": "7" }));
    await expect(p.generate(req)).rejects.toMatchObject({ name: "RateLimitError", retryAfterMs: 7000 });
    await expect(p.generate(req)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("maps other HTTP errors to ProviderError without leaking the contract or key", async () => {
    const { p } = makeProvider(() => json({ error: { status: "INVALID_ARGUMENT", message: "echo CONTRACT TEXT" } }, 400));
    const err = await p.generate(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(400);
    expect(err.message).not.toContain("CONTRACT TEXT");
    expect(err.message).not.toContain("SECRET-KEY");
  });

  it("throws InvalidJsonError when the text is not JSON", async () => {
    const { p } = makeProvider(() => json(okBody("not json")));
    await expect(p.generate(req)).rejects.toBeInstanceOf(InvalidJsonError);
  });

  it("wraps network failures in ProviderError", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const p = new GeminiProvider({ name: "t", model: "m", apiKey: "k", fetchImpl });
    await expect(p.generate(req)).rejects.toBeInstanceOf(ProviderError);
  });

  it("refuses to construct without a key or model", () => {
    expect(() => new GeminiProvider({ name: "t", model: "m", apiKey: "" })).toThrow();
    expect(() => new GeminiProvider({ name: "t", model: "", apiKey: "k" })).toThrow();
  });
});
