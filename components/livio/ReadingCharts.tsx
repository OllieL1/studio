"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";

/**
 * Column charts for the reading stats: one series, one hue (Livio's accent),
 * so no legend - the title says what it is. Columns are capped at 24px with a
 * 4px rounded top and a square foot on the baseline; only the tallest is
 * labelled, and every column has a hover tooltip wider than the column itself.
 */
export function Columns({
  title,
  data,
  label,
  tooltip,
  empty,
}: {
  title: string;
  data: { key: string; value: number }[];
  /** Under each column. */
  label: (key: string, i: number) => string;
  tooltip: (key: string, value: number) => string;
  empty: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const height = 120;
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <figure className="min-w-0">
      <figcaption className="text-[12px] font-semibold text-n-700">{title}</figcaption>
      {total === 0 ? (
        <p className="mt-3 flex h-[148px] items-center justify-center rounded-md bg-n-50 text-[12px] text-n-400">{empty}</p>
      ) : (
        <div className="relative mt-3">
          <div className="flex h-[120px] items-end border-b border-n-200" role="list">
            {data.map((d, i) => {
              const h = (d.value / max) * (height - 18);
              return (
                <div
                  key={d.key}
                  role="listitem"
                  aria-label={tooltip(d.key, d.value)}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  className="relative flex h-full flex-1 items-end justify-center"
                >
                  {i === peak && d.value > 0 && (
                    <span className="absolute font-num text-[10.5px] text-n-600" style={{ bottom: h + 3 }}>{d.value}</span>
                  )}
                  <span
                    className={clsx("w-full max-w-[24px] rounded-t-[4px] transition-opacity", hover !== null && hover !== i && "opacity-50")}
                    style={{ height: d.value ? Math.max(3, h) : 0, background: "var(--color-rust-500)" }}
                  />
                  {hover === i && (
                    <span className="animate-fade-in pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border border-n-100 bg-n-0 px-2 py-1 text-[11.5px] text-n-700 shadow-[var(--shadow-pop)]">
                      {tooltip(d.key, d.value)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex">
            {data.map((d, i) => (
              <span key={d.key} className="flex-1 text-center font-num text-[10px] text-n-400">{label(d.key, i)}</span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
