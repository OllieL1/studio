import { fmtDate, fmtDateLongYear, fmtDuration } from "../dates";
import {
  fmtHours, fmtUSD, isPlatform, PLATFORM_SHORT, sessionCents, sovranoTotals,
  type SovProject, type SovSession,
} from "../sovrano";
import { footers, hairline, newDoc, FAINT, INK, MARGIN, MUTED, RULE } from "./doc";

/**
 * A Sovrano work log as a PDF: what's owed and paid, project by project,
 * then every session - a record to keep, or to check a payout against.
 * Drawn in Sovrano's teal, which neither app uses as its own accent.
 */

/** --color-sov-500 / -200 (app/globals.css). */
const TEAL = "#3e7c70";
const TEAL_SOFT = "#b7d5cd";

const PAGE_WIDTH = 595.28;
const CONTENT = PAGE_WIDTH - MARGIN * 2;

type Col = { label: string; width: number; align?: "left" | "right" };

/** The session table. Name takes what the rest leave. */
const COLS: Col[] = [
  { label: "Date", width: 42 },
  { label: "Session", width: 0 },
  { label: "Project", width: 86 },
  { label: "Via", width: 42 },
  { label: "Time", width: 42, align: "right" },
  { label: "Value", width: 54, align: "right" },
  { label: "Paid", width: 40, align: "right" },
];
const GAP = 8;
COLS[1].width = CONTENT - COLS.reduce((s, c) => s + c.width, 0) - GAP * (COLS.length - 1);

export async function buildSovranoPdf(
  sessions: SovSession[],
  projects: SovProject[],
  meta: { title: string; generatedAt: Date },
): Promise<Buffer> {
  const { doc, done } = newDoc({ title: meta.title, subject: "Sovrano work log", createdAt: meta.generatedAt });
  const byId = new Map(projects.map((p) => [p.id, p]));
  const used = projects.filter((p) => sessions.some((s) => s.projectId === p.id));
  const t = sovranoTotals(sessions, used, meta.generatedAt);
  const ordered = [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  // ── Title
  doc.font("display").fontSize(26).fillColor(INK).text(meta.title, MARGIN, MARGIN);
  doc.moveDown(0.35);
  const range = ordered.length
    ? `${fmtDateLongYear(ordered[0].startedAt)} – ${fmtDateLongYear(ordered[ordered.length - 1].startedAt)}`
    : "No sessions";
  doc.font("body").fontSize(10).fillColor(MUTED)
    .text(`${ordered.length} ${ordered.length === 1 ? "session" : "sessions"}  ·  ${range}`);
  doc.y += 12;
  hairline(doc, TEAL, 1);
  doc.y += 2;

  // ── Totals
  const figures: [string, string, string | null][] = [
    ["Owed", fmtUSD(t.unpaidCents), `${fmtHours(t.unpaidMinutes)} unpaid`],
    ["Paid", fmtUSD(t.paidCents), null],
    ["Hours", fmtHours(t.minutes), null],
  ];
  const cellW = CONTENT / figures.length;
  const top = doc.y;
  figures.forEach(([label, value, sub], i) => {
    const x = MARGIN + i * cellW;
    doc.font("bold").fontSize(7.5).fillColor(FAINT).text(label.toUpperCase(), x, top, { width: cellW, characterSpacing: 0.8 });
    doc.font("bold").fontSize(18).fillColor(i === 0 ? TEAL : INK).text(value, x, top + 12, { width: cellW });
    if (sub) doc.font("body").fontSize(8.5).fillColor(MUTED).text(sub, x, top + 35, { width: cellW });
  });
  doc.y = top + 54;
  if (t.unratedMinutes > 0) {
    doc.font("italic").fontSize(9).fillColor(MUTED)
      .text(`${fmtHours(t.unratedMinutes)} unpaid on projects with no rate isn't counted in what's owed.`, MARGIN, doc.y, { width: CONTENT });
    doc.y += 6;
  }

  // ── Per project
  if (t.projects.length) {
    doc.y += 8;
    section(doc, "By project");
    const pc: Col[] = [
      { label: "Project", width: CONTENT - 4 * 72 - 4 * GAP },
      { label: "Rate", width: 72, align: "right" },
      { label: "Unpaid", width: 72, align: "right" },
      { label: "Owed", width: 72, align: "right" },
      { label: "Paid", width: 72, align: "right" },
    ];
    header(doc, pc);
    for (const p of t.projects) {
      ensure(doc, 16, () => header(doc, pc));
      row(doc, pc, [
        p.name,
        p.rateCents == null ? "-" : `${fmtUSD(p.rateCents)}/h`,
        p.unpaidMinutes ? fmtHours(p.unpaidMinutes) : "-",
        p.unpaidCents == null ? "no rate" : p.unpaidMinutes ? fmtUSD(p.unpaidCents) : "-",
        p.paidCents ? fmtUSD(p.paidCents) : "-",
      ]);
    }
  }

  // ── Sessions
  doc.y += 14;
  ensure(doc, 60);
  section(doc, "Sessions");
  header(doc, COLS);
  for (const s of ordered) {
    ensure(doc, 16, () => header(doc, COLS));
    const cents = sessionCents(s, byId.get(s.projectId));
    row(
      doc,
      COLS,
      [
        fmtDate(s.startedAt),
        s.name,
        byId.get(s.projectId)?.name ?? "-",
        isPlatform(s.platform) ? PLATFORM_SHORT[s.platform] : s.platform,
        fmtDuration(s.minutes),
        cents == null ? "-" : fmtUSD(cents),
        s.paidAt ? fmtDate(s.paidAt) : "unpaid",
      ],
      s.paidAt ? MUTED : INK,
    );
  }

  footers(doc, `Sovrano  ·  ${fmtDateLongYear(meta.generatedAt)}`);
  doc.end();
  return done;
}

const bottom = (doc: PDFKit.PDFDocument) => doc.page.height - MARGIN;

/** Start a new page if `height` won't fit - repeating the table's header there. */
function ensure(doc: PDFKit.PDFDocument, height: number, again?: () => void) {
  if (doc.y + height <= bottom(doc)) return;
  doc.addPage();
  doc.y = MARGIN;
  again?.();
}

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.font("bold").fontSize(11).fillColor(INK).text(title, MARGIN, doc.y);
  doc.y += 6;
}

function header(doc: PDFKit.PDFDocument, cols: Col[]) {
  const y = doc.y;
  let x = MARGIN;
  for (const c of cols) {
    doc.font("bold").fontSize(7.5).fillColor(FAINT)
      .text(c.label.toUpperCase(), x, y, { width: c.width, align: c.align ?? "left", characterSpacing: 0.6, lineBreak: false });
    x += c.width + GAP;
  }
  doc.y = y + 12;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT, doc.y).lineWidth(0.75).strokeColor(TEAL_SOFT).stroke();
  doc.y += 5;
}

/** One line per row: long text is cut short with an ellipsis, never wrapped. */
function row(doc: PDFKit.PDFDocument, cols: Col[], cells: string[], colour = INK) {
  const y = doc.y;
  let x = MARGIN;
  cols.forEach((c, i) => {
    doc.font("body").fontSize(8.5).fillColor(i === 0 ? MUTED : colour);
    doc.text(fit(doc, cells[i], c.width), x, y, { width: c.width, align: c.align ?? "left", lineBreak: false });
    x += c.width + GAP;
  });
  doc.y = y + 12;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT, doc.y).lineWidth(0.4).strokeColor(RULE).stroke();
  doc.y += 4;
}

/** `text` cut to `width` at the current font, ending "…" if it had to be. */
export function fit(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(`${text.slice(0, mid).trimEnd()}…`) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}
