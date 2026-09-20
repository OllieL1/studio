import path from "node:path";
import PDFDocument from "pdfkit";

/**
 * Shared furniture for Studio's PDFs: the fonts, the palette and the page
 * frame, so the research export and the schedule export look like the same
 * document family rather than two unrelated printouts.
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

/** Studio's palette, as the PDFs need it. */
export const INK = "#1c1917";
export const MUTED = "#78716c";
export const FAINT = "#a8a29e";
export const RULE = "#e7e5e4";
export const RUST = "#b4532a";

export const MARGIN = 56;

export type Orientation = "portrait" | "landscape";

/** A4 in points, either way up. */
export function pageSize(orientation: Orientation) {
  const [w, h] = [595.28, 841.89];
  return orientation === "landscape" ? { width: h, height: w } : { width: w, height: h };
}

export function newDoc({
  title,
  subject,
  orientation = "portrait",
  createdAt,
}: {
  title: string;
  subject: string;
  orientation?: Orientation;
  createdAt: Date;
}) {
  const doc = new PDFDocument({
    size: "A4",
    layout: orientation,
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: { Title: title, Author: "Studio", Subject: subject, CreationDate: createdAt },
    autoFirstPage: true,
    // Footers are written at the end, once the page count is known.
    bufferPages: true,
  });

  doc.registerFont("body", path.join(FONT_DIR, "Inter-Regular.ttf"));
  doc.registerFont("bold", path.join(FONT_DIR, "Inter-SemiBold.ttf"));
  doc.registerFont("display", path.join(FONT_DIR, "Fraunces-SemiBold.ttf"));

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  return { doc, done };
}

/** The usable width of the current page. */
export function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - MARGIN * 2;
}

/** A hairline across the content area at the current position. */
export function hairline(doc: PDFKit.PDFDocument, colour = RULE, weight = 0.5) {
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + contentWidth(doc), y).lineWidth(weight).strokeColor(colour).stroke();
  doc.y = y + 18;
}

/**
 * Page numbers and a date stamp on every page.
 *
 * Text below the bottom margin would otherwise push pdfkit onto a new page,
 * so the margin is dropped while the footer is written.
 */
export function footers(doc: PDFKit.PDFDocument, stamp: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const width = contentWidth(doc);
    const y = doc.page.height - MARGIN + 18;
    doc
      .font("body")
      .fontSize(8)
      .fillColor(FAINT)
      .text(stamp, MARGIN, y, { width: width / 2 })
      .text(`${i - range.start + 1} / ${range.count}`, MARGIN + width / 2, y, { width: width / 2, align: "right" });
  }
  doc.flushPages();
}
