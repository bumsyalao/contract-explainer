/**
 * Read a PDF's text inside the browser, so the original file never has to leave the device.
 * The PDF parser is loaded only when this runs, not when the page loads.
 *
 * Parsing happens on the page's main thread (no worker), so it has a timeout, and it needs a
 * recent browser: the parser uses the Iterator global, which older browsers lack.
 */
import { assertReadablePages, ExtractError, MAX_BYTES, MAX_PAGES, type Page } from "./pages";

/** A problem with this browser or this read, as opposed to a problem with the file. */
export class BrowserReadError extends Error {
  constructor(
    message: string,
    public code: "BROWSER_TOO_OLD" | "TIMEOUT",
  ) {
    super(message);
    this.name = "BrowserReadError";
  }
}

export async function extractPagesInBrowser(file: File, opts: { timeoutMs?: number } = {}): Promise<Page[]> {
  if (file.size > MAX_BYTES) {
    throw new ExtractError("TOO_LARGE", `That file is larger than ${MAX_BYTES / 1024 / 1024} MB. Try a smaller PDF.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new ExtractError("NOT_A_PDF", "That file does not look like a PDF.");
  }
  if (typeof (globalThis as { Iterator?: unknown }).Iterator === "undefined") {
    throw new BrowserReadError(
      "This browser is too old to read PDFs privately on your device. Please update it, or use a recent version of Chrome, Edge, Firefox or Safari.",
      "BROWSER_TOO_OLD",
    );
  }

  const work = (async () => {
    const { getDocumentProxy, extractText } = await import("unpdf");
    let pdf;
    try {
      pdf = await getDocumentProxy(bytes);
    } catch {
      throw new ExtractError("NOT_A_PDF", "We could not read that PDF. It may be damaged or password protected.");
    }
    if (pdf.numPages > MAX_PAGES) {
      throw new ExtractError("TOO_MANY_PAGES", `That PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES}.`);
    }
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = text.map((t, i) => ({ page: i + 1, text: t.trim() }));
    assertReadablePages(pages);
    return pages;
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new BrowserReadError("Reading the PDF took too long. Try a smaller or simpler file.", "TIMEOUT")),
      opts.timeoutMs ?? 45_000,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
