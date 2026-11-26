/**
 * The pure, browser-safe half of PDF reading: the shapes, the limits, the error type and the
 * "is this a scan?" check. It imports no PDF parser, so browser code can use it without loading
 * one. The server (extract.ts) and the browser (extract-browser.ts) both apply the same rules.
 */

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
export const MIN_CHARS_PER_TEXT_PAGE = 25;

/** Throws SCANNED_PDF when the pages hold too little real text to analyse. */
export function assertReadablePages(pages: Page[]): void {
  if (pages.length === 0) throw new ExtractError("EMPTY", "That document has no pages.");
  const textPages = pages.filter((p) => p.text.length >= MIN_CHARS_PER_TEXT_PAGE).length;

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
}
