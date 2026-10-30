import { fmtDateLongYear } from "../dates";
import { fit } from "./charts";
import { contentWidth, footers, newDoc, FAINT, INK, MARGIN, MUTED, RULE, RUST } from "./doc";
import { plainText, renderMarkdown } from "./markdown";

/**
 * Notes - Nexus's or a task's - as a bound document: one note, or a bundle.
 *
 * They carry no app branding: every page is headed with the note's course
 * and, for a task's note, the piece of work it belongs to, and the footer is
 * just the date and the page number.
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
  /** The note's own course, when it has one; otherwise `NotesInput.course`. */
  course?: Course | null;
  /** The task it was written for - "Coursework 2" - if any. */
  work?: string | null;
};

type Course = { name: string; code: string };

export type NotesInput = {
  notes: PdfNote[];
  /** The course for notes that don't name their own. */
  course: Course | null;
  generatedAt: Date;
};

/** What heads a note's pages. */
type Heading = { course: Course | null; work: string | null };

const headingOf = (n: PdfNote, input: NotesInput): Heading => ({
  course: n.course ?? input.course,
  work: n.work ?? null,
});

/** The value every note shares, or null when they differ. */
function shared<T>(values: T[], key: (v: T) => string): T | null {
  if (values.length === 0) return null;
  return values.every((v) => key(v) === key(values[0])) ? values[0] : null;
}

const BODY_SIZE = 10;
const WORDS = (md: string) => plainText(md).split(/\s+/).filter(Boolean).length;

export async function buildNotesPdf(input: NotesInput): Promise<Buffer> {
  const stamp = fmtDateLongYear(input.generatedAt);
  const headings = input.notes.map((n) => headingOf(n, input));
  const course = shared(headings.map((h) => h.course), (c) => c?.code ?? "");
  const work = shared(headings.map((h) => h.work), (w) => w ?? "");
  const subject = course?.code ? `${course.name} · ${course.code}` : "Notes";

  if (input.notes.length === 1) {
    const { doc, done } = newDoc({ title: input.notes[0].title, subject, createdAt: input.generatedAt, author: null });
    const pages = pageHeadings(doc);
    note(doc, input.notes[0], null, pages, headings[0]);
    headers(doc, pages.list);
    footers(doc, stamp);
    doc.end();
    return done;
  }

  // Pass 1: where does each note start, counting from the first body page?
  const probe = newDoc({ title: "probe", subject: "probe", createdAt: input.generatedAt });
  const offsets = body(probe.doc, input, pageHeadings(probe.doc), headings);
  probe.doc.end();
  await probe.done;

  const title = work ?? course?.name ?? "Notes";
  const { doc, done } = newDoc({ title, subject, createdAt: input.generatedAt, author: null });
  cover(doc, input, { title, subtitle: work ? course?.name ?? null : null, code: course?.code ?? null });
  contents(doc, input, offsets);
  const pages = pageHeadings(doc);
  body(doc, input, pages, headings);
  headers(doc, pages.list);
  footers(doc, stamp);
  doc.end();
  return done;
}

/* ── Running header ──────────────────────────────────────────────────────── */

/** Which note's heading each page carries. A note that runs onto a second
 *  page takes its heading with it; the cover and contents get none. */
function pageHeadings(doc: PDFKit.PDFDocument) {
  const list: (Heading | null)[] = [];
  const state = { current: null as Heading | null };
  const page = () => doc.bufferedPageRange().count - 1;
  doc.on("pageAdded", () => { list[page()] = state.current; });
  return {
    list,
    /** From here on, pages belong to this note. */
    start(h: Heading) {
      state.current = h;
      list[page()] = h;
    },
  };
}

/** Course on the left, the piece of work on the right, above the margin. */
function headers(doc: PDFKit.PDFDocument, list: (Heading | null)[]) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    const h = list[i];
    if (!h || (!h.course && !h.work)) continue;
    doc.switchToPage(i);
    const top = doc.page.margins.top;
    doc.page.margins.top = 0;
    const width = contentWidth(doc);
    const y = MARGIN - 26;
    doc.font("body").fontSize(8).fillColor(FAINT);
    if (h.course) {
      const left = h.course.code ? `${h.course.name}  ·  ${h.course.code}` : h.course.name;
      doc.text(fit(doc, left, h.work ? width / 2 - 8 : width), MARGIN, y, { width, lineBreak: false });
    }
    if (h.work) {
      const right = fit(doc, h.work, h.course ? width / 2 - 8 : width);
      doc.text(right, MARGIN, y, { width, align: "right", lineBreak: false });
    }
    doc.page.margins.top = top;
  }
}

/* ── Cover ───────────────────────────────────────────────────────────────── */

function cover(
  doc: PDFKit.PDFDocument,
  { notes, generatedAt }: NotesInput,
  head: { title: string; subtitle: string | null; code: string | null },
) {
  const width = contentWidth(doc);
  const words = notes.reduce((s, n) => s + WORDS(n.body), 0);
  const tags = new Set(notes.flatMap((n) => n.tags));
  const top = doc.page.height * 0.3;

  doc.rect(MARGIN, top - 30, 42, 4).fillColor(RUST).fill();
  if (head.code) {
    doc.font("body").fontSize(9.5).fillColor(MUTED).text(head.code.toUpperCase(), MARGIN, top - 16, { characterSpacing: 0.8 });
  } else {
    doc.y = top - 16;
  }

  doc.font("display").fontSize(38).fillColor(INK).text(head.title, MARGIN, doc.y + 4, { width: width * 0.86, lineGap: -2 });
  if (head.subtitle) {
    doc.font("display").fontSize(20).fillColor(MUTED).text(head.subtitle, MARGIN, doc.y + 6, { width: width * 0.86 });
  }

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
function body(
  doc: PDFKit.PDFDocument,
  input: NotesInput,
  pages: ReturnType<typeof pageHeadings>,
  headings: Heading[],
): number[] {
  const firstBodyPage = doc.bufferedPageRange().count;
  const offsets: number[] = [];

  input.notes.forEach((n, i) => {
    doc.addPage();
    offsets.push(doc.bufferedPageRange().count - 1 - firstBodyPage);
    note(doc, n, i + 1, pages, headings[i]);
  });

  return offsets;
}

function note(
  doc: PDFKit.PDFDocument,
  n: PdfNote,
  index: number | null,
  pages: ReturnType<typeof pageHeadings>,
  heading: Heading,
) {
  const width = contentWidth(doc);
  pages.start(heading);
  doc.y = MARGIN;

  const words = WORDS(n.body);
  const eyebrow = [
    index != null ? String(index).padStart(2, "0") : null,
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
