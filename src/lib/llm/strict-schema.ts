import type { JsonSchema } from "./types";

/**
 * Groq's strict mode requires every property to be listed in `required` and
 * every object to set `additionalProperties: false`. Optional values are
 * expressed as a type array that includes "null". This returns a list of
 * problems (empty means the schema is strict-compatible).
 */
export function checkStrictSchema(schema: JsonSchema, path = "$"): string[] {
  const problems: string[] = [];
  const node = schema as Record<string, unknown>;

  const isObject =
    node.type === "object" || (Array.isArray(node.type) && node.type.includes("object"));
  if (isObject) {
    const props = (node.properties ?? {}) as Record<string, JsonSchema>;
    const required = new Set((node.required as string[] | undefined) ?? []);
    if (node.additionalProperties !== false) {
      problems.push(`${path}: additionalProperties must be false`);
    }
    for (const key of Object.keys(props)) {
      if (!required.has(key)) problems.push(`${path}.${key}: must be listed in required`);
      problems.push(...checkStrictSchema(props[key], `${path}.${key}`));
    }
  }
  if (node.items && typeof node.items === "object") {
    problems.push(...checkStrictSchema(node.items as JsonSchema, `${path}[]`));
  }
  if (Array.isArray(node.anyOf)) {
    (node.anyOf as JsonSchema[]).forEach((s, i) =>
      problems.push(...checkStrictSchema(s, `${path}.anyOf[${i}]`)),
    );
  }
  return problems;
}
