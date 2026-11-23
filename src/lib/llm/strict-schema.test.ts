import { describe, expect, it } from "vitest";
import { checkStrictSchema } from "./strict-schema";

describe("checkStrictSchema", () => {
  it("accepts a closed object with all fields required", () => {
    expect(
      checkStrictSchema({
        type: "object",
        properties: { a: { type: "string" }, b: { type: ["string", "null"] } },
        required: ["a", "b"],
        additionalProperties: false,
      }),
    ).toEqual([]);
  });

  it("reports missing required fields and open objects, including nested ones", () => {
    const problems = checkStrictSchema({
      type: "object",
      properties: {
        a: { type: "string" },
        list: {
          type: "array",
          items: { type: "object", properties: { x: { type: "string" } }, required: [] },
        },
      },
      required: ["list"],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "$: additionalProperties must be false",
        "$.a: must be listed in required",
        "$.list[]: additionalProperties must be false",
        "$.list[].x: must be listed in required",
      ]),
    );
  });

  it("checks inside anyOf branches", () => {
    const problems = checkStrictSchema({
      anyOf: [{ type: "object", properties: { x: { type: "string" } }, required: ["x"] }],
    });
    expect(problems).toEqual(["$.anyOf[0]: additionalProperties must be false"]);
  });
});
