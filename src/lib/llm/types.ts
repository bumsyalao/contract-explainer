/** A JSON Schema object describing the shape we want back. */
export type JsonSchema = Record<string, unknown>;

export type GenerateRequest = {
  /** Trusted instructions. Never put contract text here. */
  system: string;
  /** User turn. Untrusted contract text goes here, inside clear delimiters. */
  prompt: string;
  schema: JsonSchema;
  temperature?: number;
};

export type GenerateResult = {
  /** Parsed JSON. Still unvalidated: callers must check it against their own types. */
  json: unknown;
  rawText: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
};

export interface LlmProvider {
  /** Short label for logs and the eval table, e.g. "gemini-flash". */
  readonly name: string;
  /** Exact model id sent to the API. */
  readonly model: string;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class InvalidJsonError extends Error {
  constructor(
    message: string,
    public rawText: string,
  ) {
    super(message);
    this.name = "InvalidJsonError";
  }
}
