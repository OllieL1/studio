"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { formatValue, type FormatKey } from "@/lib/format";

export type Bar = {
  label: string;
  value: number;
  /** Optional secondary figure shown in the tooltip, e.g. focus %. */
  secondary?: string;
  /** Marks a bar as the best/worst, for direct labelling. */
  note?: "best" | "worst";
};

/**
 * Vertical bar chart, single series, one hue.
 *
 * Per the chart conventions: no second axis, recessive grid, 4px rounded tops
 * anchored flat to the baseline, a 2px gap between bars, and a hover tooltip
 * with a hit target taller than the mark.
 */
export function BarChart({
  bars,
  height = 160,
  format = "count",
  emptyLabel = "No data yet",
  highlight,
  domainMax,
  showValues = false,
}: {
  bars: Bar[];
  height?: number;
  /** A key rather than a function — these props cross the RSC boundary. */
  format?: FormatKey;
  emptyLabel?: string;
  /** "max" emphasises the largest bar; "note" uses each bar's own note flag. */
  highlight?: "max" | "note";
  /** Fix the top of the scale — e.g. 100 for percentages, so 77% and 79%
   *  aren't both drawn as "almost full". Defaults to the largest value. */
  domainMax?: number;
  /** Write each bar's value above it. For a handful of bars, where hovering
   *  to read three numbers would be silly. */
  showValues?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const dataMax = Math.max(...bars.map((b) => b.value), 0);
  const max = domainMax ?? dataMax;
  const fmt = (v: number) => formatValue(format, v);
  const isHighlighted = (b: Bar) =>
    highlight === "max" ? b.value === dataMax && dataMax > 0 : highlight === "note" ? b.note === "best" : false;

  if (dataMax <= 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-n-200 text-[12.5px] text-n-400"
        style={{ height: height + 28 }}
      >
        {emptyLabel}
      </div>
    );
  }

  // Three recessive gridlines — enough to read level, few enough to recede.
  const ticks = [0.5, 1].map((f) => f * max);

  return (
    <div className="relative">
      <div className="relative" style={{ height }}>
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute inset-x-0 border-t border-n-100"
            style={{ bottom: (t / max) * height }}
          >
            <span className="font-num absolute -top-2 right-0 bg-n-0 pl-1 text-[10px] text-n-400">
              {fmt(t)}
            </span>
          </div>
        ))}

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {bars.map((b, i) => {
            const h = b.value === 0 ? 0 : Math.max(2, (b.value / max) * height);
            const active = hover === i;
            const isHi = isHighlighted(b);
            return (
              <button
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex-1 outline-none"
                style={{ height }}
                aria-label={`${b.label}: ${fmt(b.value)}`}
              >
                {showValues && b.value > 0 && (
                  <span
                    className="font-num absolute left-0 right-0 text-center text-[11px] font-semibold text-n-700"
                    style={{ bottom: h + 3 }}
                  >
                    {fmt(b.value)}
                  </span>
                )}
                <span
                  className="absolute bottom-0 left-1/2 w-full max-w-[56px] -translate-x-1/2 rounded-t-[4px] transition-colors duration-[120ms]"
                  style={{
                    height: h,
                    background: active
                      ? "var(--color-rust-600)"
                      : isHi
                        ? "var(--color-rust-500)"
                        : "var(--color-rust-300)",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-[2px]">
        {bars.map((b, i) => (
          <span
            key={i}
            className={clsx(
              "flex-1 truncate text-center text-[10px] transition-colors duration-[120ms]",
              hover === i ? "font-semibold text-n-700" : "text-n-400",
            )}
          >
            {b.label}
          </span>
        ))}
      </div>

      {hover != null && (
        <div className="animate-fade-in pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[11.5px] shadow-[var(--shadow-pop)]">
          <span className="font-semibold text-n-800">{bars[hover].label}</span>
          <span className="font-num ml-2 text-n-600">{fmt(bars[hover].value)}</span>
          {bars[hover].secondary && (
            <span className="ml-2 text-n-400">{bars[hover].secondary}</span>
          )}
        </div>
      )}
    </div>
  );
}
