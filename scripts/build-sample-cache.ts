/**
 * Builds src/samples/freelance-agreement.cache.json from one real run, so the
 * public demo works with no live model calls. Needs a working GROQ_API_KEY.
 * Only ever run this on the synthetic sample.
 *
 *   npx tsx scripts/build-sample-cache.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { envWithModelDefaults } from "./env";
import path from "node:path";
import { createProvider, DEFAULT_PROVIDER } from "../src/lib/llm";
import { analyzeDocument } from "../src/lib/pipeline/analyze-document";
import { answerQuestion } from "../src/lib/qa/answer";

export const SUGGESTED_QUESTIONS = [
  "How much notice does each side have to give to end the contract?",
  "Can I show this work in my portfolio?",
  "When do I get paid, and what happens if I am late?",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const provider = createProvider(DEFAULT_PROVIDER, await envWithModelDefaults());
  const pdf = new Uint8Array(await readFile(path.join(process.cwd(), "public/samples/freelance-agreement.pdf")));

  console.log("analysing...");
  const analysis = await analyzeDocument(provider, pdf);
  console.log(`  ${analysis.flags.length} flags, ${analysis.keyTerms.key_terms.length} key terms, pass rate ${analysis.stats.quotePassRate}`);

  const qa = [];
  for (const question of SUGGESTED_QUESTIONS) {
    await sleep(35_000); // stay under the free per-minute token limit
    console.log(`asking: ${question}`);
    const { stats: _stats, ...result } = await answerQuestion(provider, analysis.clauses, question);
    void _stats;
    qa.push({ question, result });
  }

  const out = path.join(process.cwd(), "src/samples/freelance-agreement.cache.json");
  await writeFile(out, JSON.stringify({ generatedWith: provider.model, analysis, qa }, null, 2) + "\n");
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.name : e);
  process.exit(1);
});
