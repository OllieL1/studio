"use client";

import { clsx } from "@/lib/clsx";

/**
 * The down-only duration control: a slider and a minutes box, both capped at
 * what was tracked. Shared by the study and Sovrano log dialogs - the same
 * bar in both, with the thumb in the dialog's own accent.
 */
export function DurationTrim({
  tracked,
  value,
  onChange,
  accent = "rust",
}: {
  /** The ceiling: minutes actually tracked. */
  tracked: number;
  value: number;
  onChange: (minutes: number) => void;
  accent?: "rust" | "sov";
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={tracked}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={clsx("h-[18px] flex-1", accent === "sov" && "range-sov")}
        aria-label="Adjusted duration in minutes"
      />
      <div className="flex items-baseline gap-1 rounded-sm border border-n-200 px-2 py-1">
        <input
          type="number"
          min={0}
          max={tracked}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(tracked, Number(e.target.value) || 0)))}
          className="font-num w-12 bg-transparent text-right text-[14px] font-semibold text-n-900 outline-none"
        />
        <span className="text-[12px] text-n-400">min</span>
      </div>
    </div>
  );
}
