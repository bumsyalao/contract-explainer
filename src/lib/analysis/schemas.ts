import { z } from "zod";
import type { JsonSchema } from "@/lib/llm/types";

/**
 * One definition per call. Zod validates at runtime and produces the JSON Schema
 * we send to the model. Every field is required and objects are closed, because
 * Groq's strict mode demands it (optional values are nullable instead).
 *
 * The model never tells us a page number. We look the page up from clause_id.
 */

export const KEY_TERM_CATEGORIES = [
  "start_date",
  "end_date",
  "term_length",
  "payment_amount",
  "payment_schedule",
  "notice_period",
  "renewal",
  "penalty",
  "deposit",
  "governing_law",
  "other",
] as const;

export const KeyTermsSchema = z.object({
  document_type: z.enum(["lease", "freelance_agreement", "licence", "other"]),
  summary: z.string().describe("Two or three plain-language sentences about what this agreement is."),
  parties: z.array(
    z.object({
      name: z.string(),
      role: z.string().describe("For example Client, Contractor, Landlord, Tenant, Licensor, Licensee."),
    }),
  ),
  key_terms: z.array(
    z.object({
      category: z.enum(KEY_TERM_CATEGORIES),
      label: z.string().describe("Short name, for example Monthly fee or Notice to end."),
      value: z.string().describe("The term in plain language, for example 75 days after receipt."),
      clause_id: z.string().describe("The id of the clause the term comes from, exactly as shown in brackets."),
      quote: z.string().describe("Exact words copied from that clause that support the term."),
    }),
  ),
});
export type KeyTerms = z.infer<typeof KeyTermsSchema>;

export const FLAG_CATEGORIES = [
  "auto_renewal",
  "unilateral_termination",
  "liability",
  "indemnity",
  "ip_assignment",
  "non_compete",
  "payment_terms",
  "penalty",
  "dispute_resolution",
  "one_sided_terms",
  "other",
] as const;

export const RiskFlagsSchema = z.object({
  flags: z.array(
    z.object({
      clause_id: z.string().describe("The id of the clause, exactly as shown in brackets."),
      quote: z.string().describe("Exact words copied from that clause. No paraphrasing, no ellipses."),
      category: z.enum(FLAG_CATEGORIES),
      severity: z.enum(["low", "medium", "high"]),
      title: z.string().describe("Five words or fewer."),
      explanation: z.string().describe("Plain-language reason this could be a problem for the person signing."),
    }),
  ),
});
export type RiskFlags = z.infer<typeof RiskFlagsSchema>;
export type RiskFlag = RiskFlags["flags"][number];

/** JSON Schema for a provider, cleaned of noise that adds grammar states. */
export function toProviderSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema" || k === "minimum" || k === "maximum") continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(raw) as JsonSchema;
}
