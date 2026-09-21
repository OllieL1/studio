import { FAINT, INK, MUTED, RULE, RUST } from "./doc";

/**
 * Chart marks for the printed reports.
 *
 * Print has no hover, so anything the reader needs has to be on the page:
 * axes stay recessive, marks stay thin, and labels are selective - the peak
 * and the ends, never a number on every bar. Series colour carries identity
 * only; all text is ink, never the series colour.
 */

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Trim text to fit a width, with an ellipsis. pdfkit's own `ellipsis` option
 * still wraps onto a second line when a width is set, which silently overlaps
 * the row below - measuring is the only reliable way.
 *
 * The caller must have set the font and size already.
 */
export function fit(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) t = t.slice(0, -1);
  return `${t}…`;
}

export const fmtMins = (m: number) => {
  const mins = Math.round(m);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
};

const fmtValue = (v: number, format: "duration" | "percent" | "count") =>
  format === "duration" ? fmtMins(v) : format === "percent" ? `${v.toFixed(0)}%` : String(Math.round(v));

/** A small caps label above a chart. */
export function chartTitle(doc: PDFKit.PDFDocument, title: string, box: Box, note?: string) {
  doc.font("bold").fontSize(7.5).fillColor(FAINT).text(title.toUpperCase(), box.x, box.y, {
    width: box.width,
    characterSpacing: 0.6,
    lineBreak: false,
  });
  if (note) {
    doc.font("body").fontSize(7).fillColor(FAINT).text(note, box.x, box.y, { width: box.width, align: "right", lineBreak: false });
  }
}

/**
 * Vertical bars for a distribution across an ordered axis (hours, weekdays,
 * bands). The tallest bar is labelled; the rest are left to the axis.
 */
export function barChart(
  doc: PDFKit.PDFDocument,
  box: Box,
  bars: { label: string; value: number; note?: string }[],
  {
    colour = RUST,
    format = "duration",
    labelEvery = 1,
  }: { colour?: string; format?: "duration" | "percent" | "count"; labelEvery?: number } = {},
) {
  const max = Math.max(...bars.map((b) => b.value), 0);
  const axisY = box.y + box.height - 10;
  const plotHeight = box.height - 20;

  // Baseline, and a single recessive gridline at the top of the scale.
  doc.moveTo(box.x, axisY).lineTo(box.x + box.width, axisY).lineWidth(0.5).strokeColor(RULE).stroke();
  if (max > 0) {
    doc.moveTo(box.x, box.y + 10).lineTo(box.x + box.width, box.y + 10).lineWidth(0.3).strokeColor(RULE).stroke();
    doc.font("body").fontSize(6).fillColor(FAINT).text(fmtValue(max, format), box.x, box.y + 2, {
      width: box.width,
      align: "right",
      lineBreak: false,
    });
  }

  const slot = box.width / bars.length;
  const barWidth = Math.max(1.5, slot - 2); // 2pt of surface between bars

  bars.forEach((b, i) => {
    const x = box.x + i * slot + (slot - barWidth) / 2;
    const h = max > 0 ? (b.value / max) * plotHeight : 0;
    if (h > 0.4) {
      // Round only the data end: draw past the baseline, clipped to the plot.
      doc.save().rect(box.x, axisY - plotHeight, box.width, plotHeight).clip();
      doc.roundedRect(x, axisY - h, barWidth, h + 4, Math.min(2, barWidth / 2)).fillColor(colour).fill();
      doc.restore();
    }
    if (i % labelEvery === 0) {
      doc.font("body").fontSize(6).fillColor(FAINT).text(b.label, box.x + i * slot - slot / 2, axisY + 3, {
        width: slot * 2,
        align: "center",
        lineBreak: false,
      });
    }
  });

  // Direct-label the peak only.
  const peak = bars.reduce((best, b, i) => (b.value > bars[best].value ? i : best), 0);
  const peakLabel = bars[peak]?.note ?? fmtValue(bars[peak]?.value ?? 0, format);
  if (max > 0 && peakLabel !== fmtValue(max, format)) {
    const x = box.x + peak * slot;
    const h = (bars[peak].value / max) * plotHeight;
    doc.font("bold").fontSize(6.5).fillColor(INK).text(peakLabel, x - slot, axisY - h - 8, {
      width: slot * 3,
      align: "center",
      lineBreak: false,
    });
  }
}

/** Ranked horizontal bars - the form for "which of these is biggest". */
export function hBarChart(
  doc: PDFKit.PDFDocument,
  box: Box,
  rows: { label: string; value: number; colour?: string; secondary?: string }[],
  { format = "duration", labelWidth = 92 }: { format?: "duration" | "percent" | "count"; labelWidth?: number } = {},
) {
  if (rows.length === 0) {
    doc.font("body").fontSize(8).fillColor(FAINT).text("Nothing to show yet.", box.x, box.y + 4, { width: box.width });
    return box.y + 20;
  }

  const max = format === "percent" ? 100 : Math.max(...rows.map((r) => r.value), 0);
  const rowHeight = 14;
  const trackX = box.x + labelWidth;
  const valueWidth = 62;
  const trackWidth = box.width - labelWidth - valueWidth;

  rows.forEach((r, i) => {
    const y = box.y + i * rowHeight;
    doc.font("body").fontSize(8).fillColor(MUTED);
    doc.text(fit(doc, r.label, labelWidth - 6), box.x, y + 1, { width: labelWidth - 6, lineBreak: false });

    doc.roundedRect(trackX, y + 2.5, trackWidth, 6, 3).fillColor(RULE).fillOpacity(0.7).fill().fillOpacity(1);
    const w = max > 0 ? Math.max((r.value / max) * trackWidth, r.value > 0 ? 2 : 0) : 0;
    if (w > 0) doc.roundedRect(trackX, y + 2.5, w, 6, 3).fillColor(r.colour ?? RUST).fill();

    const value = fmtValue(r.value, format);
    doc.font("bold").fontSize(8).fillColor(INK);
    // Measure with the font that draws it, before anything switches fonts.
    const valueSpan = doc.widthOfString(value);
    doc.text(value, box.x + box.width - valueWidth, y + 1, { width: valueWidth, align: "right", lineBreak: false });
    if (r.secondary) {
      const room = valueWidth - valueSpan - 5;
      if (room > 12) {
        doc.font("body").fontSize(7).fillColor(FAINT).text(r.secondary, box.x + box.width - valueWidth, y + 1.5, {
          width: room,
          align: "right",
          lineBreak: false,
        });
      }
    }
  });

  return box.y + rows.length * rowHeight;
}

/**
 * A daily series with its rolling mean. Two series, so both are direct-labelled
 * at the right-hand end rather than needing a legend box.
 */
export function lineChart(
  doc: PDFKit.PDFDocument,
  box: Box,
  points: { label: string; value: number | null }[],
  trend: (number | null)[],
  { max: forcedMax, unit = "" }: { max?: number; unit?: string } = {},
) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  const max = forcedMax ?? Math.max(...values, 1);
  // Right-hand gutter holds the two direct labels, so no legend box is needed.
  const plot = { x: box.x, y: box.y + 8, width: box.width - 46, height: box.height - 22 };
  const at = (i: number) => plot.x + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plot.width);
  const scale = (v: number) => plot.y + plot.height - (v / max) * plot.height;

  // Recessive frame: baseline plus one gridline at the top of the scale.
  doc.moveTo(plot.x, plot.y).lineTo(plot.x + plot.width, plot.y).lineWidth(0.3).strokeColor(RULE).stroke();
  doc.moveTo(plot.x, plot.y + plot.height).lineTo(plot.x + plot.width, plot.y + plot.height).lineWidth(0.5).strokeColor(RULE).stroke();
  doc.font("body").fontSize(6).fillColor(FAINT).text(`${Math.round(max)}${unit}`, plot.x, plot.y - 7, { width: 40, lineBreak: false });

  // Daily: thin and pale, it's the texture behind the trend.
  doc.lineWidth(0.7).strokeColor(RUST).strokeOpacity(0.45);
  let drawing = false;
  points.forEach((p, i) => {
    if (p.value == null) { drawing = false; return; }
    const x = at(i), y = scale(p.value);
    if (!drawing) { doc.moveTo(x, y); drawing = true; } else doc.lineTo(x, y);
  });
  doc.stroke().strokeOpacity(1);

  // The 7-day mean: the line that's actually meant to be read.
  doc.lineWidth(1.6).strokeColor(RUST);
  drawing = false;
  trend.forEach((v, i) => {
    if (v == null) { drawing = false; return; }
    const x = at(i), y = scale(v);
    if (!drawing) { doc.moveTo(x, y); drawing = true; } else doc.lineTo(x, y);
  });
  doc.stroke();

  // Direct labels at the right end, in ink - identity without a legend box.
  const lastTrend = [...trend].reverse().find((v) => v != null);
  const lastDaily = [...points].reverse().find((p) => p.value != null)?.value;
  if (lastTrend != null) {
    doc.font("bold").fontSize(6.5).fillColor(INK).text("7-day mean", plot.x + plot.width + 4, scale(lastTrend) - 3, { width: 42, lineBreak: false });
  }
  if (lastDaily != null) {
    // Keep the two labels apart when the series end at nearly the same value.
    const trendY = lastTrend != null ? scale(lastTrend) : -99;
    const dailyY = scale(lastDaily);
    const y = Math.abs(dailyY - trendY) < 8 ? trendY + 9 : dailyY - 2;
    doc.font("body").fontSize(6).fillColor(FAINT).text("daily", plot.x + plot.width + 4, y, { width: 42, lineBreak: false });
  }

  // First and last date, so the axis has ends.
  doc.font("body").fontSize(6).fillColor(FAINT);
  doc.text(points[0]?.label ?? "", plot.x, plot.y + plot.height + 3, { width: 60, lineBreak: false });
  doc.text(points[points.length - 1]?.label ?? "", plot.x + plot.width - 60, plot.y + plot.height + 3, {
    width: 60,
    align: "right",
    lineBreak: false,
  });
}

/** A row of headline numbers. Returns the y below the row. */
export function statRow(
  doc: PDFKit.PDFDocument,
  box: Box,
  stats: { label: string; value: string; sub?: string }[],
) {
  const unit = box.width / stats.length;
  stats.forEach((s, i) => {
    const x = box.x + i * unit;
    doc.font("body").fontSize(7).fillColor(FAINT).text(s.label.toUpperCase(), x, box.y, { width: unit - 8, characterSpacing: 0.5, lineBreak: false });
    doc.font("bold").fontSize(13).fillColor(INK);
    doc.text(fit(doc, s.value, unit - 8), x, box.y + 10, { width: unit - 8, lineBreak: false });
    if (s.sub) {
      doc.font("body").fontSize(6.5).fillColor(FAINT);
      doc.text(fit(doc, s.sub, unit - 8), x, box.y + 25, { width: unit - 8, lineBreak: false });
    }
  });
  return box.y + 36;
}
