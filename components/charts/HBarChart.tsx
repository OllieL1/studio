"use client";

import { useState } from "react";
import { formatValue, type FormatKey } from "@/lib/format";

/**
 * Horizontal bars, direct-labelled.
 *
 * This is the form for per-subject breakdowns: the course name sits on the
 * bar itself, so identity comes from the label and colour only reinforces it.
 */
export function HBarChart({
  rows,
  format,
  emptyLabel = "No data yet",
  domainMax,
}: {
  rows: { label: string; value: number; colour: string; secondary?: string }[];
  /** A key rather than a function — these props cross the RSC boundary. */
  format: FormatKey;
  emptyLabel?: string;
  /** Fix the scale's top — 100 for percentages — instead of the largest value. */
  domainMax?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const dataMax = Math.max(...rows.map((r) => r.value), 0);
  const max = domainMax ?? dataMax;
  // The identity dot only earns its place when rows are different colours
  // (courses). When every bar shares one hue, the label already says it all.
  const showDots = new Set(rows.map((r) => r.colour)).size > 1;

  if (dataMax <= 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-n-200 text-[12.5px] text-n-400">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div
          key={r.label}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          className="group"
        >
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-n-700">
              {showDots && (
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: r.colour }}
                />
              )}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="font-num shrink-0 text-[12px] text-n-600">
              {formatValue(format, r.value)}
              {r.secondary && <span className="ml-1.5 text-n-400">{r.secondary}</span>}
            </span>
          </div>
          <div className="h-[7px] w-full overflow-hidden rounded-full bg-n-100">
            <div
              className="bar-fill h-full rounded-full transition-opacity duration-[120ms]"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: r.colour,
                opacity: hover === null || hover === i ? 1 : 0.45,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
