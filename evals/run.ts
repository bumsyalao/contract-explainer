/**
 * Runs one provider over the eval contracts and saves raw results (resumable).
 * Live model calls, so it needs a working GROQ_API_KEY and takes a while: the
 * free tier allows about 8K tokens a minute, so calls are paced.
 *
 *   npx tsx evals/run.ts --provider groq-large
 *   npx tsx evals/run.ts --provider groq-small --only freelance-heavy,lease-clean
 *   options: --force (redo everything), --retry-failed, --pace-analyze 60, --pace-qa 30
 *
 * Raw results go to evals/results/raw/ (git-ignored). Score them with evals/report.ts.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RateLimitError } from "../src/lib/llm/types";
import { createProvider, type ProviderId } from "../src/lib/llm";
import { analyzeDocument } from "../src/lib/pipeline/analyze-document";
import { answerQuestion } from "../src/lib/qa/answer";
import { envWithModelDefaults } from "../scripts/env";
import type { Labels } from "./contracts";
import type { QaRecord, RunRecord } from "./types";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

const provider = opt("provider") as ProviderId | undefined;
if (!provider) {
  console.error("usage: npx tsx evals/run.ts --provider groq-large|groq-small|groq-compare [--only id,id] [--force] [--retry-failed]");
  process.exit(1);
}
const only = opt("only")?.split(",");
const paceAnalyze = Number(opt("pace-analyze") ?? 60) * 1000;
const paceQa = Number(opt("pace-qa") ?? 30) * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCallEnded = 0;
async function pace(ms: number) {
  const wait = lastCallEnded + ms - Date.now();
  if (wait > 0) await sleep(wait);
}

const log = (msg: string) => console.log(`[${provider}] ${msg}`);

async function main() {
  const p = createProvider(provider!, await envWithModelDefaults());
  const dir = path.join(process.cwd(), "evals/contracts");
  const labels: Labels[] = JSON.parse(await readFile(path.join(dir, "labels.json"), "utf8"));
  const outDir = path.join(process.cwd(), "evals/results/raw", provider!);
  await mkdir(outDir, { recursive: true });
  log(`model ${p.model}`);

  for (const l of labels) {
    if (only && !only.includes(l.id)) continue;
    const outFile = path.join(outDir, `${l.id}.json`);
    try {
      const prev = JSON.parse(await readFile(outFile, "utf8")) as RunRecord;
      if (!flag("force") && (prev.ok || !flag("retry-failed"))) {
        log(`${l.id}: skipped (already ${prev.ok ? "done" : "failed"})`);
        continue;
      }
    } catch {
      /* no saved result yet */
    }

    const record: RunRecord = {
      contractId: l.id, provider: provider!, model: p.model, ok: false, error: null, analysis: null, qa: [], ranAt: new Date().toISOString(),
    };

    await pace(paceAnalyze);
    const pdf = new Uint8Array(await readFile(path.join(dir, l.file)));
    try {
      record.analysis = await analyzeDocument(p, pdf);
      record.ok = true;
      log(`${l.id}: analysed, ${record.analysis.flags.length} flags, ${record.analysis.keyTerms.key_terms.length} key terms, ${record.analysis.stats.quotePassRate * 100}% quotes verified`);
    } catch (err) {
      record.error = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
      log(`${l.id}: ANALYSIS FAILED ${record.error}`);
      if (err instanceof RateLimitError && (err.retryAfterMs ?? 0) > 20 * 60_000) {
        log("daily limit reached, stopping this run. Re-run later; finished contracts are kept.");
        await writeFile(outFile, JSON.stringify(record, null, 2));
        return;
      }
    }
    lastCallEnded = Date.now();

    if (record.analysis) {
      for (const q of l.qa) {
        await pace(paceQa);
        const rec: QaRecord = { question: q.question, result: null, error: null, inputTokens: 0, outputTokens: 0, latencyMs: 0 };
        try {
          const { stats, ...result } = await answerQuestion(p, record.analysis.clauses, q.question);
          rec.result = result;
          rec.inputTokens = stats?.inputTokens ?? 0;
          rec.outputTokens = stats?.outputTokens ?? 0;
          rec.latencyMs = stats?.latencyMs ?? 0;
          log(`${l.id}: Q "${q.question.slice(0, 40)}..." -> ${result.status}`);
        } catch (err) {
          rec.error = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
          log(`${l.id}: Q FAILED ${rec.error}`);
        }
        lastCallEnded = Date.now();
        record.qa.push(rec);
      }
    }
    await writeFile(outFile, JSON.stringify(record, null, 2));
  }
  log("done");
}

main().catch((e) => {
  console.error("run failed:", e instanceof Error ? e.name : e);
  process.exit(1);
});
