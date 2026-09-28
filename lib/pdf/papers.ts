import { fmtDateLongYear } from "../dates";
import { shortAuthors } from "../papers";
import { contentWidth, footers, hairline, newDoc, FAINT, INK, MARGIN, MUTED, RUST } from "./doc";
import { renderMarkdown } from "./markdown";

/**
 * The research library as a real PDF, drawn with pdfkit rather than printed
 * from a web page — so the typography, spacing and page breaks are ours, and
 * the links are genuinely clickable.
 *
 * Papers flow one after another with a rule between them; an entry that won't
 * fit in what's left of a page starts the next one instead of being split
 * across the fold.
 */

export type PdfPaper = {
  title: string;
  authors: string;
  year: number | null;
  venue: string | null;
  url: string | null;
  doi: string | null;
  arxivId: string | null;
  kind: string;
  status: string;
  tags: string[];
  notes: string | null;
  notesAt: Date | null;
  citeKey: string;
};

export type PdfMeta = {
  /** e.g. "Project · COMPSCI5082" */
  subtitle: string;
  generatedAt: Date;
};

const PAGE_WIDTH = 595.28; // A4 portrait
const CONTENT = PAGE_WIDTH - MARGIN * 2;

const STATUS_LABEL: Record<string, string> = { "to-read": "To read", reading: "Reading", read: "Read" };

/** The best public link for a paper: DOI first, then arXiv, then whatever was saved. */
export function paperLink(p: PdfPaper): string | null {
  if (p.doi) return `https://doi.org/${p.doi}`;
  if (p.arxivId) return `https://arxiv.org/abs/${p.arxivId}`;
  return p.url;
}

export async function buildPapersPdf(papers: PdfPaper[], meta: PdfMeta): Promise<Buffer> {
  const { doc, done } = newDoc({
    title: "Research library",
    subject: meta.subtitle,
    createdAt: meta.generatedAt,
  });

  header(doc, papers.length, meta);
  papers.forEach((p, i) => entry(doc, p, i + 1));
  footers(doc, `Studio  ·  ${fmtDateLongYear(meta.generatedAt)}`);

  doc.end();
  return done;
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function header(doc: PDFKit.PDFDocument, count: number, meta: PdfMeta) {
  doc.font("display").fontSize(26).fillColor(INK).text("Research library", MARGIN, MARGIN);
  doc.moveDown(0.35);
  doc
    .font("body")
    .fontSize(10)
    .fillColor(MUTED)
    .text(`${meta.subtitle}  ·  ${count} paper${count === 1 ? "" : "s"}  ·  ${fmtDateLongYear(meta.generatedAt)}`);

  doc.y += 12;
  hairline(doc, RUST, 1);
  doc.y += 2;
}

function entry(doc: PDFKit.PDFDocument, p: PdfPaper, n: number) {
  // Keep an entry whole where it reasonably can be: if less than a third of
  // the page is left, start the next one.
  const bottom = doc.page.height - MARGIN;
  if (doc.y > bottom - 150 && n > 1) doc.addPage();
  else if (n > 1) hairline(doc);

  const numberWidth = 26;
  const left = MARGIN + numberWidth;
  const width = CONTENT - numberWidth;
  const top = doc.y;

  doc.font("body").fontSize(10).fillColor(FAINT).text(String(n), MARGIN, top + 2, { width: numberWidth - 8, align: "right" });

  doc.font("bold").fontSize(13).fillColor(INK).text(p.title, left, top, { width, lineGap: 1.5 });
  doc.moveDown(0.3);

  const byline = [shortAuthors(p.authors, 6), p.year ? String(p.year) : null].filter(Boolean).join("  ·  ");
  if (byline) doc.font("body").fontSize(10).fillColor(MUTED).text(byline, left, doc.y, { width });

  const facts = [p.venue, KIND_LABEL(p.kind), STATUS_LABEL[p.status] ?? p.status].filter(Boolean).join("  ·  ");
  if (facts) {
    doc.moveDown(0.15);
    doc.font("body").fontSize(9).fillColor(FAINT).text(facts, left, doc.y, { width });
  }

  const link = paperLink(p);
  if (link) {
    doc.moveDown(0.25);
    doc
      .font("body")
      .fontSize(9)
      .fillColor(RUST)
      .text(link.replace(/^https?:\/\//, ""), left, doc.y, { width, link, underline: false });
  }

  if (p.tags.length > 0) {
    doc.moveDown(0.25);
    const tags = p.tags.map((t) => `#${t}`).join("  ");
    doc.font("body").fontSize(9).fillColor(MUTED).text(tags, left, doc.y, { width });
  }

  if (p.notes?.trim()) {
    doc.moveDown(0.6);
    const stamp = p.notesAt ? `Notes  ·  written ${fmtDateLongYear(p.notesAt)}` : "Notes";
    doc.font("bold").fontSize(8).fillColor(FAINT).text(stamp.toUpperCase(), left, doc.y, { width, characterSpacing: 0.6 });
    doc.moveDown(0.3);
    renderMarkdown(doc, p.notes, { size: 9.5, x: left + 10, width: width - 10 });
  }

  doc.moveDown(0.2);
  doc.font("body").fontSize(8).fillColor(FAINT).text(p.citeKey, left, doc.y, { width });
  doc.moveDown(1);
}

const KIND_LABEL = (k: string) =>
  ({ article: "Article", inproceedings: "Conference paper", preprint: "Preprint", book: "Book", thesis: "Thesis", misc: "Misc" })[k] ?? k;
