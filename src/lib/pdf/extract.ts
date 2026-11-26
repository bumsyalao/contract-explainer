import { extractText, getDocumentProxy } from "unpdf";
import {
  assertReadablePages,
  ExtractError,
  MAX_BYTES,
  MAX_PAGES,
  type ExtractedDocument,
  type ExtractErrorCode,
  type Page,
} from "./pages";

// The shapes, limits and error live in pages.ts so browser code can use them without a PDF parser.
export { ExtractError, MAX_BYTES, MAX_PAGES };
export type { ExtractedDocument, ExtractErrorCode, Page };

/**
 * Extract per-page text from a PDF held in memory. Nothing is written to disk.
 * Throws ExtractError with a user-friendly message for unsupported input.
 */
export async function extractPages(data: Uint8Array): Promise<ExtractedDocument> {
  if (data.byteLength > MAX_BYTES) {
    throw new ExtractError("TOO_LARGE", `That file is larger than ${MAX_BYTES / 1024 / 1024} MB. Try a smaller PDF.`);
  }

  // PDFs start with "%PDF-". Cheap check before handing bytes to the parser.
  const header = new TextDecoder().decode(data.slice(0, 5));
  if (header !== "%PDF-") {
    throw new ExtractError("NOT_A_PDF", "That file does not look like a PDF.");
  }

  let pdf;
  try {
    // pdf.js takes ownership of the buffer it is given (it detaches it), so hand it a copy.
    pdf = await getDocumentProxy(data.slice());
  } catch {
    throw new ExtractError("NOT_A_PDF", "We could not read that PDF. It may be damaged or password protected.");
  }

  if (pdf.numPages > MAX_PAGES) {
    throw new ExtractError("TOO_MANY_PAGES", `That PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES}.`);
  }

  const { text } = await extractText(pdf, { mergePages: false });
  const pages: Page[] = text.map((t, i) => ({ page: i + 1, text: t.trim() }));
  assertReadablePages(pages);
  return { pages, pageCount: pages.length };
}
