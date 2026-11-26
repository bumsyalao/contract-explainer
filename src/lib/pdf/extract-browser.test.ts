import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BrowserReadError, extractPagesInBrowser } from "./extract-browser";
import { extractPages } from "./extract";
import { MAX_BYTES } from "./pages";

const samplePath = path.join(process.cwd(), "public/samples/freelance-agreement.pdf");
const fileOf = (bytes: Uint8Array | string, name = "a.pdf") => new File([bytes as BlobPart], name, { type: "application/pdf" });

afterEach(() => vi.unstubAllGlobals());

describe("extractPagesInBrowser", () => {
  it("reads the same pages the server reader does", async () => {
    const bytes = new Uint8Array(await readFile(samplePath));
    const server = (await extractPages(bytes.slice())).pages;
    expect(await extractPagesInBrowser(fileOf(bytes))).toEqual(server);
  });

  it("rejects something that is not a PDF", async () => {
    await expect(extractPagesInBrowser(fileOf("hello world"))).rejects.toMatchObject({ name: "ExtractError", code: "NOT_A_PDF" });
  });

  it("rejects a file over the size limit without parsing it", async () => {
    await expect(extractPagesInBrowser(fileOf(new Uint8Array(MAX_BYTES + 1)))).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("turns away a PDF with no selectable text as a scan", async () => {
    const blank = await PDFDocument.create();
    blank.addPage();
    await expect(extractPagesInBrowser(fileOf(await blank.save()))).rejects.toMatchObject({ code: "SCANNED_PDF" });
  });

  it("rejects a PDF with too many pages", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 41; i++) doc.addPage();
    await expect(extractPagesInBrowser(fileOf(await doc.save()))).rejects.toMatchObject({ code: "TOO_MANY_PAGES" });
  });

  it("says plainly when the browser is too old, instead of failing with a cryptic error", async () => {
    vi.stubGlobal("Iterator", undefined);
    const err = await extractPagesInBrowser(fileOf(new Uint8Array(await readFile(samplePath)))).catch((e) => e);
    expect(err).toBeInstanceOf(BrowserReadError);
    expect(err.code).toBe("BROWSER_TOO_OLD");
    expect(err.message).toContain("too old");
  });

  it("does not consume the caller's file", async () => {
    const f = fileOf(new Uint8Array(await readFile(samplePath)));
    await extractPagesInBrowser(f);
    expect((await extractPagesInBrowser(f)).length).toBe(3);
  });
});
