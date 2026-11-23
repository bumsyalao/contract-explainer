import {
  InvalidJsonError,
  ProviderError,
  RateLimitError,
  RetryableProviderError,
  type GenerateRequest,
  type GenerateResult,
  type LlmProvider,
} from "./types";

// See docs/groq-api-notes.md for where each of these comes from.
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

export type GroqOptions = {
  /** Short label for logs and the eval table. */
  name: string;
  model: string;
  apiKey: string;
  /** strict:true uses constrained decoding. Only some models support it. Default true. */
  strict?: boolean;
  /**
   * Sent as reasoning_effort when set. gpt-oss models accept low, medium, high.
   * Qwen 3.8 accepts none, default, low, medium, high. Lower effort means fewer
   * hidden reasoning tokens, which count against the free-tier token limits.
   */
  reasoningEffort?: "none" | "default" | "low" | "medium" | "high";
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

/**
 * Groq via its OpenAI-compatible chat completions endpoint.
 *
 * Groq does not retain inference requests by default (see docs/groq-api-notes.md),
 * and this endpoint has no `store` switch to forget. Free-tier limits are tight
 * (about 8K tokens per minute on the main models), so long contracts can hit a
 * 413 or 429. We surface those as friendly errors rather than crashing.
 */
export class GroqProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;
  private apiKey: string;
  private strict: boolean;
  private reasoningEffort?: GroqOptions["reasoningEffort"];
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(opts: GroqOptions) {
    if (!opts.apiKey) throw new Error("GROQ_API_KEY is not set");
    if (!opts.model) throw new Error(`No model configured for ${opts.name}`);
    this.name = opts.name;
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.strict = opts.strict ?? true;
    this.reasoningEffort = opts.reasoningEffort;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "result", strict: this.strict, schema: req.schema },
      },
      temperature: req.temperature ?? 0,
      ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
    };

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (err) {
      const aborted = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new ProviderError(aborted ? "The model took too long to respond." : "Could not reach the model API.");
    }

    if (res.status === 429) {
      throw new RateLimitError(
        "The model is rate limited right now.",
        parseRetryAfter(res.headers.get("retry-after")),
      );
    }
    if (res.status === 413) {
      throw new ProviderError("This document is too long for the free model limits. Try a shorter one.", 413);
    }
    if (!res.ok) {
      // Report only Groq's short error code/type. The message and failed_generation
      // fields can echo the contract, and our request holds it, so never include them.
      let label = "";
      let code = "";
      try {
        const errBody = (await res.json()) as { error?: { code?: unknown; type?: unknown } };
        const safe = (v: unknown) => (typeof v === "string" && /^[a-z0-9_.-]{1,60}$/i.test(v) ? v : "");
        code = safe(errBody.error?.code);
        label = [safe(errBody.error?.type), code].filter(Boolean).join("/");
      } catch {
        /* body was not JSON */
      }
      const message = `Model API error ${res.status}${label ? ` (${label})` : ""}.`;
      // The model wrote JSON that the server then rejected. It is intermittent, so try again.
      if (res.status === 400 && code === "json_validate_failed") throw new RetryableProviderError(message, res.status);
      throw new ProviderError(message, res.status);
    }

    const data = (await res.json()) as ChatResponse;
    const choice = data.choices?.[0];
    const rawText = choice?.message?.content ?? "";
    if (choice?.finish_reason === "length") {
      throw new InvalidJsonError("The model ran out of room before finishing its answer.", rawText);
    }
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new InvalidJsonError("The model did not return valid JSON.", rawText);
    }

    return {
      json,
      rawText,
      model: this.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
    };
  }
}
