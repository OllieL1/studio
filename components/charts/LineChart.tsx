"use client";

import { useRef, useState } from "react";
import { formatValue, type FormatKey } from "@/lib/format";

export type Point = { label: string; value: number | null };

/**
 * Single-series line with a crosshair.
 *
 * Used for the focus trend. Gaps (days with no session) break the line rather
 * than being drawn as zero — a day you didn't study isn't a day of 0% focus.
 */
export function LineChart({
  points,
  trend,
  height = 170,
  min = 0,
  max = 100,
  format = "percent",
  emptyLabel = "No sessions logged yet",
}: {
  points: Point[];
  /** Optional smoothed series drawn behind the raw one. */
  trend?: (number | null)[];
  height?: number;
  min?: number;
  max?: number;
  /** A key rather than a function — these props cross the RSC boundary. */
  format?: FormatKey;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const real = points.filter((p) => p.value != null);
  if (real.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-n-200 text-[12.5px] text-n-400"
        style={{ height: height + 24 }}
      >
        {emptyLabel}
      </div>
    );
  }

  const W = 1000;
  const H = height;
  const pad = { t: 8, b: 8 };
  const innerH = H - pad.t - pad.b;

  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => pad.t + innerH - ((v - min) / (max - min)) * innerH;

  // Break the path wherever data is missing, so gaps read as gaps.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
    } else {
      current.push(`${current.length === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`);
    }
  });
  if (current.length > 1) segments.push(current.join(" "));

  const trendPath = trend
    ? trend
        .map((v, i) => (v == null ? null : `${x(i).toFixed(1)} ${y(v).toFixed(1)}`))
        .filter(Boolean)
        .map((s, i) => `${i === 0 ? "M" : "L"} ${s}`)
        .join(" ")
    : null;

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(frac * (points.length - 1)))));
  };

  const hovered = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="relative"
        style={{ height: H }}
      >
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Focus trend">
          {[min, (min + max) / 2, max].map((t) => (
            <line
              key={t} x1={0} x2={W} y1={y(t)} y2={y(t)}
              stroke="var(--color-n-100)" strokeWidth={1} vectorEffect="non-scaling-stroke"
            />
          ))}

          {trendPath && (
            <path
              d={trendPath} fill="none" stroke="var(--color-rust-200)"
              strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {segments.map((d, i) => (
            <path
              key={i} d={d} fill="none" stroke="var(--color-rust-500)"
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {hover != null && points[hover].value != null && (
            <line
              x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b}
              stroke="var(--color-n-300)" strokeWidth={1} vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Markers in DOM units so they stay circular despite the stretched viewBox. */}
        {points.map((p, i) =>
          p.value == null ? null : (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-[120ms]"
              style={{
                left: `${(x(i) / W) * 100}%`,
                top: y(p.value),
                width: hover === i ? 10 : 6,
                height: hover === i ? 10 : 6,
                background: "var(--color-rust-500)",
                boxShadow: "0 0 0 2px var(--color-n-0)",
              }}
            />
          ),
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-n-400">
        <span>{points[0]?.label}</span>
        {hovered && hovered.value != null ? (
          <span className="font-num font-medium text-n-700">
            {hovered.label} · {formatValue(format, hovered.value)}
          </span>
        ) : (
          <span className="font-num">
            {formatValue(format, real.reduce((s, p) => s + (p.value ?? 0), 0) / real.length)} avg
          </span>
        )}
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
