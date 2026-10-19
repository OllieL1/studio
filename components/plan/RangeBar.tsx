"use client";

import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, parseLocalDate, startOfWeek } from "@/lib/dates";
import { clampDays, MAX_DAYS, rangeHref, rangeLabel } from "@/lib/plan";
import { clsx } from "@/lib/clsx";

/** This week / Next week / Custom, plus stepping the range back and forward. */
export function RangeBar({ from, days, preset }: { from: string; days: number; preset: "this" | "next" | "custom" }) {
  const router = useRouter();
  const [custom, setCustom] = useState(false);
  const [start, setStart] = useState(from);
  const [count, setCount] = useState(days);
  const popRef = useRef<HTMLDivElement>(null);

  const go = (d: Date, n: number) => router.push(rangeHref(d, n) as Route);
  const thisWeek = startOfWeek(new Date());

  useEffect(() => { setStart(from); setCount(days); }, [from, days]);

  useEffect(() => {
    if (!custom) return;
    const onDown = (e: MouseEvent) => { if (!popRef.current?.contains(e.target as Node)) setCustom(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCustom(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [custom]);

  const seg = (on: boolean) =>
    clsx(
      "h-8 rounded-[8px] px-3 text-[12.5px] font-semibold transition-colors duration-[120ms]",
      on ? "bg-n-0 text-n-900 shadow-[0_1px_2px_rgb(26_23_20/0.08)]" : "text-n-500 hover:text-n-800",
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5">
        <StepButton dir={-1} onClick={() => go(addDays(parseLocalDate(from), -days), days)} label={`Back ${days} days`} />
        <StepButton dir={1} onClick={() => go(addDays(parseLocalDate(from), days), days)} label={`Forward ${days} days`} />
      </div>
      <div role="group" aria-label="Range" className="relative flex items-center gap-0.5 rounded-[10px] bg-n-100 p-0.5">
        <button className={seg(preset === "this")} aria-pressed={preset === "this"} onClick={() => go(thisWeek, 7)}>This week</button>
        <button className={seg(preset === "next")} aria-pressed={preset === "next"} onClick={() => go(addDays(thisWeek, 7), 7)}>Next week</button>
        <button className={seg(preset === "custom")} aria-pressed={preset === "custom"} aria-expanded={custom} onClick={() => setCustom((v) => !v)}>
          Custom…
        </button>

        {custom && (
          <div
            ref={popRef}
            role="dialog"
            aria-label="Custom range"
            className="animate-scale-in absolute right-0 top-[calc(100%+6px)] z-30 w-[260px] rounded-[12px] border border-n-200 bg-n-0 p-3.5 shadow-[var(--shadow-pop)]"
          >
            <form
              onSubmit={(e) => { e.preventDefault(); setCustom(false); go(parseLocalDate(start), clampDays(count)); }}
              className="space-y-3"
            >
              <label className="block">
                <span className="eyebrow">Starting</span>
                <input
                  type="date" required autoFocus value={start} onChange={(e) => setStart(e.target.value)}
                  className="font-num mt-1 h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[13px] text-n-800 outline-none focus:border-rust-400"
                />
              </label>
              <div>
                <span className="eyebrow">For</span>
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" aria-label="Fewer days" onClick={() => setCount((n) => clampDays(n - 1))} className="h-9 w-9 rounded-sm border border-n-200 text-[15px] text-n-600 hover:bg-n-50">−</button>
                  <input
                    type="number" min={1} max={MAX_DAYS} value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    aria-label="Number of days"
                    className="font-num h-9 w-14 rounded-sm border border-n-200 bg-n-0 text-center text-[13px] text-n-800 outline-none focus:border-rust-400"
                  />
                  <button type="button" aria-label="More days" onClick={() => setCount((n) => clampDays(n + 1))} className="h-9 w-9 rounded-sm border border-n-200 text-[15px] text-n-600 hover:bg-n-50">+</button>
                  <span className="text-[12.5px] text-n-500">day{count === 1 ? "" : "s"}</span>
                </div>
              </div>
              <button type="submit" className="h-9 w-full rounded-[10px] bg-rust-500 text-[13px] font-semibold text-white hover:bg-rust-600">
                Show {start ? rangeLabel(parseLocalDate(start), clampDays(count)) : "range"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function StepButton({ dir, onClick, label }: { dir: -1 | 1; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-md text-n-500 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-800">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d={dir === -1 ? "M7.5 2.5L4 6l3.5 3.5" : "M4.5 2.5L8 6l-3.5 3.5"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
