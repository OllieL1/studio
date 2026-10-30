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
/** The tint behind a callout box. */
export const CALLOUT_BG = "#faf3ee";

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
  author = "Studio",
}: {
  title: string;
  subject: string;
  orientation?: Orientation;
  createdAt: Date;
  /** Null leaves the author out - notes read as the course's, not the app's. */
  author?: string | null;
}) {
  const doc = new PDFDocument({
    size: "A4",
    layout: orientation,
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: { Title: title, ...(author ? { Author: author } : {}), Subject: subject, CreationDate: createdAt },
    autoFirstPage: true,
    // Footers are written at the end, once the page count is known.
    bufferPages: true,
  });

  doc.registerFont("body", path.join(FONT_DIR, "Inter-Regular.ttf"));
  doc.registerFont("bold", path.join(FONT_DIR, "Inter-SemiBold.ttf"));
  doc.registerFont("italic", path.join(FONT_DIR, "Inter-Italic.ttf"));
  // Roboto Mono, not JetBrains Mono: the latter's coding ligatures ("->", ">=")
  // crash fontkit when it parses those glyphs, and notes are full of them.
  doc.registerFont("mono", path.join(FONT_DIR, "RobotoMono-Regular.ttf"));
  doc.registerFont("display", path.join(FONT_DIR, "Fraunces-SemiBold.ttf"));
  // Prose faces: note body text specifically (lib/pdf/markdown.ts), kept
  // distinct from "body"/"bold"/"italic" so the schedule, papers and stats
  // exports - which share this same doc - stay on Inter.
  doc.registerFont("prose", path.join(FONT_DIR, "Lato-Regular.ttf"));
  doc.registerFont("prose-bold", path.join(FONT_DIR, "Lato-Bold.ttf"));
  doc.registerFont("prose-italic", path.join(FONT_DIR, "Lato-Italic.ttf"));

  // Noto Sans JP, for any text with Japanese/CJK in it - none of the faces
  // above have those glyphs, so they'd print as blanks.
  doc.registerFont("cjk", path.join(FONT_DIR, "NotoSansJP-Regular.otf"));
  doc.registerFont("cjk-bold", path.join(FONT_DIR, "NotoSansJP-Bold.otf"));
  withCjkFallback(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  return { doc, done };
}

const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const BOLD_FACES = new Set(["bold", "display", "prose-bold"]);

/**
 * pdfkit has no per-glyph fallback, so a string containing Japanese is set
 * (and measured) wholly in Noto Sans JP, then the previous face is restored.
 * Latin-only strings are untouched.
 */
function withCjkFallback(doc: PDFKit.PDFDocument) {
  const d = doc as unknown as Record<string, (...args: unknown[]) => unknown>;
  let face = "body";
  const setFont = d.font.bind(doc);
  d.font = (src: unknown, ...rest: unknown[]) => {
    if (typeof src === "string") face = src;
    return setFont(src, ...rest);
  };
  for (const method of ["text", "widthOfString", "heightOfString"]) {
    const original = d[method].bind(doc);
    d[method] = (str: unknown, ...rest: unknown[]) => {
      if (typeof str !== "string" || !CJK.test(str) || face.startsWith("cjk")) return original(str, ...rest);
      const previous = face;
      // pdfkit's text() measures through widthOfString, so `face` must follow
      // the switch or the inner call would restore the old font mid-string.
      face = BOLD_FACES.has(previous) ? "cjk-bold" : "cjk";
      setFont(face);
      try {
        return original(str, ...rest);
      } finally {
        face = previous;
        setFont(previous);
      }
    };
  }
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
