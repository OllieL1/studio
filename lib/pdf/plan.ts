import { fmtDateLongYear } from "../dates";
import { layoutDay, type CalendarItem } from "../calendar";
import { fmtLength, fmtMinutes, rangeLabel } from "../plan";
import { timeLabel, type PlanDay, type BlockLike } from "../planView";
import { footers, newDoc, pageSize, FAINT, INK, MARGIN, MUTED, RULE, RUST } from "./doc";

/**
 * The weekly schedule on paper, made to be written on with a pencil: a
 * landscape overview of the whole range, then a portrait page per day with
 * the day drawn to scale, a box to tick on every planned block and deadline,
 * and ruled space for whatever comes up.
 *
 * Everything is light - hairlines, pale tints, no heavy fills - so ink
 * written over the top always reads.
 */

export type PlanPdfCourse = { shortName: string; colour: string };

export type PlanPdfInput = {
  from: Date;
  days: PlanDay<BlockLike>[];
  courses: Map<string, PlanPdfCourse>;
  generatedAt: Date;
};

const SANS_SMALL = 8.5;
const BOX = 10.5; // checkbox side, sized for a pencil tip

export async function buildPlanPdf(input: PlanPdfInput): Promise<Buffer> {
  const { doc, done } = newDoc({
    title: `Schedule ${rangeLabel(input.from, input.days.length)}`,
    subject: "Weekly schedule",
    orientation: "landscape",
    createdAt: input.generatedAt,
  });

  const window = hourWindow(input.days);
  for (let i = 0; i < input.days.length; i += 7) {
    if (i > 0) doc.addPage({ size: "A4", layout: "landscape", margins: margins() });
    overview(doc, input, input.days.slice(i, i + 7), i === 0);
  }
  for (const day of input.days) {
    doc.addPage({ size: "A4", layout: "portrait", margins: margins() });
    dayPage(doc, input, day, window);
  }

  footers(doc, `Studio  ·  Schedule ${rangeLabel(input.from, input.days.length)}  ·  printed ${fmtDateLongYear(input.generatedAt)}`);
  doc.end();
  return done;
}

const margins = () => ({ top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN });

/* ── Overview ────────────────────────────────────────────────────────────── */

function overview(doc: PDFKit.PDFDocument, input: PlanPdfInput, days: PlanPdfInput["days"], first: boolean) {
  const { width } = pageSize("landscape");
  const contentW = width - MARGIN * 2;
  const planned = input.days.reduce((n, d) => n + d.plannedMinutes, 0);

  doc.font("body").fontSize(8).fillColor(MUTED).text("WEEKLY SCHEDULE", MARGIN, MARGIN, { characterSpacing: 0.8 });
  doc.font("display").fontSize(24).fillColor(INK)
    .text(`${rangeLabel(days[0].date, days.length)} ${days[days.length - 1].date.getFullYear()}`, MARGIN, MARGIN + 12);
  if (first && planned > 0) {
    doc.font("bold").fontSize(10).fillColor(RUST)
      .text(`${fmtLength(planned)} planned`, MARGIN, MARGIN + 16, { width: contentW, align: "right" });
    doc.font("body").fontSize(8).fillColor(MUTED)
      .text(byCourseLine(input), MARGIN, MARGIN + 30, { width: contentW, align: "right" });
  }
  const ruleY = MARGIN + 50;
  doc.moveTo(MARGIN, ruleY).lineTo(MARGIN + contentW, ruleY).lineWidth(1).strokeColor(RUST).stroke();

  const gap = 8;
  const colW = (contentW - gap * 6) / 7;
  const top = ruleY + 14;
  const bottom = pageSize("landscape").height - MARGIN - 4;

  days.forEach((day, i) => {
    const x = MARGIN + i * (colW + gap);
    const weekend = (day.date.getDay() + 6) % 7 >= 5;
    if (weekend) doc.rect(x - 3, top - 4, colW + 6, bottom - top + 4).fill("#fbfaf8");

    doc.font("bold").fontSize(7.5).fillColor(MUTED).text(WEEKDAY[(day.date.getDay() + 6) % 7].toUpperCase(), x, top, { characterSpacing: 0.8 });
    doc.font("display").fontSize(17).fillColor(INK).text(String(day.date.getDate()), x, top + 10);
    let y = top + 34;
    doc.moveTo(x, y - 4).lineTo(x + colW, y - 4).lineWidth(0.5).strokeColor(RULE).stroke();

    for (const { item } of day.chips) {
      if (y > bottom - 20) break;
      const deadline = item.source === "deadline";
      if (deadline) checkbox(doc, x, y + 0.5, 9);
      else dot(doc, x + 3.5, y + 5, "#a8a29e");
      const label = `${deadline ? "Due " : ""}${item.courseShort ? `${item.courseShort} · ` : ""}${item.title}`;
      doc.font(deadline ? "bold" : "body").fontSize(SANS_SMALL).fillColor(deadline ? INK : MUTED);
      const h = doc.heightOfString(label, { width: colW - 13 });
      doc.text(label, x + 13, y, { width: colW - 13 });
      y += Math.max(h, 10) + 6;
    }
    if (day.chips.length) y += 2;

    for (const row of day.rows) {
      if (row.type === "empty") {
        doc.font("italic").fontSize(SANS_SMALL).fillColor(FAINT).text("Free", x, y);
        break;
      }
      if (y > bottom - 22) {
        doc.font("italic").fontSize(SANS_SMALL).fillColor(FAINT).text("continued on the day page", x, y);
        break;
      }
      const block = row.type === "block";
      const colour = entryColour(row, input.courses);
      const title = block ? row.block.title : row.item.title;
      const tag = block ? courseOf(row.block.courseId, input.courses)?.shortName : row.item.courseShort;
      if (block) checkbox(doc, x, y + 1, 9, colour);
      else dot(doc, x + 3.5, y + 5, colour);
      doc.font("mono").fontSize(7).fillColor(block ? INK : FAINT).text(timeLabel(row), x + 13, y);
      const label = tag ? `${tag} · ${title}` : title;
      doc.font(block ? "bold" : "body").fontSize(SANS_SMALL).fillColor(block ? INK : MUTED);
      const h = doc.heightOfString(label, { width: colW - 13 });
      doc.text(label, x + 13, y + 9.5, { width: colW - 13 });
      y += 9.5 + h + 8;
    }
  });
}

function byCourseLine(input: PlanPdfInput) {
  const totals = new Map<string, number>();
  for (const d of input.days) for (const r of d.rows) {
    if (r.type !== "block") continue;
    const name = courseOf(r.block.courseId, input.courses)?.shortName ?? "Other";
    totals.set(name, (totals.get(name) ?? 0) + (r.end - r.start));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n, m]) => `${n} ${fmtLength(m)}`).join("   ·   ");
}

/* ── A day ───────────────────────────────────────────────────────────────── */

function dayPage(doc: PDFKit.PDFDocument, input: PlanPdfInput, day: PlanPdfInput["days"][number], window: { from: number; to: number }) {
  const { width, height } = pageSize("portrait");
  const contentW = width - MARGIN * 2;

  doc.font("body").fontSize(8).fillColor(MUTED)
    .text(`${MONTH[day.date.getMonth()].toUpperCase()} ${day.date.getFullYear()}`, MARGIN, MARGIN, { characterSpacing: 0.8 });
  doc.font("display").fontSize(26).fillColor(INK)
    .text(`${WEEKDAY[(day.date.getDay() + 6) % 7]} ${day.date.getDate()}`, MARGIN, MARGIN + 11);
  if (day.plannedMinutes > 0) {
    doc.font("bold").fontSize(10).fillColor(RUST)
      .text(`${fmtLength(day.plannedMinutes)} planned`, MARGIN, MARGIN + 22, { width: contentW, align: "right" });
  }
  const ruleY = MARGIN + 50;
  doc.moveTo(MARGIN, ruleY).lineTo(MARGIN + contentW, ruleY).lineWidth(1).strokeColor(RUST).stroke();

  // Left: the day to scale. Right: due, to-do and notes.
  const gutter = 30;
  const gridX = MARGIN + gutter;
  const gridW = Math.round(contentW * 0.6) - gutter;
  const sideX = gridX + gridW + 22;
  const sideW = MARGIN + contentW - sideX;
  const top = ruleY + 18;
  const bottom = height - MARGIN - 6;
  const hours = window.to - window.from;
  const perHour = (bottom - top) / hours;
  const yAt = (min: number) => top + ((min - window.from * 60) / 60) * perHour;

  // Hour lines, with a fainter half-hour between.
  for (let h = 0; h <= hours; h++) {
    const y = top + h * perHour;
    doc.moveTo(gridX, y).lineTo(gridX + gridW, y).lineWidth(0.5).strokeColor(RULE).stroke();
    if (h < hours) {
      doc.moveTo(gridX, y + perHour / 2).lineTo(gridX + gridW, y + perHour / 2).lineWidth(0.3).dash(1.5, { space: 2.5 }).strokeColor(RULE).stroke().undash();
      doc.font("mono").fontSize(7).fillColor(FAINT).text(fmtMinutes((window.from + h) * 60), MARGIN, y - 3.5, { width: gutter - 6, align: "right" });
    }
  }

  // Entries, laid out side by side where they overlap - the same layout as the screen.
  const timed = day.rows.filter((r): r is Exclude<typeof r, { type: "empty" }> => r.type !== "empty");
  const asItems: CalendarItem[] = timed.map((r, i) => ({
    id: String(i), source: r.type === "block" ? "plan" : "event", title: "",
    start: new Date(day.date.getTime() + r.start * 60000).toISOString(),
    end: new Date(day.date.getTime() + r.end * 60000).toISOString(),
    allDay: false, colour: null, courseShort: null, courseId: null, href: null, blocked: false, done: false,
    kind: null, gradeWeight: null, location: null, editable: false, onGoogle: false, notes: null,
  }));
  for (const p of layoutDay(asItems, day.date, 20)) {
    const row = timed[Number(p.item.id)];
    const block = row.type === "block";
    const colour = entryColour(row, input.courses);
    const colW = gridW / p.cols;
    const x = gridX + p.col * colW + 2;
    const w = colW - 4;
    const y = Math.max(yAt(p.top), top) + 1.5;
    const h = Math.max(Math.min(yAt(p.bottom), bottom) - y - 1.5, 14);

    if (block) {
      doc.roundedRect(x, y, w, h, 3).fillAndStroke(tint(colour, 0.07), tint(colour, 0.55));
      doc.rect(x, y, 2.5, h).fill(colour);
    } else {
      doc.roundedRect(x, y, w, h, 3).fill("#f5f3ef");
    }

    const title = block ? row.block.title : row.item.title;
    const tag = block ? courseOf(row.block.courseId, input.courses)?.shortName : row.item.courseShort;
    const label = tag ? `${tag} · ${title}` : title;
    const time = timeLabel(row);
    const textX = x + (block ? 8 + BOX + 6 : 8);
    const textW = w - (textX - x) - 6;
    if (block) checkbox(doc, x + 8, y + 5, BOX, colour);

    if (h < 26) {
      doc.font(block ? "bold" : "body").fontSize(8.5).fillColor(block ? INK : MUTED)
        .text(label, textX, y + 5, { width: textW - 58, height: 11, lineBreak: false, ellipsis: true });
      doc.font("mono").fontSize(7).fillColor(FAINT).text(time, x + w - 62, y + 6, { width: 56, align: "right", lineBreak: false });
    } else {
      doc.font(block ? "bold" : "body").fontSize(9).fillColor(block ? INK : MUTED)
        .text(label, textX, y + 5, { width: textW, height: h - 18, ellipsis: true });
      doc.font("mono").fontSize(7).fillColor(FAINT).text(time, textX, Math.min(doc.y + 1, y + h - 11), { width: textW, lineBreak: false });
    }
  }

  // Side column.
  let y = top - 2;
  const deadlines = day.chips.filter((c) => c.item.source === "deadline");
  const allDay = day.chips.filter((c) => c.item.source !== "deadline");
  if (deadlines.length) {
    y = sideHeading(doc, "Due", sideX, y, sideW);
    for (const { item } of deadlines) {
      checkbox(doc, sideX, y, BOX, item.colour ?? undefined);
      const label = `${item.courseShort ? `${item.courseShort} · ` : ""}${item.title}${item.gradeWeight != null ? `  ${item.gradeWeight}%` : ""}`;
      doc.font("body").fontSize(9).fillColor(INK);
      const h = doc.heightOfString(label, { width: sideW - BOX - 8 });
      doc.text(label, sideX + BOX + 8, y + 0.5, { width: sideW - BOX - 8 });
      y += Math.max(h, BOX) + 9;
    }
    y += 8;
  }
  if (allDay.length) {
    y = sideHeading(doc, "All day", sideX, y, sideW);
    for (const { item } of allDay) {
      dot(doc, sideX + 3, y + 5, item.colour ?? "#a8a29e");
      doc.font("body").fontSize(9).fillColor(MUTED);
      const h = doc.heightOfString(item.title, { width: sideW - 14 });
      doc.text(item.title, sideX + 14, y + 0.5, { width: sideW - 14 });
      y += Math.max(h, 10) + 7;
    }
    y += 8;
  }

  // Empty boxes for whatever comes up during the day.
  y = sideHeading(doc, "To do", sideX, y, sideW);
  for (let i = 0; i < 5; i++) {
    checkbox(doc, sideX, y, BOX);
    doc.moveTo(sideX + BOX + 8, y + BOX).lineTo(sideX + sideW, y + BOX).lineWidth(0.4).strokeColor(RULE).stroke();
    y += 22;
  }
  y += 10;

  y = sideHeading(doc, "Notes", sideX, y, sideW);
  for (let ly = y + 16; ly < bottom; ly += 20) {
    doc.moveTo(sideX, ly).lineTo(sideX + sideW, ly).lineWidth(0.4).strokeColor(RULE).stroke();
  }
}

function sideHeading(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number) {
  doc.font("bold").fontSize(7.5).fillColor(MUTED).text(text.toUpperCase(), x, y, { width: w, characterSpacing: 0.8 });
  return y + 16;
}

/* ── Drawing helpers ─────────────────────────────────────────────────────── */

function checkbox(doc: PDFKit.PDFDocument, x: number, y: number, size: number, colour?: string) {
  doc.roundedRect(x, y, size, size, size * 0.22).lineWidth(0.9).fillAndStroke("#ffffff", colour ? tint(colour, 0.8) : "#a8a29e");
}

function dot(doc: PDFKit.PDFDocument, x: number, y: number, colour: string) {
  doc.circle(x, y, 2.2).fill(colour);
}

function courseOf(id: string | null, courses: Map<string, PlanPdfCourse>) {
  return id ? courses.get(id) : undefined;
}

function entryColour(row: Exclude<PlanDay<BlockLike>["rows"][number], { type: "empty" }>, courses: Map<string, PlanPdfCourse>) {
  if (row.type === "block") return courseOf(row.block.courseId, courses)?.colour ?? "#968e81";
  return row.item.colour ?? (row.item.source === "google" ? "#5b7c9d" : "#968e81");
}

/** A hex colour mixed toward white - `amount` 1 is the colour, 0 is white. */
function tint(hex: string, amount: number) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const mix = (c: string) => Math.round(255 + (parseInt(c, 16) - 255) * amount).toString(16).padStart(2, "0");
  return `#${mix(m[1])}${mix(m[2])}${mix(m[3])}`;
}

/** One hour window for every day page, so pages line up when flipped through. */
function hourWindow(days: PlanPdfInput["days"]) {
  let from = 8, to = 20;
  for (const d of days) for (const r of d.rows) {
    if (r.type === "empty") continue;
    from = Math.min(from, Math.floor(r.start / 60));
    to = Math.max(to, Math.ceil(r.end / 60));
  }
  return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) };
}

const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
