"use client";

import type { CalendarItem } from "@/lib/calendar";
import { fmtHM } from "@/lib/dates";
import { clsx } from "@/lib/clsx";

/**
 * How each kind of calendar item is drawn. Shared by month and week views so
 * a deadline looks like a deadline everywhere.
 *
 * Text always stays in ink tokens — never white on a course colour, because
 * several course hues (ochre, plum) fail contrast with white text. Identity
 * comes from the rail and tint; blocked items add weight and a hatch.
 */

export const NEUTRAL = "var(--color-n-500)";

/** A course colour mixed into white — a tint that keeps dark text readable. */
export function tint(colour: string | null, pct: number): string {
  return `color-mix(in oklab, ${colour ?? NEUTRAL} ${pct}%, var(--color-n-0))`;
}

/** Diagonal hatch in a course colour, used to mark blocked-out days. */
export function hatch(colour: string | null, pct = 18): string {
  const c = `color-mix(in oklab, ${colour ?? NEUTRAL} ${pct}%, transparent)`;
  return `repeating-linear-gradient(135deg, ${c} 0 5px, transparent 5px 11px)`;
}

export function timeLabel(item: CalendarItem): string | null {
  if (item.source === "deadline") {
    const d = new Date(item.start);
    // 23:59 means "sometime that day" — no time worth showing.
    if (d.getHours() === 23 && d.getMinutes() === 59) return null;
    return fmtHM(d);
  }
  if (item.allDay) return null;
  return fmtHM(new Date(item.start));
}

export function chipStyle(item: CalendarItem): { className: string; style: React.CSSProperties } {
  const c = item.colour;

  if (item.source === "google") {
    return {
      className: "border-l-[3px] border-info bg-info-soft text-n-700",
      style: {},
    };
  }
  if (item.source === "meeting") {
    // Filled in the course colour: meetings are the fixed points of the project.
    return {
      className: "border-l-[3px] font-semibold text-n-900",
      style: { borderColor: c ?? "var(--color-rust-600)", background: tint(c ?? "var(--color-rust-600)", 28) },
    };
  }
  if (item.source === "event") {
    return {
      className: "border text-n-800",
      style: { borderColor: c ?? "var(--color-n-600)", background: "var(--color-n-0)" },
    };
  }
  if (item.source === "class") {
    return {
      className: "border-l-[3px] text-n-700",
      style: { borderColor: c ?? NEUTRAL, background: tint(c, 10) },
    };
  }
  // Deadlines
  if (item.blocked) {
    return {
      className: "border-l-[4px] font-semibold text-n-900",
      style: {
        borderColor: c ?? NEUTRAL,
        backgroundColor: tint(c, 24),
        backgroundImage: hatch(c, 22),
      },
    };
  }
  return {
    className: "border-l-[3px] text-n-800",
    style: { borderColor: c ?? NEUTRAL, background: tint(c, 13) },
  };
}

/** Single-line chip, used in the month grid and the week view's all-day row. */
export function Chip({
  item,
  onClick,
  compact = false,
}: {
  item: CalendarItem;
  onClick: (item: CalendarItem, rect: DOMRect) => void;
  compact?: boolean;
}) {
  const { className, style } = chipStyle(item);
  const time = timeLabel(item);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(item, e.currentTarget.getBoundingClientRect());
      }}
      title={item.title}
      className={clsx(
        "flex w-full min-w-0 items-center gap-1 rounded-[4px] text-left leading-4 transition-[filter] duration-[120ms] hover:brightness-[0.96]",
        compact ? "px-1 py-[1px] text-[10.5px]" : "px-1.5 py-[3px] text-[11px]",
        item.done && "opacity-50",
        className,
      )}
      style={style}
    >
      {item.blocked && (
        <span className="shrink-0 rounded-[3px] bg-[var(--scrim-strong)] px-1 text-[9px] font-bold uppercase tracking-[0.04em] text-white">
          {item.kind === "EXAM" ? "Exam" : `${item.gradeWeight}%`}
        </span>
      )}
      {time && <span className="font-num shrink-0 text-[10px] text-n-500">{time}</span>}
      <span className={clsx("truncate", item.done && "line-through")}>{item.title}</span>
      {item.onGoogle && item.source !== "google" && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-label="On Google Calendar" className="ml-auto shrink-0 text-n-400">
          <path d="M2 5.2 4 7.2 8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
