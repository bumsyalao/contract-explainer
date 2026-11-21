import {
  InvalidJsonError,
  ProviderError,
  RateLimitError,
  type GenerateRequest,
  type GenerateResult,
  type LlmProvider,
} from "./types";

// See docs/gemini-api-notes.md for where each of these comes from.
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const API_REVISION = "2026-05-20";
const MAX_OUTPUT_TOKENS = 8192;

export type GeminiOptions = {
  /** Short label for logs and the eval table. */
  name: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type InteractionResponse = {
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_thought_tokens?: number;
  };
};

function extractText(body: InteractionResponse): string {
  const parts: string[] = [];
  for (const step of body.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const c of step.content ?? []) {
      if (c.type === "text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

/**
 * Gemini via the Interactions API.
 *
 * PRIVACY: the API stores every interaction by default (1 day on the free
 * tier). We send `store: false` on every request so nothing is retained.
 * A test asserts this, so do not remove it.
 */
export class GeminiProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(opts: GeminiOptions) {
    if (!opts.apiKey) throw new Error("GOOGLE_API_KEY is not set");
    if (!opts.model) throw new Error(`No model configured for ${opts.name}`);
    this.name = opts.name;
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
  }

  async generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    // The interactions endpoint lists no temperature field, so req.temperature
    // is intentionally not sent.
    const body = {
      model: this.model,
      input: req.prompt,
      system_instruction: req.system,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: req.schema,
      },
      generation_config: { max_output_tokens: MAX_OUTPUT_TOKENS },
      store: false,
    };

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1beta/interactions`, {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json",
          "Api-Revision": API_REVISION,
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
    if (!res.ok) {
      // Report the API's own message but never echo our request (it holds the contract).
      let detail = "";
      try {
        const errBody = (await res.json()) as { error?: { message?: string; status?: string } };
        detail = errBody.error?.status ?? "";
      } catch {
        /* ignore */
      }
      throw new ProviderError(`Model API error ${res.status}${detail ? ` (${detail})` : ""}.`, res.status);
    }

    const data = (await res.json()) as InteractionResponse;
    const rawText = extractText(data);
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new InvalidJsonError("The model did not return valid JSON.", rawText);
    }

    const u = data.usage ?? {};
    return {
      json,
      rawText,
      model: this.model,
      // Thinking tokens are billed as output, so count them there.
      usage: {
        inputTokens: u.total_input_tokens ?? 0,
        outputTokens: (u.total_output_tokens ?? 0) + (u.total_thought_tokens ?? 0),
      },
      latencyMs: Date.now() - started,
    };
  }
}
