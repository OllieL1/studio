"use client";

import { useState } from "react";
import { fmtDuration, fmtDate, fmtDayDate } from "@/lib/dates";

/** Compact daily bars for the home page. Single series, one hue — magnitude
 *  over time needs no categorical colour. Hover gives the exact figure. */
export function Sparkbar({
  data,
  height = 44,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
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
              aria-label={`${fmtDayDate(new Date(d.label))}: ${fmtDuration(d.value)}`}
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
            {fmtDayDate(new Date(data[hover].label))}
            {" · "}
            {fmtDuration(data[hover].value)}
          </span>
        ) : (
          <span className="font-num">peak {fmtDuration(max)}</span>
        )}
        <span>Today</span>
      </div>
    </div>
  );
}
