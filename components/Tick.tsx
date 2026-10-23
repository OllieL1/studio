"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";

/** How long the tick's celebration runs - wait this long before taking a
 *  ticked row away, or the animation is cut off mid-burst. */
export const TICK_MS = 520;

/** Wait for the tick to finish before something leaves the list. */
export const afterTick = () => new Promise<void>((r) => setTimeout(r, TICK_MS));

/**
 * Done as the server says, or as the click just said until the server
 * agrees - for the row around a Tick, so its words strike through with the
 * tick rather than a beat after it.
 */
export function useShown(done: boolean): [boolean, (v: boolean) => void] {
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => setLocal(null), [done]);
  return [local ?? done, setLocal];
}

const SIZES = {
  sm: { box: 15, radius: 4, check: 9, hit: "h-[15px] w-[15px]", spark: 16 },
  md: { box: 18, radius: 5, check: 11, hit: "h-[18px] w-[18px]", spark: 20 },
} as const;

const SPARKS = [0, 60, 120, 180, 240, 300];

/**
 * The one tick, everywhere in Studio and Livio.
 *
 * It answers the click straight away - the server catches up behind it - and
 * ticking (never unticking) gets the full moment: press, pop, the tick drawn
 * in, a ring and sparks. Any change from not done to done celebrates, so a
 * page that ticks from the keyboard just passes `done` and gets it too. Pair it with `.tick-text` on the words it ticks off,
 * with `data-done` set the same, for the line that sweeps across them.
 */
export function Tick({
  done,
  onToggle,
  label,
  size = "md",
  tone = "ok",
  partial = false,
  disabled = false,
  dashed = false,
  className,
  id,
}: {
  done: boolean;
  onToggle: () => void;
  label: string;
  size?: keyof typeof SIZES;
  /** ok is done's colour; rust is for the odd thing that's the accent's (revision). */
  tone?: "ok" | "rust";
  /** Some of it ticked (a task's checklist) - a small square inside. */
  partial?: boolean;
  disabled?: boolean;
  /** An outline that reads as optional, before it's ticked. */
  dashed?: boolean;
  className?: string;
  /** So a <label htmlFor> on the words can tick it too. */
  id?: string;
}) {
  // What the click said, until the server agrees.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [burst, setBurst] = useState(0);
  useEffect(() => setOptimistic(null), [done]);

  const shown = optimistic ?? done;
  const s = SIZES[size];

  // Celebrate each time it becomes done - but not for things already done
  // when the page arrived.
  const was = useRef(shown);
  useLayoutEffect(() => {
    if (shown && !was.current) setBurst((n) => n + 1);
    was.current = shown;
  }, [shown]);

  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        setOptimistic(!shown);
        onToggle();
      }}
      aria-label={label}
      aria-pressed={shown}
      data-done={shown}
      data-celebrate={shown && burst > 0}
      className={clsx("tick", s.hit, className)}
      style={{ ["--tick" as string]: tone === "rust" ? "var(--color-rust-500)" : "var(--color-ok)" }}
    >
      <span
        key={burst}
        className={clsx("tick-box", dashed && !shown && "border-dashed")}
        style={{ width: s.box, height: s.box, borderRadius: s.radius, ...((dashed || partial) && !shown ? { borderColor: "var(--tick)" } : {}) }}
      >
        {shown ? (
          <svg width={s.check} height={s.check} viewBox="0 0 10 10" fill="none" aria-hidden>
            <path className="tick-check" d="M1.5 5.2 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          partial && <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: "var(--tick)" }} />
        )}
      </span>
      {shown && burst > 0 && (
        <span key={`b${burst}`} className="tick-burst" aria-hidden>
          <span className="tick-ring" style={{ borderRadius: s.radius + 2 }} />
          {SPARKS.map((a) => (
            <span key={a} className="tick-spark" style={{ ["--a" as string]: `${a + 30}deg`, ["--r" as string]: `${s.spark}px` }} />
          ))}
        </span>
      )}
    </button>
  );
}
