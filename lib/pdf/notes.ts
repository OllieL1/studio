import { fmtDateLongYear } from "../dates";
import { fit } from "./charts";
import { contentWidth, footers, newDoc, FAINT, INK, MARGIN, MUTED, RULE, RUST } from "./doc";
import { plainText, renderMarkdown } from "./markdown";

/**
 * Nexus notes as a bound document: one note, or the whole notebook.
 *
 * Built the same way as the lecture export - a bundle gets a cover and a
 * contents list with real page numbers, which means laying the body out twice:
 * once to find where each note lands, then again with the contents in front.
 * Each note starts on a fresh page, so the second pass lands identically and
 * is simply shifted by however many pages the contents takes.
 */

export type PdfNote = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  updatedAt: Date;
};

export type NotesInput = {
  notes: PdfNote[];
  /** The project the notebook belongs to, for the cover and the footer. */
  course: { name: string; code: string } | null;
  generatedAt: Date;
};

const BODY_SIZE = 10;
const WORDS = (md: string) => plainText(md).split(/\s+/).filter(Boolean).length;

export async function buildNotesPdf(input: NotesInput): Promise<Buffer> {
  const stamp = `Studio  ·  Nexus  ·  ${fmtDateLongYear(input.generatedAt)}`;
  const subject = input.course ? `${input.course.name} · ${input.course.code}` : "Project notes";

  if (input.notes.length === 1) {
    const { doc, done } = newDoc({ title: input.notes[0].title, subject, createdAt: input.generatedAt });
    note(doc, input.notes[0], null);
    footers(doc, stamp);
    doc.end();
    return done;
  }

  // Pass 1: where does each note start, counting from the first body page?
  const probe = newDoc({ title: "probe", subject: "probe", createdAt: input.generatedAt });
  const offsets = body(probe.doc, input);
  probe.doc.end();
  await probe.done;

  const { doc, done } = newDoc({ title: "Nexus", subject, createdAt: input.generatedAt });
  cover(doc, input);
  contents(doc, input, offsets);
  body(doc, input);
  footers(doc, stamp);
  doc.end();
  return done;
}

/* ── Cover ───────────────────────────────────────────────────────────────── */

function cover(doc: PDFKit.PDFDocument, { notes, course, generatedAt }: NotesInput) {
  const width = contentWidth(doc);
  const words = notes.reduce((s, n) => s + WORDS(n.body), 0);
  const tags = new Set(notes.flatMap((n) => n.tags));
  const top = doc.page.height * 0.3;

  doc.rect(MARGIN, top - 30, 42, 4).fillColor(RUST).fill();
  if (course) {
    doc.font("body").fontSize(9.5).fillColor(MUTED).text(course.code.toUpperCase(), MARGIN, top - 16, { characterSpacing: 0.8 });
  } else {
    doc.y = top - 16;
  }

  doc.font("display").fontSize(38).fillColor(INK).text("Nexus", MARGIN, doc.y + 4, { width: width * 0.86, lineGap: -2 });
  doc.font("display").fontSize(20).fillColor(MUTED).text(course?.name ?? "Project notes", MARGIN, doc.y + 6, { width: width * 0.86 });

  doc.y += 18;
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(0.5).strokeColor(RULE).stroke();
  doc.y = y + 14;

  const facts = [
    `${notes.length} note${notes.length === 1 ? "" : "s"}`,
    tags.size > 0 ? `${tags.size} tag${tags.size === 1 ? "" : "s"}` : null,
    `${words.toLocaleString("en-GB")} words`,
  ].filter(Boolean) as string[];

  doc.font("body").fontSize(10.5).fillColor(MUTED).text(facts.join("  ·  "), MARGIN, doc.y, { width });
  doc.font("body").fontSize(9).fillColor(FAINT).text(`Compiled ${fmtDateLongYear(generatedAt)}`, MARGIN, doc.y + 4, { width });
}

/* ── Contents ────────────────────────────────────────────────────────────── */

function contents(doc: PDFKit.PDFDocument, { notes }: NotesInput, offsets: number[]) {
  doc.addPage();
  const width = contentWidth(doc);

  doc.font("display").fontSize(22).fillColor(INK).text("Contents", MARGIN, MARGIN);
  doc.y += 12;

  const perPage = Math.floor((doc.page.height - MARGIN * 2 - 40) / 14);
  const contentsPages = Math.max(1, Math.ceil(notes.length / perPage));
  // Pages are 1-based and the body follows the cover and the contents.
  const shift = 2 + contentsPages;

  notes.forEach((n, i) => {
    if (doc.y > doc.page.height - MARGIN - 20) doc.addPage();
    const y = doc.y;

    doc.font("body").fontSize(8.5).fillColor(FAINT).text(String(i + 1).padStart(2, "0"), MARGIN, y + 1, { width: 18, lineBreak: false });

    doc.font("bold").fontSize(10).fillColor(INK);
    const titleWidth = width - 18 - 54;
    const title = fit(doc, n.title, titleWidth);
    doc.text(title, MARGIN + 18, y, { width: titleWidth, lineBreak: false });

    const leaderFrom = MARGIN + 18 + doc.widthOfString(title) + 5;
    const leaderTo = MARGIN + width - 40;
    if (leaderTo > leaderFrom) {
      doc.moveTo(leaderFrom, y + 7).lineTo(leaderTo, y + 7).lineWidth(0.5).dash(1, { space: 2.5 }).strokeColor(RULE).stroke().undash();
    }

    doc.font("bold").fontSize(9).fillColor(INK).text(String(offsets[i] + shift), MARGIN + width - 26, y + 1, {
      width: 26,
      align: "right",
      lineBreak: false,
    });
    doc.y = y + 14;
  });
}

/* ── Body ────────────────────────────────────────────────────────────────── */

/** Every note, each on its own page; returns each one's page index. */
function body(doc: PDFKit.PDFDocument, input: NotesInput): number[] {
  const firstBodyPage = doc.bufferedPageRange().count;
  const offsets: number[] = [];

  input.notes.forEach((n, i) => {
    doc.addPage();
    offsets.push(doc.bufferedPageRange().count - 1 - firstBodyPage);
    note(doc, n, i + 1);
  });

  return offsets;
}

function note(doc: PDFKit.PDFDocument, n: PdfNote, index: number | null) {
  const width = contentWidth(doc);
  doc.y = MARGIN;

  const words = WORDS(n.body);
  const eyebrow = [
    index != null ? String(index).padStart(2, "0") : "NEXUS",
    n.pinned ? "Pinned" : null,
    `Updated ${fmtDateLongYear(n.updatedAt)}`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  doc.font("body").fontSize(8.5).fillColor(FAINT).text(eyebrow.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.7, width });
  doc.font("display").fontSize(22).fillColor(INK).text(n.title, MARGIN, doc.y + 3, { width: width * 0.92, lineGap: -1 });

  const bits = [
    n.tags.length > 0 ? n.tags.map((t) => `#${t}`).join("  ") : null,
    words > 0 ? `${words.toLocaleString("en-GB")} words` : null,
  ].filter(Boolean) as string[];

  if (bits.length > 0) {
    doc.font("body").fontSize(8.5).fillColor(MUTED).text(bits.join("   ·   "), MARGIN, doc.y + 5, { width });
  }

  const y = doc.y + 8;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(1).strokeColor(RUST).stroke();
  doc.y = y + 14;

  if (!n.body.trim()) {
    doc.font("italic").fontSize(9.5).fillColor(FAINT).text("This note is empty.", MARGIN, doc.y, { width });
    return;
  }

  renderMarkdown(doc, n.body, {
    size: BODY_SIZE,
    x: MARGIN,
    width,
    // A heading shouldn't be the last thing on a page.
    ensure: (height) => {
      if (doc.y + height > doc.page.height - MARGIN) doc.addPage();
    },
  });
}
