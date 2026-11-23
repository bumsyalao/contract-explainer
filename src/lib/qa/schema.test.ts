import { describe, expect, it } from "vitest";
import { toProviderSchema } from "@/lib/analysis/schemas";
import { checkStrictSchema } from "@/lib/llm/strict-schema";
import { AnswerSchema } from "./schema";

describe("AnswerSchema", () => {
  it("is compatible with Groq strict mode", () => {
    expect(checkStrictSchema(toProviderSchema(AnswerSchema))).toEqual([]);
  });
  it("never asks the model for a page number", () => {
    expect(JSON.stringify(toProviderSchema(AnswerSchema))).not.toMatch(/"page"/);
  });
});
