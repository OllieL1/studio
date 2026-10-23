import { fmtDateLongYear } from "../dates";
import { daysToRead, isEnded, READING_STATUS_LABEL, READING_TYPE_LABEL, type ReadingStatus, type ReadingType } from "../reading";
import { footers, hairline, newDoc, FAINT, INK, MARGIN, MUTED, RULE } from "./doc";
import { renderMarkdown } from "./markdown";

/**
 * A reading list as a PDF - for sending to someone, or keeping. Drawn with
 * pdfkit like Studio's research library, but in Livio's violet. Stars are
 * drawn, not typed: the body face has no ★.
 */

/** Livio's 600 - legible on white, and recognisably Livio's. */
const VIOLET = "#695c9c";
const VIOLET_SOFT = "#cfcbea";

const PAGE_WIDTH = 595.28;
const CONTENT = PAGE_WIDTH - MARGIN * 2;

export type PdfReading = {
  title: string;
  author: string | null;
  type: string;
  status: string;
  rating: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  link: string | null;
  takeaway: string | null;
  notesMd: string | null;
};

export async function buildReadingPdf(items: PdfReading[], meta: { title: string; generatedAt: Date; notes: boolean }): Promise<Buffer> {
  const { doc, done } = newDoc({ title: meta.title, subject: "Livio reading list", createdAt: meta.generatedAt });

  doc.font("display").fontSize(26).fillColor(INK).text(meta.title, MARGIN, MARGIN);
  doc.moveDown(0.35);
  doc.font("body").fontSize(10).fillColor(MUTED)
    .text(`${items.length} ${items.length === 1 ? "thing" : "things"}  ·  ${fmtDateLongYear(meta.generatedAt)}`);
  doc.y += 12;
  hairline(doc, VIOLET, 1);
  doc.y += 6;

  items.forEach((item, i) => entry(doc, item, i, meta.notes));
  footers(doc, `Livio  ·  ${fmtDateLongYear(meta.generatedAt)}`);
  doc.end();
  return done;
}

function entry(doc: PDFKit.PDFDocument, r: PdfReading, i: number, withNotes: boolean) {
  const bottom = doc.page.height - MARGIN;
  if (i > 0) {
    if (doc.y > bottom - 110) doc.addPage();
    else {
      doc.y += 4;
      hairline(doc, RULE);
      doc.y += 8;
    }
  }

  const top = doc.y;
  const starsWidth = r.rating != null ? 70 : 0;
  doc.font("bold").fontSize(12.5).fillColor(INK).text(r.title || "Untitled", MARGIN, top, {
    width: CONTENT - starsWidth - 8,
    lineGap: 1.5,
  });
  if (r.rating != null) drawStars(doc, r.rating, MARGIN + CONTENT - starsWidth, top + 2);

  if (r.author) {
    doc.moveDown(0.15);
    doc.font("body").fontSize(10).fillColor(MUTED).text(r.author, MARGIN, doc.y, { width: CONTENT });
  }

  const days = daysToRead(r);
  const facts = [
    READING_TYPE_LABEL[r.type as ReadingType] ?? r.type,
    READING_STATUS_LABEL[r.status as ReadingStatus] ?? r.status,
    r.finishedAt && isEnded(r.status) ? fmtDateLongYear(r.finishedAt) : r.startedAt ? `since ${fmtDateLongYear(r.startedAt)}` : null,
    days && r.status === "FINISHED" ? `${days} ${days === 1 ? "day" : "days"}` : null,
  ].filter(Boolean).join("  ·  ");
  doc.moveDown(0.2);
  doc.font("body").fontSize(9).fillColor(FAINT).text(facts, MARGIN, doc.y, { width: CONTENT });

  if (r.link) {
    doc.moveDown(0.2);
    doc.font("body").fontSize(9).fillColor(VIOLET).text(r.link.replace(/^https?:\/\//, ""), MARGIN, doc.y, { width: CONTENT, link: r.link });
  }

  if (r.takeaway) {
    doc.moveDown(0.5);
    const y = doc.y;
    doc.font("italic").fontSize(10.5).fillColor(INK).text(`“${r.takeaway}”`, MARGIN + 12, y, { width: CONTENT - 12, lineGap: 1.5 });
    doc.save().rect(MARGIN, y, 2, doc.y - y).fill(VIOLET_SOFT).restore();
  }

  if (withNotes && r.notesMd?.trim()) {
    doc.moveDown(0.5);
    renderMarkdown(doc, r.notesMd, { size: 9.5, x: MARGIN, width: CONTENT });
  }
  doc.moveDown(0.6);
}

/** Five stars, filled to the rating - halves split down the middle. */
function drawStars(doc: PDFKit.PDFDocument, rating: number, x: number, y: number) {
  const size = 11;
  const gap = 3;
  for (let k = 0; k < 5; k++) {
    const left = x + k * (size + gap);
    const fill = Math.max(0, Math.min(1, rating - k));
    star(doc, left, y, size).fill(VIOLET_SOFT);
    if (fill > 0) {
      doc.save();
      doc.rect(left, y, size * fill, size).clip();
      star(doc, left, y, size).fill(VIOLET);
      doc.restore();
    }
  }
}

function star(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  const cx = x + size / 2;
  const cy = y + size / 2 + 0.6;
  const outer = size / 2;
  const inner = outer * 0.45;
  const points: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? inner : outer;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return doc.polygon(...points);
}
