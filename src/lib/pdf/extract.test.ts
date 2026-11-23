import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ExtractError, extractPages, MAX_BYTES } from "./extract";
import { SAMPLE_PAGES } from "@/samples/freelance-agreement";

const samplePath = path.join(process.cwd(), "public/samples/freelance-agreement.pdf");

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ name: "ExtractError", code });
}

describe("extractPages", () => {
  it("returns one entry per page with 1-based page numbers", async () => {
    const doc = await extractPages(new Uint8Array(await readFile(samplePath)));
    expect(doc.pageCount).toBe(SAMPLE_PAGES.length);
    expect(doc.pages.map((p) => p.page)).toEqual([1, 2, 3]);
  });

  it("puts each clause on the page it was written on", async () => {
    const doc = await extractPages(new Uint8Array(await readFile(samplePath)));
    expect(doc.pages[0].text).toContain("renews automatically");
    expect(doc.pages[1].text).toContain("NON-COMPETE");
    expect(doc.pages[2].text).toContain("TERMINATION");
    expect(doc.pages[0].text).not.toContain("NON-COMPETE");
  });

  it("does not consume or detach the caller's bytes", async () => {
    const bytes = new Uint8Array(await readFile(samplePath));
    await extractPages(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const again = await extractPages(bytes); // would throw if the buffer had been detached
    expect(again.pageCount).toBe(SAMPLE_PAGES.length);
  });

  it("rejects a PDF with no selectable text as scanned", async () => {
    const blank = await PDFDocument.create();
    blank.addPage();
    blank.addPage();
    await expectCode(extractPages(await blank.save()), "SCANNED_PDF");
  });

  it("rejects non-PDF bytes", async () => {
    await expectCode(extractPages(new TextEncoder().encode("hello world")), "NOT_A_PDF");
  });

  it("rejects oversized files before parsing", async () => {
    await expectCode(extractPages(new Uint8Array(MAX_BYTES + 1)), "TOO_LARGE");
  });

  it("exposes ExtractError for callers to branch on", () => {
    expect(new ExtractError("EMPTY", "x")).toBeInstanceOf(Error);
  });
});
