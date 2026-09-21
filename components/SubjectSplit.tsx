"use client";

import { fmtDuration } from "@/lib/dates";
import { resolveSplit, SPLIT_MODE_LABEL, type SplitMode } from "@/lib/split";
import { clsx } from "@/lib/clsx";
import { cssColour } from "@/lib/palette";

type C = { id: string; shortName: string; name: string; colour: string };

/**
 * How a session's time divides between the subjects it covered.
 *
 * Only appears once two or more subjects are selected — a single subject has
 * nothing to split. Three modes, and whichever you pick, the result is shown
 * as real minutes so there's never any doubt what got recorded.
 *
 * Weights are held as raw numbers and apportioned by lib/split.ts, so the
 * slices always sum to the session total no matter what you type.
 */
export function SubjectSplit({
  courses,
  selected,
  totalMinutes,
  mode,
  weights,
  onModeChange,
  onWeightChange,
}: {
  courses: C[];
  selected: string[];
  totalMinutes: number;
  mode: SplitMode;
  weights: Record<string, number>;
  onModeChange: (m: SplitMode) => void;
  onWeightChange: (courseId: string, value: number) => void;
}) {
  if (selected.length < 2) return null;

  const order = selected;
  const w = order.map((id) => weights[id] ?? 0);
  const resolved = resolveSplit(mode, totalMinutes, w);
  const pct = (m: number) => (totalMinutes > 0 ? (m / totalMinutes) * 100 : 0);

  return (
    <div className="rounded-sm border border-n-100 bg-n-25 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-500">
          Split
        </span>
        <div className="flex items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5">
          {(["equal", "percent", "minutes"] as SplitMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              aria-pressed={mode === m}
              className={clsx(
                "rounded-[6px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-[120ms]",
                mode === m ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50 hover:text-n-700",
              )}
            >
              {SPLIT_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {/* A single stacked bar of the whole session — the quickest read. */}
      <div className="mb-3 flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        {order.map((id, i) => {
          const c = courses.find((x) => x.id === id);
          return (
            <span
              key={id}
              className="bar-fill h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${Math.max(0, pct(resolved[i]))}%`,
                background: cssColour(c?.colour) || "var(--color-n-300)",
              }}
              title={`${c?.shortName}: ${fmtDuration(resolved[i])}`}
            />
          );
        })}
      </div>

      <div className="space-y-2">
        {order.map((id, i) => {
          const c = courses.find((x) => x.id === id);
          if (!c) return null;
          return (
            <div key={id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: cssColour(c.colour) }}
              />
              <span className="w-[86px] shrink-0 truncate text-[12px] font-medium text-n-700">
                {c.shortName}
              </span>

              {mode === "equal" ? (
                <span className="flex-1 text-[11.5px] text-n-400">
                  even share
                </span>
              ) : (
                <input
                  type="range"
                  min={0}
                  max={mode === "percent" ? 100 : totalMinutes}
                  value={Math.round(weights[id] ?? 0)}
                  onChange={(e) => onWeightChange(id, Number(e.target.value))}
                  className="h-[18px] flex-1"
                  aria-label={`${c.name} share`}
                />
              )}

              {mode !== "equal" && (
                <div className="flex shrink-0 items-baseline gap-0.5 rounded-sm border border-n-200 bg-n-0 px-1.5 py-0.5">
                  <input
                    type="number"
                    min={0}
                    max={mode === "percent" ? 100 : totalMinutes}
                    value={Math.round(weights[id] ?? 0)}
                    onChange={(e) => onWeightChange(id, Number(e.target.value) || 0)}
                    className="font-num w-9 bg-transparent text-right text-[12px] font-semibold text-n-800 outline-none"
                    aria-label={`${c.name} ${mode === "percent" ? "percentage" : "minutes"}`}
                  />
                  <span className="text-[10.5px] text-n-400">
                    {mode === "percent" ? "%" : "m"}
                  </span>
                </div>
              )}

              {/* The resolved figure — what actually gets recorded. */}
              <span className="font-num w-14 shrink-0 text-right text-[12px] font-semibold text-n-800">
                {fmtDuration(resolved[i])}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2.5 text-[10.5px] leading-4 text-n-400">
        {mode === "equal"
          ? `${fmtDuration(totalMinutes)} shared evenly.`
          : mode === "percent"
            ? "Proportional - these needn't add to exactly 100."
            : "Scaled to fit the session if they don't add up."}{" "}
        Recorded minutes always total {fmtDuration(totalMinutes)}.
      </p>
    </div>
  );
}
