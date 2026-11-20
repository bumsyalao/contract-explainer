import type { GenerateRequest, GenerateResult, LlmProvider } from "./types";

/** Deterministic provider for tests and offline development. */
export class MockProvider implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock-model";
  calls: GenerateRequest[] = [];

  constructor(private respond: (req: GenerateRequest) => unknown | Promise<unknown>) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.calls.push(req);
    const json = await this.respond(req);
    return {
      json,
      rawText: JSON.stringify(json),
      model: this.model,
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
    };
  }
}
