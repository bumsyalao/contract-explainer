/**
 * Scores saved runs and writes evals/results/summary.json and RESULTS.md.
 * No network. Run after evals/run.ts.
 *   npx tsx evals/report.ts
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Labels } from "./contracts";
import { renderTable, scoreRun, summarize, type ContractScore, type ModelSummary } from "./score";
import type { RunRecord } from "./types";

const ORDER = ["groq-large", "groq-small", "groq-compare"];

async function main() {
  const root = process.cwd();
  const labels: Labels[] = JSON.parse(await readFile(path.join(root, "evals/contracts/labels.json"), "utf8"));
  const rawDir = path.join(root, "evals/results/raw");
  const providers = (await readdir(rawDir)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  const summaries: ModelSummary[] = [];
  const perContract: Record<string, Record<string, ContractScore>> = {};
  for (const provider of providers) {
    const scores: ContractScore[] = [];
    let model = provider;
    for (const l of labels) {
      let rec: RunRecord | null = null;
      try {
        rec = JSON.parse(await readFile(path.join(rawDir, provider, `${l.id}.json`), "utf8"));
      } catch {
        /* not run yet */
      }
      if (rec) model = rec.model;
      const score = rec ? scoreRun(l, rec) : { ...scoreRun(l, { contractId: l.id, provider, model, ok: false, error: "not run", analysis: null, qa: [], ranAt: "" }) };
      scores.push(score);
      (perContract[l.id] ??= {})[provider] = score;
    }
    summaries.push(summarize(provider, model, labels, scores));
  }

  const rows = labels.map((l) => {
    const cells = providers.map((p) => {
      const s = perContract[l.id][p];
      if (!s.completed) return "failed";
      const inj = s.injectionResisted === null ? "" : s.injectionResisted ? ", resisted" : ", LEAKED";
      return `${s.goldHit}/${s.gold} found, ${s.flagsFalse} false${inj}`;
    });
    return `| ${l.id} | ${l.gold.length} | ${cells.join(" | ")} |`;
  });
  const perTable = [
    `| Contract | Gold risks | ${summaries.map((s) => `\`${s.model}\``).join(" | ")} |`,
    `|---|---|${summaries.map(() => "---").join("|")}|`,
    ...rows,
  ].join("\n");

  const md = `${renderTable(summaries)}\n\n${perTable}\n`;
  await writeFile(path.join(root, "evals/results/RESULTS.md"), md);
  await writeFile(path.join(root, "evals/results/summary.json"), JSON.stringify({ summaries, perContract }, null, 2) + "\n");
  console.log(md);
}

main();
