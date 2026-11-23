/**
 * Writes the 10 synthetic eval PDFs and labels.json into evals/contracts.
 *   npx tsx evals/build-contracts.ts
 * Everything is invented, so the outputs are safe to commit.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPdf } from "../scripts/make-sample-pdf";
import { paginate, render, SPECS, type Labels } from "./contracts";

async function main() {
  const dir = path.join(process.cwd(), "evals/contracts");
  await mkdir(dir, { recursive: true });
  const all: Labels[] = [];
  for (const spec of SPECS) {
    const { paragraphs, labels } = render(spec);
    const pages = paginate(paragraphs);
    const bytes = await buildPdf(pages, { hyphenate: spec.noisy });
    const file = `${spec.id}.pdf`;
    await writeFile(path.join(dir, file), bytes);
    all.push({ ...labels, file });
    console.log(`${file}: ${pages.length} pages, ${labels.gold.length} gold risks, ${labels.qa.length} questions`);
  }
  await writeFile(path.join(dir, "labels.json"), JSON.stringify(all, null, 2) + "\n");
  console.log(`wrote ${all.length} contracts and labels.json`);
}

main();
