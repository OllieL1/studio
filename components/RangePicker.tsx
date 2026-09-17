"use client";

import Link from "next/link";
import { clsx } from "@/lib/clsx";

const RANGES = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
  { key: "all", label: "All" },
];

/** Time-range filter. One row, above the charts, per the chart conventions. */
export function RangePicker({ current }: { current: string }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={r.key === "all" ? "/stats" : `/stats?range=${r.key}`}
          scroll={false}
          className={clsx(
            "rounded-[6px] px-2.5 py-1 text-[12px] font-semibold transition-colors duration-[120ms]",
            current === r.key
              ? "bg-rust-500 text-white"
              : "text-n-500 hover:bg-n-50 hover:text-n-700",
          )}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}
