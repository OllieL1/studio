"use client";

import { STUDY_LOCATIONS, type StudyLocation } from "@/lib/types";
import { clsx } from "@/lib/clsx";

/**
 * Where a session happened. One row of chips; picking "Other" opens a small
 * field for the actual place, so the stats keep a single Other bucket while
 * the session still says where it really was.
 */
export function LocationPicker({
  value,
  note,
  onChange,
  compact = false,
}: {
  value: StudyLocation | null;
  note: string;
  onChange: (value: StudyLocation | null, note: string) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {STUDY_LOCATIONS.map((l) => {
          const on = value === l.key;
          return (
            <button
              key={l.key}
              type="button"
              // Tapping the chosen one again clears it - a session can have no location.
              onClick={() => onChange(on ? null : l.key, on ? "" : note)}
              aria-pressed={on}
              className={clsx(
                "rounded-full border font-medium transition-all duration-[180ms]",
                compact ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[12.5px]",
                on
                  ? "border-transparent bg-n-800 text-white"
                  : "border-n-200 text-n-600 hover:bg-n-50",
              )}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {value === "other" && (
        <input
          value={note}
          onChange={(e) => onChange("other", e.target.value)}
          maxLength={60}
          placeholder="Where? e.g. Train, Mum's"
          aria-label="Where did you study?"
          className="animate-fade-in mt-2 h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[13px] text-n-800 outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400"
        />
      )}
    </div>
  );
}
