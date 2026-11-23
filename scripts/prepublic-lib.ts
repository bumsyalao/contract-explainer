/** Pure helpers for the pre-public checklist. Kept separate so they can be tested. */

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Groq key", re: /gsk_[A-Za-z0-9]{20,}/ },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: "GitHub token", re: /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "assigned secret",
    re: /\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  },
];

/** Obvious placeholders are fine to commit. */
const PLACEHOLDER = /your-|placeholder|example|changeme|xxxx|\.\.\.|<[^>]+>/i;

export type Finding = { kind: string; line: number; text: string };

export function findSecrets(text: string): Finding[] {
  const out: Finding[] = [];
  text.split("\n").forEach((line, i) => {
    for (const p of SECRET_PATTERNS) {
      const m = p.re.exec(line);
      if (m && !PLACEHOLDER.test(m[0])) {
        // Never print the secret itself, only where it is.
        out.push({ kind: p.name, line: i + 1, text: line.slice(0, 40).replace(/\S{12,}/g, "[redacted]") });
      }
    }
  });
  return out;
}

const SAFE_EMAIL = /@(example\.(com|org|net)|users\.noreply\.github\.com)$|^noreply@anthropic\.com$/i;

/** Things that might be real personal data. These need a human look, they are not proof. */
export function findPersonalData(text: string): Finding[] {
  const out: Finding[] = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      if (!SAFE_EMAIL.test(m[0])) out.push({ kind: "email address", line: i + 1, text: m[0] });
    }
    for (const m of line.matchAll(/(?<![\d.])\+?\d[\d\s().-]{8,}\d(?![\d.])/g)) {
      const digits = m[0].replace(/\D/g, "");
      // Skip things that are clearly not phone numbers: dates, long ids, package versions.
      const ssnShaped = /^\d{3}-\d{2}-\d{4}$/.test(m[0].trim());
      // A plain decimal (a price, a ratio) is not a phone number.
      const decimal = /^\d+\.\d+$/.test(m[0].trim());
      if (!ssnShaped && !decimal && digits.length >= 9 && digits.length <= 15 && /[\s().+-]/.test(m[0]) && !/^\d{4}-\d{2}-\d{2}/.test(m[0])) {
        out.push({ kind: "phone-like number", line: i + 1, text: m[0].trim() });
      }
    }
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(line)) out.push({ kind: "SSN-like number", line: i + 1, text: "[redacted]" });
    if (/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/.test(line)) out.push({ kind: "IBAN-like number", line: i + 1, text: "[redacted]" });
  });
  return out;
}

export function hasEmDash(text: string): boolean {
  return text.includes("—");
}

export function hasDemoLink(readme: string): boolean {
  return /https?:\/\/[^\s)]+\.(vercel\.app|vercel\.com)[^\s)]*/i.test(readme) && !/TODO|your-demo-link|coming soon/i.test(readme.split("Live demo")[1]?.slice(0, 200) ?? "");
}

/**
 * Files that contain deliberately fake secrets so the scanner itself can be tested.
 * They are skipped by the secret scan (and only by it). Keep this list as short as possible.
 */
export const SECRET_FIXTURE_FILES = new Set(["scripts/prepublic-lib.test.ts"]);

/** Split the output of `git show -p` into one chunk per file, so fixtures can be skipped. */
export function splitDiffByFile(diff: string): { path: string; text: string }[] {
  const chunks: { path: string; text: string }[] = [];
  for (const part of diff.split(/^diff --git /m)) {
    if (!part.trim()) continue;
    const header = /^a\/(.+?) b\//.exec(part);
    chunks.push({ path: header ? header[1] : "", text: part });
  }
  return chunks;
}
