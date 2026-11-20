import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SAMPLE_PAGES } from "../src/samples/freelance-agreement";

/** Build a text PDF from page/paragraph arrays. Shared with tests. */
export async function buildPdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 11;
  const lineHeight = 15;
  const margin = 56;
  const width = 595;
  const height = 842;
  const maxWidth = width - margin * 2;

  for (const paragraphs of pages) {
    const page = doc.addPage([width, height]);
    let y = height - margin;
    paragraphs.forEach((para, idx) => {
      const f = idx === 0 ? bold : font;
      const words = para.split(" ");
      let line = "";
      const lines: string[] = [];
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxWidth) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      if (line) lines.push(line);
      for (const l of lines) {
        page.drawText(l, { x: margin, y, size, font: f, color: rgb(0, 0, 0) });
        y -= lineHeight;
      }
      y -= 8; // paragraph gap
    });
  }
  return doc.save();
}

async function main() {
  const bytes = await buildPdf(SAMPLE_PAGES);
  const out = path.join(process.cwd(), "public/samples/freelance-agreement.pdf");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
}

if (process.argv[1]?.endsWith("make-sample-pdf.ts")) main();
