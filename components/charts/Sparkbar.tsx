"use client";

import { useState } from "react";
import { fmtDuration, fmtDate, fmtDayDate } from "@/lib/dates";

/** Compact daily bars for the home page. Single series, one hue — magnitude
 *  over time needs no categorical colour. Hover gives the exact figure. */
export function Sparkbar({
  data,
  height = 44,
  unit = "duration",
  week = false,
}: {
  data: { label: string; value: number }[];
  height?: number;
  /** What a value is: minutes (the default) or a count of commits. */
  unit?: "duration" | "commits";
  /** Each bar is a week starting on its label's date. */
  week?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const fmt = (v: number) => (unit === "commits" ? `${v} commit${v === 1 ? "" : "s"}` : fmtDuration(v));
  const when = (label: string) => `${week ? "w/b " : ""}${fmtDayDate(new Date(label))}`;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((d, i) => {
          const h = d.value === 0 ? 2 : Math.max(3, (d.value / max) * height);
          const active = hover === i;
          return (
            <button
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="group relative flex-1 outline-none"
              style={{ height }}
              aria-label={`${when(d.label)}: ${fmt(d.value)}`}
            >
              {/* Hit target spans the full height; the mark is only the bar. */}
              <span
                className="absolute bottom-0 left-0 right-0 rounded-t-[3px] transition-colors duration-[120ms]"
                style={{
                  height: h,
                  background:
                    d.value === 0
                      ? "var(--color-n-200)"
                      : active
                        ? "var(--color-rust-600)"
                        : "var(--color-rust-400)",
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-n-400">
        <span>{fmtDate(new Date(data[0]?.label))}</span>
        {hover != null ? (
          <span className="font-num font-medium text-n-700">
            {when(data[hover].label)}
            {" · "}
            {fmt(data[hover].value)}
          </span>
        ) : (
          <span className="font-num">peak {fmt(max)}</span>
        )}
        <span>{week ? "This week" : "Today"}</span>
      </div>
    </div>
  );
}
