import { fmtDateLongYear, fmtDayDate } from "../dates";
import { fit } from "./charts";
import { contentWidth, footers, newDoc, FAINT, INK, MARGIN, MUTED, RULE, RUST } from "./doc";
import { plainText, renderMarkdown } from "./markdown";

/**
 * Lecture notes as a bound document: one lecture, or a whole course.
 *
 * A course bundle gets a cover and a contents list with real page numbers,
 * which means laying the body out twice - once to find out where each lecture
 * lands, then again with the contents in front of it. Each lecture starts on
 * a fresh page, so the second pass lands identically, just shifted by however
 * many pages the contents takes.
 */

export type PdfLecture = {
  id: string;
  title: string;
  dueAt: Date | null;
  notesMd: string | null;
  notebook: string | null;
  notebookPages: string | null;
  /** Checklist parts, e.g. Attendance / Typed notes / Handwritten notes. */
  parts: { label: string; done: boolean }[];
};

export type LecturesInput = {
  course: { name: string; code: string; colour: string } | null;
  lectures: PdfLecture[];
  generatedAt: Date;
};

const BODY_SIZE = 10;
const WORDS = (md: string | null) => (md ? plainText(md).split(/\s+/).filter(Boolean).length : 0);

export async function buildLecturesPdf(input: LecturesInput): Promise<Buffer> {
  const single = input.lectures.length === 1;
  const stamp = `Studio  ·  ${input.course ? `${input.course.name}  ·  ` : ""}${fmtDateLongYear(input.generatedAt)}`;

  if (single) {
    const { doc, done } = newDoc({
      title: input.lectures[0].title,
      subject: input.course ? `${input.course.name} · ${input.course.code}` : "Lecture notes",
      createdAt: input.generatedAt,
    });
    lecture(doc, input.lectures[0], input, { index: null, firstOnPage: true });
    footers(doc, stamp);
    doc.end();
    return done;
  }

  // Pass 1: where does each lecture start, counting from the first body page?
  const probe = newDoc({ title: "probe", subject: "probe", createdAt: input.generatedAt });
  const offsets = body(probe.doc, input);
  probe.doc.end();
  await probe.done;

  const { doc, done } = newDoc({
    title: input.course ? `${input.course.name} - lecture notes` : "Lecture notes",
    subject: input.course ? `${input.course.name} · ${input.course.code}` : "Lecture notes",
    createdAt: input.generatedAt,
  });

  cover(doc, input);
  contents(doc, input, offsets);
  body(doc, input);
  footers(doc, stamp);
  doc.end();
  return done;
}

/* ── Cover ───────────────────────────────────────────────────────────────── */

function cover(doc: PDFKit.PDFDocument, { course, lectures, generatedAt }: LecturesInput) {
  const width = contentWidth(doc);
  const words = lectures.reduce((s, l) => s + WORDS(l.notesMd), 0);
  const withNotes = lectures.filter((l) => l.notesMd?.trim()).length;
  const dated = lectures.filter((l) => l.dueAt).map((l) => l.dueAt!);
  const top = doc.page.height * 0.3;

  if (course) {
    doc.rect(MARGIN, top - 30, 42, 4).fillColor(course.colour).fill();
    doc.font("body").fontSize(9.5).fillColor(MUTED).text(course.code.toUpperCase(), MARGIN, top - 16, { characterSpacing: 0.8 });
  }

  doc.font("display").fontSize(38).fillColor(INK).text(course?.name ?? "Lecture notes", MARGIN, doc.y + 4, {
    width: width * 0.86,
    lineGap: -2,
  });
  doc.font("display").fontSize(20).fillColor(MUTED).text("Lecture notes", MARGIN, doc.y + 6);

  doc.y += 18;
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(0.5).strokeColor(RULE).stroke();
  doc.y = y + 14;

  const span =
    dated.length > 0
      ? `${fmtDayDate(new Date(Math.min(...dated.map((d) => +d))))} - ${fmtDayDate(new Date(Math.max(...dated.map((d) => +d))))}`
      : null;
  const facts = [
    `${lectures.length} lecture${lectures.length === 1 ? "" : "s"}`,
    `${withNotes} with typed notes`,
    `${words.toLocaleString("en-GB")} words`,
    span,
  ].filter(Boolean) as string[];

  doc.font("body").fontSize(10.5).fillColor(MUTED).text(facts.join("  ·  "), MARGIN, doc.y, { width });
  doc.font("body").fontSize(9).fillColor(FAINT).text(`Compiled ${fmtDateLongYear(generatedAt)}`, MARGIN, doc.y + 4, { width });
}

/* ── Contents ────────────────────────────────────────────────────────────── */

/** Second-level headings from a lecture's notes, for the contents list. */
function subheadings(md: string | null, limit = 5): string[] {
  if (!md) return [];
  const out: string[] = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const h = /^##\s+(.*)$/.exec(line.trimEnd());
    if (h) out.push(plainText(h[1]));
    if (out.length >= limit) break;
  }
  return out;
}

function contents(doc: PDFKit.PDFDocument, { lectures }: LecturesInput, offsets: number[]) {
  doc.addPage();
  const width = contentWidth(doc);

  doc.font("display").fontSize(22).fillColor(INK).text("Contents", MARGIN, MARGIN);
  doc.y += 12;

  // How many pages the contents itself takes - the body sits after it, so the
  // printed numbers have to include it.
  const lines = lectures.reduce((n, l) => n + 1 + subheadings(l.notesMd).length, 0);
  const perPage = Math.floor((doc.page.height - MARGIN * 2 - 40) / 13.5);
  const contentsPages = Math.max(1, Math.ceil(lines / perPage));
  // Pages are 1-based and the body follows the cover and the contents, so a
  // lecture at body offset 0 prints as page (1 + contentsPages) + 1.
  const shift = 2 + contentsPages;

  lectures.forEach((l, i) => {
    if (doc.y > doc.page.height - MARGIN - 20) doc.addPage();
    const y = doc.y;
    const page = offsets[i] + shift;

    doc.font("body").fontSize(8.5).fillColor(FAINT).text(String(i + 1).padStart(2, "0"), MARGIN, y + 1, { width: 18, lineBreak: false });

    doc.font("bold").fontSize(10).fillColor(INK);
    const titleWidth = width - 18 - 54;
    const title = fit(doc, l.title, titleWidth);
    doc.text(title, MARGIN + 18, y, { width: titleWidth, lineBreak: false });
    const titleSpan = doc.widthOfString(title);

    // Dotted leader between the title and its page number.
    const leaderFrom = MARGIN + 18 + titleSpan + 5;
    const leaderTo = MARGIN + width - 54;
    if (leaderTo > leaderFrom) {
      doc.moveTo(leaderFrom, y + 7).lineTo(leaderTo, y + 7).lineWidth(0.5).dash(1, { space: 2.5 }).strokeColor(RULE).stroke().undash();
    }

    doc.font("body").fontSize(8.5).fillColor(MUTED).text(l.dueAt ? fmtDayDate(l.dueAt) : "-", MARGIN + width - 90, y + 1, {
      width: 52,
      align: "right",
      lineBreak: false,
    });
    doc.font("bold").fontSize(9).fillColor(INK).text(String(page), MARGIN + width - 26, y + 1, { width: 26, align: "right", lineBreak: false });
    doc.y = y + 14;

    for (const sub of subheadings(l.notesMd)) {
      if (doc.y > doc.page.height - MARGIN - 16) doc.addPage();
      // text() advances the cursor itself, so the row pitch is set from the
      // line's own top rather than added on top of it.
      const subY = doc.y;
      doc.font("body").fontSize(8.5).fillColor(FAINT);
      doc.text(fit(doc, sub, width - 60), MARGIN + 30, subY, { width: width - 60, lineBreak: false });
      doc.y = subY + 11.5;
    }
    doc.y += 2;
  });

}

/* ── Body ────────────────────────────────────────────────────────────────── */

/**
 * Draw every lecture, each starting on its own page. Returns the page index
 * of each lecture, counted from the first body page.
 */
function body(doc: PDFKit.PDFDocument, input: LecturesInput): number[] {
  const firstBodyPage = doc.bufferedPageRange().count; // the body starts on the next page
  const offsets: number[] = [];

  input.lectures.forEach((l, i) => {
    doc.addPage();
    offsets.push(doc.bufferedPageRange().count - 1 - firstBodyPage);
    lecture(doc, l, input, { index: i + 1, firstOnPage: true });
  });

  return offsets;
}

function lecture(
  doc: PDFKit.PDFDocument,
  l: PdfLecture,
  { course }: LecturesInput,
  { index }: { index: number | null; firstOnPage: boolean },
) {
  const width = contentWidth(doc);
  doc.y = MARGIN;

  // ── Heading block.
  const eyebrow = [
    index != null ? String(index).padStart(2, "0") : null,
    course && index == null ? `${course.name} · ${course.code}` : null,
    l.dueAt ? fmtDayDate(l.dueAt) : "Unscheduled",
  ]
    .filter(Boolean)
    .join("  ·  ");

  if (course) {
    doc.rect(MARGIN, doc.y + 2, 24, 3).fillColor(course.colour).fill();
    doc.y += 12;
  }
  doc.font("body").fontSize(8.5).fillColor(FAINT).text(eyebrow.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.7, width });
  doc.font("display").fontSize(22).fillColor(INK).text(l.title, MARGIN, doc.y + 3, { width: width * 0.92, lineGap: -1 });

  // ── Status line: checklist, handwritten reference, length.
  const bits: string[] = [];
  for (const p of l.parts) bits.push(`${p.done ? "✓" : "○"} ${p.label}`);
  if (l.notebook) bits.push(`${l.notebook}${l.notebookPages ? ` pp. ${l.notebookPages}` : ""}`);
  const words = WORDS(l.notesMd);
  if (words > 0) bits.push(`${words.toLocaleString("en-GB")} words`);

  if (bits.length > 0) {
    doc.font("body").fontSize(8.5).fillColor(MUTED).text(bits.join("   "), MARGIN, doc.y + 5, { width });
  }

  const y = doc.y + 8;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(1).strokeColor(course ? course.colour : RUST).stroke();
  doc.y = y + 14;

  // ── The notes.
  if (!l.notesMd?.trim()) {
    doc.font("italic").fontSize(9.5).fillColor(FAINT).text("No typed notes for this lecture.", MARGIN, doc.y, { width });
    return;
  }

  renderMarkdown(doc, l.notesMd, {
    size: BODY_SIZE,
    x: MARGIN,
    width,
    // A heading shouldn't be the last thing on a page.
    ensure: (height) => {
      if (doc.y + height > doc.page.height - MARGIN) doc.addPage();
    },
  });
}
