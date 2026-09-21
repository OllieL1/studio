"use client";

import { useMemo } from "react";
import { DAY_SHORT, isSameDay, toISODate, fmtDate } from "@/lib/dates";
import { itemsByDay, viewRange, type CalendarItem } from "@/lib/calendar";
import { clsx } from "@/lib/clsx";
import { Chip, hatch, tint } from "./chips";
import { cssColour } from "@/lib/palette";

/** Chips shown per day before collapsing into "+N more". Classes don't count. */
const MAX_CHIPS = 3;

/**
 * Six-week month grid.
 *
 * Classes are collapsed into a row of course-coloured dots rather than chips —
 * a Tuesday with five lectures would otherwise bury the one deadline that
 * actually matters. The week view shows them in full.
 */
export function MonthGrid({
  anchor,
  items,
  onDayOpen,
  onNewEvent,
  onItem,
}: {
  anchor: Date;
  items: CalendarItem[];
  onDayOpen: (d: Date) => void;
  onNewEvent: (d: Date) => void;
  onItem: (item: CalendarItem, rect: DOMRect) => void;
}) {
  const { days } = viewRange("month", anchor);
  const byDay = useMemo(() => itemsByDay(items), [items]);
  const today = new Date();
  const month = anchor.getMonth();

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-n-100 bg-n-25">
        {DAY_SHORT.map((d, i) => (
          <div
            key={d}
            className={clsx(
              "px-2 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em]",
              i >= 5 ? "text-n-400" : "text-n-500",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const key = toISODate(day);
          const list = byDay.get(key) ?? [];
          const classes = list.filter((i) => i.source === "class");
          const others = list.filter((i) => i.source !== "class");
          const shown = others.slice(0, MAX_CHIPS);
          const hidden = others.length - shown.length;
          const inMonth = day.getMonth() === month;
          const isToday = isSameDay(day, today);
          const blocked = others.find((i) => i.blocked);
          const weekend = idx % 7 >= 5;

          return (
            <div
              key={key}
              onClick={() => onNewEvent(day)}
              className={clsx(
                "group relative flex h-[128px] min-w-0 cursor-cell flex-col gap-[3px] border-b border-r border-n-100 p-1.5 transition-colors duration-[120ms] hover:bg-n-25",
                idx % 7 === 6 && "border-r-0",
                idx >= 35 && "border-b-0",
                !inMonth && "bg-n-25/70",
                weekend && inMonth && "bg-n-25/40",
              )}
              style={
                blocked
                  ? { backgroundColor: tint(blocked.colour, 5), backgroundImage: hatch(blocked.colour, 10) }
                  : undefined
              }
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={(e) => { e.stopPropagation(); onDayOpen(day); }}
                  aria-label={`Open week of ${day.toDateString()}`}
                  className={clsx(
                    "font-num flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold transition-colors duration-[120ms]",
                    isToday
                      ? "bg-rust-500 text-white"
                      : inMonth
                        ? "text-n-800 hover:bg-n-100"
                        : "text-n-300 hover:bg-n-100",
                  )}
                >
                  {day.getDate() === 1
                    ? fmtDate(day)
                    : day.getDate()}
                </button>

                {classes.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDayOpen(day); }}
                    title={classes.map((c) => `${c.courseShort ?? ""} ${c.title}`.trim()).join("\n")}
                    className="flex items-center gap-[3px] rounded-full px-1 py-0.5 transition-colors duration-[120ms] hover:bg-n-100"
                    aria-label={`${classes.length} classes - open week`}
                  >
                    {classes.slice(0, 5).map((c) => (
                      <span
                        key={c.id}
                        aria-hidden
                        className={clsx("h-[6px] w-[6px] rounded-full", c.done && "opacity-40")}
                        style={{ background: cssColour(c.colour) || "var(--color-n-400)" }}
                      />
                    ))}
                    {classes.length > 5 && (
                      <span className="font-num text-[9.5px] text-n-400">+{classes.length - 5}</span>
                    )}
                  </button>
                )}
              </div>

              <div className="flex min-h-0 flex-col gap-[3px]">
                {shown.map((item) => (
                  <Chip key={item.id} item={item} onClick={onItem} compact />
                ))}
                {hidden > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDayOpen(day); }}
                    className="rounded px-1 text-left text-[10.5px] font-semibold text-n-500 hover:bg-n-100 hover:text-n-800"
                  >
                    +{hidden} more
                  </button>
                )}
              </div>

              <span
                aria-hidden
                className="pointer-events-none absolute bottom-1 right-1.5 text-[10px] font-medium text-n-300 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100"
              >
                + event
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
