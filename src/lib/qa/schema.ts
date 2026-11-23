import { z } from "zod";

/**
 * Strict-mode friendly: every field required, objects closed. When the document
 * does not answer the question, the model sets answerable to false and leaves
 * the answer empty. We enforce that again in code.
 */
export const AnswerSchema = z.object({
  answerable: z.boolean().describe("True only if the document itself answers the question."),
  answer: z.string().describe("A plain-language answer in at most four sentences. Empty if not answerable."),
  citations: z.array(
    z.object({
      clause_id: z.string().describe("Only the clause id, for example 7 or 3.2. No brackets, no word clause, no page."),
      quote: z.string().describe("Exact words copied from that clause that support the answer."),
    }),
  ),
});
export type Answer = z.infer<typeof AnswerSchema>;
