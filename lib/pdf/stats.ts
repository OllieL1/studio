import { fmtDate, fmtDateLongYear, fmtDuration, fmtTime } from "../dates";
import { barChart, chartTitle, hBarChart, lineChart, statRow, type Box } from "./charts";
import { contentWidth, footers, newDoc, FAINT, INK, MARGIN, MUTED, RULE, RUST } from "./doc";
import type { Headline } from "../stats";
import { MIN_ARTIST_SESSIONS, MIN_COMPARE, type MusicStats } from "../musicStats";

/**
 * The stats page as a printable report: the same figures, the same order, in
 * a form that survives being read on paper.
 *
 * Everything is computed by the caller from lib/stats.ts and lib/musicStats.ts,
 * so the document can never disagree with the screen.
 */

export type StatsInput = {
  rangeLabel: string;
  generatedAt: Date;
  headline: Headline;
  byHour: { hour: number; minutes: number; focus: number | null }[];
  byDay: { label: string; avgMinutes: number; occurrences: number; focus: number | null }[];
  daily: { date: Date; minutes: number; focus: number | null }[];
  focusTrend: (number | null)[];
  focusBands: { label: string; sessions: number; minutes: number }[];
  focusByLength: { label: string; sessions: number; focus: number | null }[];
  subjects: { name: string; colour: string; minutes: number; sessions: number; focus: number | null }[];
  places: {
    rows: { label: string; minutes: number; sessions: number; avgSession: number; focus: number | null; share: number }[];
    unknownMinutes: number;
    unknownSessions: number;
  };
  music: MusicStats | null;
};

const GAP = 18;

export async function buildStatsPdf(input: StatsInput): Promise<Buffer> {
  const { doc, done } = newDoc({
    title: "Study stats",
    subject: `Studio · ${input.rangeLabel}`,
    createdAt: input.generatedAt,
  });

  header(doc, input);
  headlineBlock(doc, input);
  whenYouWork(doc, input);
  focus(doc, input);
  subjects(doc, input);
  places(doc, input);
  music(doc, input);
  honesty(doc, input);

  footers(doc, `Studio  ·  Study stats  ·  ${fmtDateLongYear(input.generatedAt)}`);
  doc.end();
  return done;
}

/* ── Frame ───────────────────────────────────────────────────────────────── */

/** Start a new page when the next block wouldn't fit on this one. */
function ensure(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - MARGIN - 6) doc.addPage();
}

function section(doc: PDFKit.PDFDocument, title: string, sub?: string) {
  doc.font("display").fontSize(14).fillColor(INK).text(title, MARGIN, doc.y, { lineBreak: false });
  doc.y += 17;
  if (sub) {
    doc.font("body").fontSize(8).fillColor(MUTED).text(sub, MARGIN, doc.y, { width: contentWidth(doc) });
    doc.y += 4;
  }
  doc.y += 6;
}

/** Two charts side by side; returns the y below the taller of the pair. */
function columns(doc: PDFKit.PDFDocument, height: number): [Box, Box] {
  const width = contentWidth(doc);
  const gutter = 22;
  const w = (width - gutter) / 2;
  const y = doc.y;
  return [
    { x: MARGIN, y, width: w, height },
    { x: MARGIN + w + gutter, y, width: w, height },
  ];
}

function header(doc: PDFKit.PDFDocument, { rangeLabel, generatedAt }: StatsInput) {
  const width = contentWidth(doc);
  doc.font("body").fontSize(9).fillColor(MUTED).text("ANALYTICS", MARGIN, MARGIN, { characterSpacing: 0.8 });
  doc.font("display").fontSize(26).fillColor(INK).text("Study stats", MARGIN, doc.y + 2);
  doc
    .font("body")
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(`${rangeLabel}  ·  ${fmtDateLongYear(generatedAt)}`, MARGIN + width / 2, MARGIN + 4, { width: width / 2, align: "right" });

  // The right-hand line is shorter than the title, so the rule has to clear
  // the title's baseline rather than wherever the cursor happens to be.
  const y = Math.max(doc.y, MARGIN + 44) + 10;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(1).strokeColor(RUST).stroke();
  doc.y = y + 18;
}

/* ── Blocks ──────────────────────────────────────────────────────────────── */

function headlineBlock(doc: PDFKit.PDFDocument, { headline: h }: StatsInput) {
  const width = contentWidth(doc);
  doc.y = statRow(doc, { x: MARGIN, y: doc.y, width, height: 36 }, [
    { label: "Total tracked", value: fmtDuration(h.totalMinutes), sub: `${h.sessions} sessions` },
    { label: "Per active day", value: fmtDuration(h.avgPerActiveDay), sub: `${h.activeDays} days studied` },
    { label: "Avg session", value: fmtDuration(h.avgSessionLength), sub: "Time-weighted" },
    { label: "Avg focus", value: `${h.avgFocus.toFixed(0)}%`, sub: "Weighted by minutes" },
    { label: "Best day", value: h.bestDay?.label ?? "-", sub: h.bestDay ? `${fmtDuration(h.bestDay.avgMinutes)} avg` : undefined },
    { label: "Best hour", value: h.bestHour ? fmtTime(h.bestHour.hour * 60) : "-", sub: h.bestHour ? `${fmtDuration(h.bestHour.minutes)} total` : undefined },
  ]);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
  doc.y += GAP;
}

function whenYouWork(doc: PDFKit.PDFDocument, { byHour, byDay, daily, headline }: StatsInput) {
  section(doc, "When you work", "Each session is spread across the hours it actually covered.");

  ensure(doc, 110);
  const [left, right] = columns(doc, 92);
  chartTitle(doc, "By hour of day", left, headline.bestHour ? `peak ${fmtTime(headline.bestHour.hour * 60)}` : undefined);
  barChart(
    doc,
    { ...left, y: left.y + 12, height: 80 },
    byHour.map((h) => ({ label: h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : "", value: h.minutes })),
    { labelEvery: 1 },
  );

  chartTitle(doc, "By day of week", right, "average per occurrence");
  barChart(
    doc,
    { ...right, y: right.y + 12, height: 80 },
    byDay.map((d) => ({
      label: d.label,
      value: d.avgMinutes,
      note: d.focus != null ? `${d.focus.toFixed(0)}%` : undefined,
    })),
  );
  doc.y = left.y + 104;

  // Daily minutes over the window, with its rolling mean.
  if (daily.length > 3) {
    ensure(doc, 108);
    const width = contentWidth(doc);
    const box: Box = { x: MARGIN, y: doc.y, width, height: 92 };
    chartTitle(doc, "Minutes per day", box, `${daily.length} days`);
    const trend = rolling(daily.map((d) => d.minutes), 7);
    lineChart(
      doc,
      { ...box, y: box.y + 12, height: 80 },
      daily.map((d) => ({ label: fmtDate(d.date), value: d.minutes })),
      trend,
      { unit: "m" },
    );
    doc.y = box.y + 104;
  }
  doc.y += GAP - 8;
}

function focus(doc: PDFKit.PDFDocument, { daily, focusTrend, focusBands, focusByLength }: StatsInput) {
  ensure(doc, 150);
  section(doc, "Focus", "Your own rating, weighted by how long each session ran.");

  ensure(doc, 112);
  const width = contentWidth(doc);
  const box: Box = { x: MARGIN, y: doc.y, width, height: 96 };
  chartTitle(doc, "Focus over time", box, "thick line is a 7-day mean");
  lineChart(
    doc,
    { ...box, y: box.y + 12, height: 84 },
    daily.map((d) => ({ label: fmtDate(d.date), value: d.focus })),
    focusTrend,
    { max: 100, unit: "%" },
  );
  doc.y = box.y + 108;

  ensure(doc, 108);
  const [left, right] = columns(doc, 92);
  chartTitle(doc, "Focus distribution", left, "sessions per band");
  barChart(
    doc,
    { ...left, y: left.y + 12, height: 80 },
    focusBands.map((b) => ({ label: b.label, value: b.sessions, note: `${b.sessions}` })),
    { format: "count" },
  );

  chartTitle(doc, "How long before focus drops?", right);
  hBarChart(
    doc,
    { ...right, y: right.y + 14, height: 78 },
    focusByLength.map((b) => ({ label: b.label, value: b.focus ?? 0, secondary: b.sessions > 0 ? `${b.sessions}×` : undefined })),
    { format: "percent", labelWidth: 52 },
  );
  doc.y = left.y + 104 + GAP - 8;
}

function subjects(doc: PDFKit.PDFDocument, { subjects: rows }: StatsInput) {
  const withTime = rows.filter((s) => s.minutes > 0);
  if (withTime.length === 0) return;

  ensure(doc, 90);
  section(doc, "By subject", "A session covering two subjects gives each its own slice.");

  const height = withTime.length * 14 + 16;
  ensure(doc, height);
  const [left, right] = columns(doc, height);
  chartTitle(doc, "Time invested", left);
  hBarChart(
    doc,
    { ...left, y: left.y + 14, height: height - 14 },
    withTime.map((s) => ({ label: s.name, value: s.minutes, colour: s.colour, secondary: `${s.sessions}×` })),
    { labelWidth: 96 },
  );

  chartTitle(doc, "Focus by subject", right);
  hBarChart(
    doc,
    { ...right, y: right.y + 14, height: height - 14 },
    withTime.filter((s) => s.focus != null).map((s) => ({ label: s.name, value: s.focus!, colour: s.colour })),
    { format: "percent", labelWidth: 96 },
  );
  doc.y = left.y + height + GAP;
}

function places(doc: PDFKit.PDFDocument, { places: p }: StatsInput) {
  if (p.rows.length === 0) return;

  ensure(doc, 90);
  section(doc, "Where you work", "Tagged when you stop the timer.");

  const height = p.rows.length * 14 + 16;
  ensure(doc, height);
  const [left, right] = columns(doc, height);
  chartTitle(doc, "Time by place", left, p.unknownSessions > 0 ? `${p.unknownSessions} untagged` : undefined);
  hBarChart(
    doc,
    { ...left, y: left.y + 14, height: height - 14 },
    p.rows.map((r) => ({ label: r.label, value: r.minutes, secondary: `${(r.share * 100).toFixed(0)}%` })),
    { labelWidth: 72 },
  );

  chartTitle(doc, "Focus by place", right);
  hBarChart(
    doc,
    { ...right, y: right.y + 14, height: height - 14 },
    p.rows.filter((r) => r.focus != null).map((r) => ({ label: r.label, value: r.focus!, secondary: fmtDuration(r.avgSession) })),
    { format: "percent", labelWidth: 72 },
  );
  doc.y = left.y + height + 4;

  if (p.unknownMinutes > 0) {
    doc.font("body").fontSize(7).fillColor(FAINT).text(
      `${fmtDuration(p.unknownMinutes)} logged before locations were tracked - not counted above.`,
      MARGIN,
      doc.y,
      { width: contentWidth(doc) },
    );
    doc.y += 4;
  }
  doc.y += GAP;
}

function music(doc: PDFKit.PDFDocument, { music: m }: StatsInput) {
  if (!m || m.trackedSessions === 0) return;

  ensure(doc, 120);
  section(doc, "Music", "What plays while you study, and how it lines up with focus.");

  const width = contentWidth(doc);
  const vs = m.musicVsSilence;
  doc.y = statRow(doc, { x: MARGIN, y: doc.y, width, height: 36 }, [
    { label: "With music", value: `${(m.share * 100).toFixed(0)}%`, sub: "of tracked study time" },
    {
      // A points difference in focus: positive means music sessions scored higher.
      label: "Music vs silence",
      value: vs != null ? `${vs > 0 ? "+" : ""}${vs.toFixed(0)} pts` : "-",
      sub: vs != null ? "focus with music" : `needs ${MIN_COMPARE}+ sessions of each`,
    },
    { label: "Listened", value: fmtDuration(m.listeningMinutes), sub: `${m.trackedSessions} tracked sessions` },
    { label: "Top artist", value: m.topArtists[0]?.artist ?? "-", sub: m.topArtists[0] ? fmtDuration(m.topArtists[0].minutes) : undefined },
  ]);
  doc.y += 6;

  const rows = Math.max(m.topArtists.length, m.focusByArtist.length);
  if (rows > 0) {
    const height = rows * 14 + 16;
    ensure(doc, height);
    const [left, right] = columns(doc, height);
    chartTitle(doc, "Most played", left, "by listening time");
    hBarChart(
      doc,
      { ...left, y: left.y + 14, height: height - 14 },
      m.topArtists.map((a) => ({ label: a.artist, value: a.minutes, secondary: `${a.sessions}×` })),
      { labelWidth: 96 },
    );

    chartTitle(doc, "Focus by artist", right, `${MIN_ARTIST_SESSIONS}+ sessions each`);
    hBarChart(
      doc,
      { ...right, y: right.y + 14, height: height - 14 },
      m.focusByArtist.map((a) => ({ label: a.artist, value: a.focus!, secondary: `${a.sessions}×` })),
      { format: "percent", labelWidth: 96 },
    );
    doc.y = left.y + height + 8;
  }

  const variety = m.variety.filter((v) => v.sessions > 0);
  if (variety.length > 0) {
    ensure(doc, 60);
    const box: Box = { x: MARGIN, y: doc.y, width, height: 50 };
    chartTitle(doc, "Variety vs focus", box, "an artist counts once, however many guests are on the track");
    hBarChart(
      doc,
      { ...box, y: box.y + 14, height: 36 },
      variety.map((v) => ({ label: v.label, value: v.focus ?? 0, secondary: `${v.sessions}×` })),
      { format: "percent", labelWidth: 96 },
    );
    doc.y = box.y + 14 + variety.length * 14 + 6;
  }
  doc.y += GAP - 8;
}

function honesty(doc: PDFKit.PDFDocument, { headline: h }: StatsInput) {
  if (h.adjustedDownMinutes <= 0) return;
  ensure(doc, 30);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + contentWidth(doc), doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
  doc.y += 8;
  doc
    .font("body")
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      `You've trimmed ${fmtDuration(h.adjustedDownMinutes)} off tracked time across ${h.sessions} sessions - every figure here uses the adjusted number, not the raw clock.`,
      MARGIN,
      doc.y,
      { width: contentWidth(doc) },
    );
}

/** Rolling mean over a numeric series, for the daily-minutes trend. */
function rolling(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.length === 0 ? null : slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
