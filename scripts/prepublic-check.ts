/**
 * Pre-public checklist. Run this before making the repository public:
 *
 *   npx tsx scripts/prepublic-check.ts
 *
 * It scans the working tree and the whole git history for secrets, flags possible
 * personal data for a human look, checks every tracked PDF is marked synthetic, and
 * checks the README, LICENSE and demo link. It reports the repository visibility but
 * never changes it. Exit code 1 means something must be fixed first.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extractPages } from "../src/lib/pdf/extract";
import { findPersonalData, findSecrets, hasDemoLink, hasEmDash, SECRET_FIXTURE_FILES, splitDiffByFile } from "./prepublic-lib";

type Result = { status: "PASS" | "FAIL" | "WARN" | "INFO"; label: string; detail?: string };
const results: Result[] = [];
const add = (status: Result["status"], label: string, detail?: string) => results.push({ status, label, detail });
/** Adds PASS when ok, otherwise the failing status (FAIL by default). */
function check(ok: boolean, passLabel: string, failLabel: string, failDetail?: string, failStatus: "FAIL" | "WARN" = "FAIL") {
  if (ok) add("PASS", passLabel);
  else add(failStatus, failLabel, failDetail);
}

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
const BINARY = /\.(pdf|png|jpe?g|gif|ico|svg|woff2?|ttf)$/i;
const SKIP_TEXT = /(^|\/)package-lock\.json$/;
const textFiles = tracked.filter((f) => !BINARY.test(f) && !SKIP_TEXT.test(f));

// 1. Secrets in files that are tracked now. Fixture files with deliberate fake secrets are skipped.
{
  const hits: string[] = [];
  const scanned = textFiles.filter((f) => !SECRET_FIXTURE_FILES.has(f));
  for (const f of scanned) {
    for (const h of findSecrets(readFileSync(f, "utf8"))) hits.push(`${f}:${h.line} (${h.kind})`);
  }
  const skipped = textFiles.length - scanned.length;
  check(
    hits.length === 0,
    `No secrets in ${scanned.length} tracked text files${skipped ? ` (skipped ${skipped} test fixture with deliberately fake secrets)` : ""}`,
    "Secrets in tracked files",
    hits.join("\n    "),
  );
}

// 2. Secrets anywhere in git history (every commit on every branch), skipping the same fixtures.
{
  const shas = git("rev-list", "--all").split("\n").filter(Boolean);
  const hits: string[] = [];
  for (const sha of shas) {
    for (const chunk of splitDiffByFile(git("show", "--no-color", "--format=", sha))) {
      if (SECRET_FIXTURE_FILES.has(chunk.path)) continue;
      const found = findSecrets(chunk.text);
      if (found.length) hits.push(`${sha.slice(0, 7)} ${chunk.path || "(unknown file)"}: ${[...new Set(found.map((h) => h.kind))].join(", ")}`);
    }
  }
  check(hits.length === 0, `No secrets in history (${shas.length} commits)`, "Secrets in git history", hits.join("\n    "));
}

// 3. Only the example env file is tracked.
{
  const envFiles = tracked.filter((f) => /(^|\/)\.env/.test(f));
  const bad = envFiles.filter((f) => !f.endsWith(".env.example"));
  check(bad.length === 0, `Only ${envFiles.join(", ") || "no env file"} tracked`, "Env files are tracked", bad.join(", "));
  const ignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
  const missing = [".env", "node_modules", "uploads", ".DS_Store"].filter((p) => !ignore.includes(p));
  check(missing.length === 0, ".gitignore covers env files, uploads, node_modules and OS files", ".gitignore is missing entries", missing.join(", "));
}

// 4. Every tracked PDF is in an expected folder and says it is synthetic.
async function checkPdfs() {
  const pdfs = tracked.filter((f) => f.toLowerCase().endsWith(".pdf"));
  const problems: string[] = [];
  for (const f of pdfs) {
    if (!/^(public\/samples|evals\/contracts)\//.test(f)) {
      problems.push(`${f}: not in an expected folder`);
      continue;
    }
    try {
      const { pages } = await extractPages(new Uint8Array(readFileSync(f)));
      if (!/synthetic|fictional/i.test(pages.map((p) => p.text).join(" "))) problems.push(`${f}: does not say it is synthetic`);
    } catch {
      problems.push(`${f}: could not be read`);
    }
  }
  check(problems.length === 0, `${pdfs.length} tracked PDFs, all marked synthetic and in expected folders`, "Tracked PDFs", problems.join("\n    "));
}

// 5. Possible personal data, for a human to review.
{
  const hits: string[] = [];
  // The scanner's own test fixture holds well-known fake numbers and addresses on purpose.
  for (const f of textFiles.filter((x) => !SECRET_FIXTURE_FILES.has(x))) {
    for (const h of findPersonalData(readFileSync(f, "utf8"))) hits.push(`${f}:${h.line} ${h.kind}${h.text.length < 60 ? ` ${h.text}` : ""}`);
  }
  check(hits.length === 0, "No email addresses, phone-like numbers or ID-like numbers found", "Possible personal data (review each by hand)", hits.slice(0, 30).join("\n    "), "WARN");
}

// 6. Who authored the commits.
{
  const people = [...new Set(git("log", "--all", "--format=%ae%n%ce").split("\n").filter(Boolean))];
  const personal = people.filter((e) => !/noreply/i.test(e));
  check(personal.length === 0, `Commit emails are all no-reply addresses (${people.join(", ")})`, "Commits carry these email addresses (public once the repo is public)", personal.join(", "), "WARN");
}

// 7. README, LICENSE, demo link.
{
  const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : "";
  const isDefault = !readme || /create-next-app|Create Next App/i.test(readme);
  check(!isDefault, "README exists and is not the default", "README is missing or still the default Next.js one");
  if (!isDefault) {
    check(!hasEmDash(readme), "README has no em dashes", "README contains an em dash");
    check(/not legal advice/i.test(readme), "README says this is not legal advice", "README must say this is not legal advice");
    check(/synthetic|made-up|fictional/i.test(readme), "README says the hosted demo is for synthetic contracts", "README must say the hosted demo is for synthetic contracts only");
    check(hasDemoLink(readme), "README has a demo link", 'README needs a demo link under a "Live demo" heading');
  }
  const license = existsSync("LICENSE") ? readFileSync("LICENSE", "utf8") : "";
  check(/MIT License/.test(license) && /Permission is hereby granted/.test(license), "LICENSE is MIT", "LICENSE (MIT) is missing");
  check(tracked.includes("DECISIONS.md"), "DECISIONS.md is committed", "DECISIONS.md is not committed");
  check(tracked.includes("evals/results/RESULTS.md"), "Eval results table is committed", "evals/results/RESULTS.md is not committed");
}

// 8. Visibility. Read only: this script never changes it.
try {
  const vis = execFileSync("gh", ["api", "repos/bumsyalao/contract-explainer", "--jq", ".visibility"], { encoding: "utf8" }).trim();
  add("INFO", `Repository visibility is currently ${vis}`, "This script never changes visibility. Change it yourself on GitHub once every check passes.");
} catch {
  add("INFO", "Could not read repository visibility", "Check it on GitHub.");
}

checkPdfs().then(() => {
  const order = ["FAIL", "WARN", "INFO", "PASS"] as const;
  for (const status of order) {
    for (const r of results.filter((x) => x.status === status)) {
      console.log(`${status.padEnd(4)}  ${r.label}${r.detail ? `\n    ${r.detail}` : ""}`);
    }
  }
  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN").length;
  console.log(`\n${fails} to fix, ${warns} to review by hand.${fails === 0 ? " Safe to make public once you have reviewed any warnings." : " Not ready to make public yet."}`);
  process.exit(fails === 0 ? 0 : 1);
});
