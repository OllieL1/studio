import { fmtDateLongYear, fmtDayDate, startOfWeek } from "../dates";
import { stackRows, timelinePosition, timelineWeeks } from "../project";
import { contentWidth, footers, newDoc, FAINT, INK, MARGIN, MUTED, RULE, RUST } from "./doc";

/**
 * The project schedule as a real document: what the project is, where it
 * stands, the whole runway drawn as a chart, then every item week by week.
 *
 * The chart is drawn from the same timeline maths as the screen
 * (lib/project.ts), so the paper copy and the app can't drift apart.
 */

export type SchedItem = {
  id: string;
  row: "meeting" | "deadline" | "task";
  title: string;
  /** ISO. For points, start === end. */
  start: string;
  end: string;
  done: boolean;
  weight: number | null;
};

export type SchedInput = {
  course: { name: string; code: string; colour: string; hoursTarget: number };
  pace: { loggedHours: number; neededPerWeek: number | null; recentPerWeek: number; weeksLeft: number };
  progress: { percent: number; tasksDone: number; tasksTotal: number };
  timeline: { items: SchedItem[]; from: Date; to: Date };
  /** Open tasks with neither a start nor a due date. */
  undated: string[];
  generatedAt: Date;
};

const ROW_LABEL = { meeting: "Meetings", deadline: "Deadlines", task: "Tasks" } as const;
const KIND_LABEL = { meeting: "Meeting", deadline: "Deadline", task: "Task" } as const;

export async function buildSchedulePdf(input: SchedInput): Promise<Buffer> {
  const { doc, done } = newDoc({
    title: "Project schedule",
    subject: `${input.course.name} · ${input.course.code}`,
    orientation: "landscape",
    createdAt: input.generatedAt,
  });

  header(doc, input);
  outline(doc, input);
  chart(doc, input);
  byWeek(doc, input);
  footers(doc, `Studio  ·  ${input.course.code}  ·  ${fmtDateLongYear(input.generatedAt)}`);

  doc.end();
  return done;
}

/* ── Header and outline ──────────────────────────────────────────────────── */

function header(doc: PDFKit.PDFDocument, { course, timeline, generatedAt }: SchedInput) {
  const width = contentWidth(doc);
  const daysLeft = Math.max(0, Math.ceil((timeline.to.getTime() - generatedAt.getTime()) / 86_400_000));

  doc.font("body").fontSize(9).fillColor(MUTED).text(course.code.toUpperCase(), MARGIN, MARGIN, { characterSpacing: 0.8 });
  doc.font("display").fontSize(26).fillColor(INK).text("Project schedule", MARGIN, doc.y + 2);

  // Right-hand deadline block, aligned to the title's baseline.
  const top = MARGIN + 2;
  doc
    .font("body")
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(`Final submission  ${fmtDayDate(timeline.to)} ${timeline.to.getFullYear()}`, MARGIN + width / 2, top, {
      width: width / 2,
      align: "right",
    });
  doc
    .font("bold")
    .fontSize(9.5)
    .fillColor(RUST)
    .text(`${daysLeft} days to go`, MARGIN + width / 2, doc.y + 1, { width: width / 2, align: "right" });

  const y = Math.max(doc.y, top + 34) + 10;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(1).strokeColor(RUST).stroke();
  doc.y = y + 16;
}

/** The "what this project is" band: the handful of numbers worth printing. */
function outline(doc: PDFKit.PDFDocument, { course, pace, progress, timeline }: SchedInput) {
  const width = contentWidth(doc);
  const tiles = [
    { label: "Progress", value: `${progress.percent.toFixed(0)}%`, wide: false },
    { label: "Hours logged", value: `${pace.loggedHours.toFixed(1)} / ${course.hoursTarget}h`, wide: true },
    { label: "Needed / week", value: pace.neededPerWeek != null ? `${pace.neededPerWeek.toFixed(1)}h` : "-" },
    { label: "Recent / week", value: `${pace.recentPerWeek.toFixed(1)}h` },
    { label: "Weeks left", value: pace.weeksLeft.toFixed(0) },
    { label: "Tasks done", value: `${progress.tasksDone} / ${progress.tasksTotal}` },
    { label: "Scheduled items", value: String(timeline.items.length) },
  ];

  // The name needs more room than a number does.
  const units = tiles.reduce((n, t) => n + (t.wide ? 2 : 1), 0);
  const unit = width / units;
  const top = doc.y;

  let x = MARGIN;
  for (const t of tiles) {
    const w = unit * (t.wide ? 2 : 1);
    doc.font("body").fontSize(7.5).fillColor(FAINT).text(t.label.toUpperCase(), x, top, { width: w - 10, characterSpacing: 0.6 });
    doc.font("bold").fontSize(12).fillColor(INK).text(t.value, x, top + 11, { width: w - 10, lineBreak: false, ellipsis: true });
    x += w;
  }

  doc.y = top + 32;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
  doc.y += 18;
}

/* ── The runway ──────────────────────────────────────────────────────────── */

const LANE = 15; // pt per stacked lane of task bars
const BAR = 11; // bar height within a lane
const LABEL_PT = 6.8;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function chart(doc: PDFKit.PDFDocument, { timeline, course, generatedAt }: SchedInput) {
  const width = contentWidth(doc);
  const labelWidth = 62;
  const left = MARGIN + labelWidth;
  const right = left + width - labelWidth;
  const plot = right - left;
  const weeks = timelineWeeks(timeline.from, timeline.to);
  const at = (iso: string | Date) => left + timelinePosition(typeof iso === "string" ? new Date(iso) : iso, weeks) * plot;

  const meetings = timeline.items.filter((i) => i.row === "meeting");
  const deadlines = timeline.items.filter((i) => i.row === "deadline");
  const tasks = timeline.items.filter((i) => i.row === "task");

  // Everything that carries a label is laid out first, in points, so a label
  // sitting outside its mark is stacked clear of its neighbours rather than
  // printed over them.
  doc.font("bold").fontSize(6.5);
  const flags = deadlines.map((d) => {
    const label = `${clip(d.title, 34)}  ${fmtShort(new Date(d.end))}`;
    const w = doc.widthOfString(label) + 8;
    const x = at(d.end);
    const flip = x + w > right;
    return { d, label, w, x, bx: flip ? x - w : x };
  });
  const flagLanes = stackRows(flags.map((f) => ({ start: f.bx, end: f.bx + f.w + 3 })));
  const flagLaneCount = Math.max(1, ...flagLanes.map((r) => r + 1));

  doc.font("body").fontSize(6.5);
  const pins = meetings.map((m) => {
    const label = clip(m.title, 24);
    const w = doc.widthOfString(label);
    const x = at(m.start);
    const flip = x + 7 + w > right;
    return { m, label, x, lx: flip ? x - 7 - w : x + 7, start: flip ? x - 7 - w : x - 4, end: flip ? x + 4 : x + 7 + w };
  });
  const pinLanes = stackRows(pins.map((p) => ({ start: p.start, end: p.end + 3 })));
  const pinLaneCount = Math.max(1, ...pinLanes.map((r) => r + 1));

  doc.font("body").fontSize(LABEL_PT);
  const bars = tasks.map((t) => {
    const x = at(t.start);
    const w = Math.max(at(t.end) - x, 4);
    const label = t.title;
    const lw = doc.widthOfString(label);
    const inside = lw + 9 <= w;
    // Too long for its bar: the label goes beside it, on whichever side has room.
    const flip = !inside && x + w + 4 + lw > right;
    const lx = inside ? x + 5 : flip ? x - 4 - lw : x + w + 4;
    return { t, x, w, label, inside, lx, start: Math.min(x, lx), end: Math.max(x + w, lx + lw) };
  });
  const lanes = stackRows(bars.map((b) => ({ start: b.start, end: b.end + 3 })));
  const laneCount = Math.max(1, ...lanes.map((r) => r + 1));

  doc.font("body").fontSize(8).fillColor(FAINT).text("THE RUNWAY", MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.y += 12;

  // Month and week-start header.
  const headTop = doc.y;
  weeks.forEach((w, i) => {
    const x = left + (i / weeks.length) * plot;
    if (w.monthLabel) {
      doc.font("bold").fontSize(7.5).fillColor(MUTED).text(w.monthLabel.toUpperCase(), x + 1, headTop, { lineBreak: false });
    }
    doc.font("body").fontSize(6).fillColor(FAINT).text(String(w.start.getDate()), x + 1, headTop + 10, { lineBreak: false });
  });

  const rowsTop = headTop + 20;
  const heights = {
    meeting: 8 + pinLaneCount * 11,
    deadline: 10 + flagLaneCount * 12,
    task: laneCount * LANE + 8,
  };
  const tops = {
    meeting: rowsTop,
    deadline: rowsTop + heights.meeting,
    task: rowsTop + heights.meeting + heights.deadline,
  };
  const bottom = tops.task + heights.task;

  // Alternate months get a faint wash so the eye can tell where a bar sits.
  let month = -1;
  weeks.forEach((w, i) => {
    if (w.monthLabel) month++;
    if (month % 2 !== 0) {
      const x = left + (i / weeks.length) * plot;
      doc.rect(x, rowsTop, plot / weeks.length, bottom - rowsTop).fillColor("#faf9f7").fill();
    }
  });

  // Week gridlines, heavier where a month starts.
  weeks.forEach((w, i) => {
    const x = left + (i / weeks.length) * plot;
    doc
      .moveTo(x, rowsTop)
      .lineTo(x, bottom)
      .lineWidth(w.monthLabel ? 0.6 : 0.3)
      .strokeColor(RULE)
      .stroke();
  });
  doc.moveTo(left, rowsTop).lineTo(right, rowsTop).lineWidth(0.5).strokeColor(RULE).stroke();

  // Row labels and their separators.
  (["meeting", "deadline", "task"] as const).forEach((row) => {
    const count = row === "meeting" ? meetings.length : row === "deadline" ? deadlines.length : tasks.length;
    doc
      .font("bold")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`${ROW_LABEL[row]} ${count}`, MARGIN, tops[row] + heights[row] / 2 - 4, { width: labelWidth - 6, lineBreak: false });
    const y = tops[row] + heights[row];
    doc.moveTo(MARGIN, y).lineTo(right, y).lineWidth(0.3).strokeColor(RULE).stroke();
  });

  // Meetings: a diamond, named beside it.
  pins.forEach((p, i) => {
    const y = tops.meeting + 8 + pinLanes[i] * 11;
    doc.save().translate(p.x, y).rotate(45).rect(-3, -3, 6, 6).fillColor(p.m.done ? FAINT : RUST).fill().restore();
    doc.font("body").fontSize(6.5).fillColor(p.m.done ? FAINT : MUTED).text(p.label, p.lx, y - 3.2, { lineBreak: false });
  });

  // Deadlines: a stem the full height of the row, with a label flag stacked
  // into whichever lane is free.
  flags.forEach((f, i) => {
    const top = tops.deadline + 4;
    const foot = tops.deadline + heights.deadline - 3;
    doc.moveTo(f.x, top).lineTo(f.x, foot).lineWidth(1).strokeColor(f.d.done ? RULE : INK).stroke();

    const y = top + flagLanes[i] * 12;
    doc.rect(f.bx, y, f.w, 10).fillColor(f.d.done ? RULE : INK).fill();
    doc.font("bold").fontSize(6.5).fillColor(f.d.done ? MUTED : "#ffffff").text(f.label, f.bx + 4, y + 2.2, { lineBreak: false });
  });

  // Tasks: bars, stacked so none overlap. The title sits inside when it fits,
  // otherwise beside the bar. A finished task is grey, not coloured.
  bars.forEach((b, i) => {
    const y = tops.task + 4 + lanes[i] * LANE;
    const tone = b.t.done ? FAINT : course.colour;
    doc.rect(b.x, y, b.w, BAR).fillColor(tone).fillOpacity(b.t.done ? 0.2 : 0.3).fill().fillOpacity(1);
    doc.rect(b.x, y, 1.6, BAR).fillColor(tone).fill();
    doc.font("body").fontSize(LABEL_PT).fillColor(b.t.done ? MUTED : INK).text(b.label, b.lx, y + 2.1, { lineBreak: false });
  });

  // Today: the line runs behind nothing, and its tag sits under the chart
  // where it can't collide with the week numbers.
  if (generatedAt >= timeline.from && generatedAt <= timeline.to) {
    const x = at(generatedAt);
    doc.moveTo(x, rowsTop).lineTo(x, bottom + 3).lineWidth(1).strokeColor(RUST).dash(2, { space: 2 }).stroke().undash();
    doc.font("bold").fontSize(6).fillColor(RUST).text("TODAY", x - 20, bottom + 5, { width: 40, align: "center", lineBreak: false });
  }

  doc.y = bottom + 24;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtShort = (d: Date) => `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;

/* ── Week by week ────────────────────────────────────────────────────────── */

function byWeek(doc: PDFKit.PDFDocument, { timeline, undated }: SchedInput) {
  const width = contentWidth(doc);
  const items = [...timeline.items].sort((a, b) => a.end.localeCompare(b.end) || a.title.localeCompare(b.title));

  const weeks = new Map<number, SchedItem[]>();
  for (const it of items) {
    const k = startOfWeek(new Date(it.end)).getTime();
    weeks.set(k, [...(weeks.get(k) ?? []), it]);
  }

  doc.font("display").fontSize(15).fillColor(INK).text("Week by week", MARGIN, doc.y);
  doc.y += 6;

  if (weeks.size === 0) {
    doc.font("body").fontSize(9.5).fillColor(FAINT).text("Nothing scheduled yet.", MARGIN, doc.y);
    doc.y += 14;
  }

  const cols = { week: 96, kind: 58, when: 128 };
  const titleWidth = width - cols.week - cols.kind - cols.when - 24;
  let headerDrawn = false;

  const columnHeads = () => {
    // Every text call advances the cursor, so the four headings share one y.
    const y = doc.y;
    doc.font("bold").fontSize(7).fillColor(FAINT);
    doc.text("WEEK", MARGIN, y, { width: cols.week, lineBreak: false, characterSpacing: 0.5 });
    doc.text("TYPE", MARGIN + cols.week, y, { width: cols.kind, lineBreak: false, characterSpacing: 0.5 });
    doc.text("ITEM", MARGIN + cols.week + cols.kind, y, { width: titleWidth, lineBreak: false, characterSpacing: 0.5 });
    doc.text("DATES", MARGIN + width - cols.when, y, { width: cols.when, align: "right", lineBreak: false, characterSpacing: 0.5 });
    doc.y = y + 11;
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.y += 5;
  };

  for (const [week, list] of [...weeks.entries()].sort((a, b) => a[0] - b[0])) {
    // Keep a week's first row with its heading: start a page if it would split.
    const needed = 16 + list.length * 13;
    if (!headerDrawn || doc.y + Math.min(needed, 60) > doc.page.height - MARGIN - 10) {
      if (headerDrawn) doc.addPage();
      columnHeads();
      headerDrawn = true;
    }

    const weekStart = new Date(week);
    list.forEach((it, i) => {
      // A long title wraps onto further lines, so the row is as tall as it needs to be.
      doc.font("body").fontSize(9);
      const lines = wrap(doc, it.title, titleWidth);
      const rowHeight = lines.length * LINE + 2;
      if (doc.y + rowHeight > doc.page.height - MARGIN - 16) {
        doc.addPage();
        columnHeads();
      }
      const y = doc.y;
      if (i === 0) {
        doc.font("bold").fontSize(8.5).fillColor(MUTED).text(`w/b ${fmtDayDate(weekStart)}`, MARGIN, y, { width: cols.week, lineBreak: false });
      }
      doc.font("body").fontSize(8).fillColor(FAINT).text(KIND_LABEL[it.row], MARGIN + cols.week, y, { width: cols.kind, lineBreak: false });

      const titleX = MARGIN + cols.week + cols.kind;
      drawLines(doc, lines, titleX, y - 0.5, it.done);

      const span =
        it.row === "task" && it.start !== it.end
          ? `${fmtDayDate(new Date(it.start))} → ${fmtDayDate(new Date(it.end))}`
          : fmtDayDate(new Date(it.end));
      const extra = it.weight != null ? `  ·  ${it.weight}%` : "";
      doc.font("body").fontSize(8).fillColor(MUTED).text(span + extra, MARGIN + width - cols.when, y, {
        width: cols.when,
        align: "right",
        lineBreak: false,
      });

      doc.y = y + rowHeight;
    });

    doc.moveTo(MARGIN, doc.y - 3).lineTo(MARGIN + width, doc.y - 3).lineWidth(0.3).strokeColor(RULE).stroke();
    doc.y += 3;
  }

  if (undated.length > 0) {
    if (doc.y > doc.page.height - MARGIN - 60) doc.addPage();
    doc.y += 10;
    doc.font("bold").fontSize(9).fillColor(INK).text("Not scheduled yet", MARGIN, doc.y);
    doc.y += 4;
    for (const title of undated) {
      doc.font("body").fontSize(9);
      const lines = wrap(doc, title, width - 10);
      if (doc.y + lines.length * LINE > doc.page.height - MARGIN - 16) doc.addPage();
      const y = doc.y;
      doc.font("body").fontSize(8).fillColor(FAINT).text("·", MARGIN, y, { width: 8, lineBreak: false });
      drawLines(doc, lines, MARGIN + 10, y, false);
      doc.y = y + lines.length * LINE + 1;
    }
  }
}

/* ── Wrapped, struck-through titles ──────────────────────────────────────── */

const LINE = 12; // pt between wrapped lines

/** Break `text` to fit `width` in the current font - on spaces, and inside a
 *  word only when it alone is wider than the column (or has no spaces, as in
 *  Japanese). Measured through pdfkit, so the CJK fallback face is respected. */
function wrap(doc: PDFKit.PDFDocument, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (piece: string) => {
    const next = line ? `${line} ${piece}` : piece;
    if (doc.widthOfString(next) <= width) { line = next; return; }
    if (line) lines.push(line);
    line = "";
    if (doc.widthOfString(piece) <= width) { line = piece; return; }
    for (const ch of piece) {
      if (line && doc.widthOfString(line + ch) > width) { lines.push(line); line = ""; }
      line += ch;
    }
  };
  text.split(/\s+/).filter(Boolean).forEach(push);
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Draw wrapped lines, each struck through on its own when `done`. The strike
 *  is placed from the line's measured height, not a fixed offset, so it lands
 *  mid-letter in Inter and in the Japanese fallback face alike. */
function drawLines(doc: PDFKit.PDFDocument, lines: string[], x: number, y: number, done: boolean) {
  lines.forEach((text, i) => {
    const top = y + i * LINE;
    doc.font("body").fontSize(9).fillColor(done ? FAINT : INK).text(text, x, top, { lineBreak: false });
    if (done && text) {
      const mid = top + doc.heightOfString(text, { lineBreak: false }) * 0.5 + 0.6;
      doc.moveTo(x, mid).lineTo(x + doc.widthOfString(text), mid).lineWidth(0.5).strokeColor(FAINT).stroke();
    }
  });
}
