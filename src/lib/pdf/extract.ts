import { extractText, getDocumentProxy } from "unpdf";

export type Page = { page: number; text: string };

export type ExtractedDocument = {
  pages: Page[];
  pageCount: number;
};

export type ExtractErrorCode =
  | "TOO_LARGE"
  | "TOO_MANY_PAGES"
  | "NOT_A_PDF"
  | "SCANNED_PDF"
  | "EMPTY";

export class ExtractError extends Error {
  constructor(
    public code: ExtractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

// Vercel caps request bodies at about 4.5 MB, so we stay under that.
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_PAGES = 40;

// A page with fewer characters than this is treated as "no real text".
const MIN_CHARS_PER_TEXT_PAGE = 25;

/**
 * Extract per-page text from a PDF held in memory. Nothing is written to disk.
 * Throws ExtractError with a user-friendly message for unsupported input.
 */
export async function extractPages(
  data: Uint8Array,
): Promise<ExtractedDocument> {
  if (data.byteLength > MAX_BYTES) {
    throw new ExtractError(
      "TOO_LARGE",
      `That file is larger than ${MAX_BYTES / 1024 / 1024} MB. Try a smaller PDF.`,
    );
  }

  // PDFs start with "%PDF-". Cheap check before handing bytes to the parser.
  const header = new TextDecoder().decode(data.slice(0, 5));
  if (header !== "%PDF-") {
    throw new ExtractError("NOT_A_PDF", "That file does not look like a PDF.");
  }

  let pdf;
  try {
    pdf = await getDocumentProxy(data);
  } catch {
    throw new ExtractError(
      "NOT_A_PDF",
      "We could not read that PDF. It may be damaged or password protected.",
    );
  }

  if (pdf.numPages > MAX_PAGES) {
    throw new ExtractError(
      "TOO_MANY_PAGES",
      `That PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES}.`,
    );
  }

  const { text } = await extractText(pdf, { mergePages: false });
  const pages: Page[] = text.map((t, i) => ({
    page: i + 1,
    text: t.trim(),
  }));

  const textPages = pages.filter(
    (p) => p.text.length >= MIN_CHARS_PER_TEXT_PAGE,
  ).length;

  if (textPages === 0) {
    // No usable text anywhere: almost certainly scanned images.
    throw new ExtractError(
      "SCANNED_PDF",
      "This looks like a scanned PDF (images, no selectable text). Scanned documents are not supported yet.",
    );
  }
  // Mostly empty pages with a few text pages is still likely a scan.
  if (textPages / pages.length < 0.5) {
    throw new ExtractError(
      "SCANNED_PDF",
      "Most pages have no selectable text, so this looks like a scan. Scanned documents are not supported yet.",
    );
  }

  return { pages, pageCount: pages.length };
}
