import { describe, expect, it } from "vitest";
import { GroqProvider } from "./groq";
import { InvalidJsonError, ProviderError, RateLimitError } from "./types";

const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};
const req = { system: "SYS", prompt: "CONTRACT TEXT", schema };

const okBody = (content: string, finish = "stop") => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 120, completion_tokens: 40 },
});

function makeProvider(respond: () => Response, strict?: boolean) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
  const p = new GroqProvider({ name: "t", model: "m-1", apiKey: "SECRET-KEY", strict, fetchImpl });
  return { p, calls };
}

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });

describe("GroqProvider", () => {
  it("sends system and user messages separately with a strict json_schema", async () => {
    const { p, calls } = makeProvider(() => json(okBody('{"ok":true}')));
    await p.generate(req);
    const sent = JSON.parse(calls[0].init.body as string);
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(sent.model).toBe("m-1");
    expect(sent.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "CONTRACT TEXT" },
    ]);
    expect(sent.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "result", strict: true, schema },
    });
    expect(sent.temperature).toBe(0);
  });

  it("can switch to best-effort mode for models without strict support", async () => {
    const { p, calls } = makeProvider(() => json(okBody('{"ok":true}')), false);
    await p.generate(req);
    expect(JSON.parse(calls[0].init.body as string).response_format.json_schema.strict).toBe(false);
  });

  it("sends the key only in the Authorization header", async () => {
    const { p, calls } = makeProvider(() => json(okBody('{"ok":true}')));
    await p.generate(req);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer SECRET-KEY");
    expect(calls[0].url).not.toContain("SECRET-KEY");
    expect(calls[0].init.body as string).not.toContain("SECRET-KEY");
  });

  it("parses JSON and reports token usage", async () => {
    const { p } = makeProvider(() => json(okBody('{"ok":true}')));
    const r = await p.generate(req);
    expect(r.json).toEqual({ ok: true });
    expect(r.usage).toEqual({ inputTokens: 120, outputTokens: 40 });
  });

  it("maps 429 to RateLimitError and reads retry-after seconds", async () => {
    const { p } = makeProvider(() => json({ error: {} }, 429, { "retry-after": "12" }));
    await expect(p.generate(req)).rejects.toMatchObject({ name: "RateLimitError", retryAfterMs: 12000 });
    await expect(p.generate(req)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("gives a friendly message for 413 (document too long)", async () => {
    const { p } = makeProvider(() => json({ error: {} }, 413));
    const err = await p.generate(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(413);
    expect(err.message).toContain("too long");
  });

  it("does not leak the contract or key in other errors", async () => {
    const { p } = makeProvider(() => json({ error: { message: "echo CONTRACT TEXT SECRET-KEY" } }, 400));
    const err = await p.generate(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).not.toContain("CONTRACT TEXT");
    expect(err.message).not.toContain("SECRET-KEY");
  });

  it("flags truncated output (finish_reason length) as InvalidJsonError", async () => {
    const { p } = makeProvider(() => json(okBody('{"ok":', "length")));
    await expect(p.generate(req)).rejects.toBeInstanceOf(InvalidJsonError);
  });

  it("throws InvalidJsonError for non-JSON text", async () => {
    const { p } = makeProvider(() => json(okBody("sorry, cannot do that")));
    await expect(p.generate(req)).rejects.toBeInstanceOf(InvalidJsonError);
  });

  it("refuses to construct without a key or model", () => {
    expect(() => new GroqProvider({ name: "t", model: "m", apiKey: "" })).toThrow();
    expect(() => new GroqProvider({ name: "t", model: "", apiKey: "k" })).toThrow();
  });
});
