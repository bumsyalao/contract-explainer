import { describe, expect, it } from "vitest";
import { findPersonalData, findSecrets, hasDemoLink, hasEmDash, SECRET_FIXTURE_FILES, splitDiffByFile } from "./prepublic-lib";

describe("findSecrets", () => {
  it("catches real-looking keys and never prints them", () => {
    const fake = "gsk_" + "a".repeat(40);
    const f = findSecrets(`const k = "${fake}"`);
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("Groq key");
    expect(JSON.stringify(f)).not.toContain(fake);
  });

  it("catches several kinds", () => {
    const text = [
      "AIza" + "B".repeat(35),
      "ghp_" + "c".repeat(36),
      "-----BEGIN RSA PRIVATE KEY-----",
      'password = "hunter2hunter2x"',
    ].join("\n");
    expect(findSecrets(text).map((x) => x.kind)).toEqual(["Google API key", "GitHub token", "private key block", "assigned secret"]);
  });

  it("allows placeholders such as the .env.example values", () => {
    expect(findSecrets("GROQ_API_KEY=your-groq-key-here")).toEqual([]);
    expect(findSecrets('api_key: "your-key-placeholder-1234"')).toEqual([]);
  });

  it("does not flag ordinary code", () => {
    expect(findSecrets("const tokens = estimateTokens(prompt); // token budget")).toEqual([]);
  });
});

describe("findPersonalData", () => {
  it("flags real-looking emails but not the safe ones", () => {
    const f = findPersonalData("a@gmail.com b@example.com noreply@anthropic.com 1+x@users.noreply.github.com");
    expect(f.map((x) => x.text)).toEqual(["a@gmail.com"]);
  });
  it("flags phone-like numbers but not dates or versions", () => {
    expect(findPersonalData("call +44 20 7946 0958 now").map((x) => x.kind)).toEqual(["phone-like number"]);
    expect(findPersonalData("made on 2026-04-02 with version 1.2.3.4567")).toEqual([]);
    expect(findPersonalData('"paidCost": 0.000733065, "other": 0.00918368')).toEqual([]);
  });
  it("flags SSN-like and IBAN-like numbers without printing them", () => {
    const f = findPersonalData("123-45-6789 and GB82WEST12345698765432");
    expect(f.map((x) => x.kind)).toEqual(["SSN-like number", "IBAN-like number"]);
    expect(JSON.stringify(f)).not.toContain("123-45-6789");
  });
});

describe("README checks", () => {
  it("detects em dashes", () => {
    expect(hasEmDash("a — b")).toBe(true);
    expect(hasEmDash("a - b, c")).toBe(false);
  });
  it("needs a real demo link after the Live demo heading", () => {
    expect(hasDemoLink("## Live demo\nhttps://contract-explainer-abc.vercel.app")).toBe(true);
    expect(hasDemoLink("## Live demo\nTODO add link")).toBe(false);
    expect(hasDemoLink("no link here")).toBe(false);
  });
});

describe("splitDiffByFile and fixtures", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts\n+const x = 1;",
    "diff --git a/scripts/prepublic-lib.test.ts b/scripts/prepublic-lib.test.ts\n+fake",
  ].join("\n");

  it("splits a diff into one chunk per file with its path", () => {
    expect(splitDiffByFile(diff).map((c) => c.path)).toEqual(["src/a.ts", "scripts/prepublic-lib.test.ts"]);
  });

  it("lets the scanner skip only the named fixture file", () => {
    expect(SECRET_FIXTURE_FILES.has("scripts/prepublic-lib.test.ts")).toBe(true);
    expect(SECRET_FIXTURE_FILES.has("src/a.ts")).toBe(false);
    expect(SECRET_FIXTURE_FILES.size).toBe(1);
  });
});
