"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DAY_SHORT, isSameDay, toISODate, fmtHM } from "@/lib/dates";
import { hourWindow, itemsByDay, layoutDay, viewRange, type CalendarItem } from "@/lib/calendar";
import { clsx } from "@/lib/clsx";
import { Chip, chipStyle, hatch, tint } from "./chips";

const HOUR_PX = 52;
const MAX_ALLDAY = 3;

/**
 * Week view: an all-day row for deadlines and all-day events, over an hour
 * grid where classes and meetings sit at their real times. Overlapping items
 * share the column side by side (lib/calendar.ts → layoutDay), so nothing is
 * ever hidden behind anything else.
 */
export function WeekGrid({
  anchor,
  items,
  onNewEvent,
  onItem,
}: {
  anchor: Date;
  items: CalendarItem[];
  onNewEvent: (d: Date, minutes: number) => void;
  onItem: (item: CalendarItem, rect: DOMRect) => void;
}) {
  const { days } = viewRange("week", anchor);
  const byDay = useMemo(() => itemsByDay(items), [items]);
  const { from, to } = useMemo(() => hourWindow(items, days), [items, days]);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const scrollRef = useRef<HTMLDivElement>(null);
  // null until mounted: the server's "now" and the browser's differ by the
  // render gap, and a now-line positioned on the server would mismatch on
  // hydration. It appears on the client only, then keeps moving.
  const [now, setNow] = useState<Date | null>(null);
  const [expandAllDay, setExpandAllDay] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Start scrolled near the current hour when this week includes today.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const showsToday = days.some((d) => isSameDay(d, new Date()));
    const hour = showsToday ? Math.max(from, new Date().getHours() - 1) : from;
    el.scrollTop = (hour - from) * HOUR_PX;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.getTime(), from]);

  const allDayByDay = days.map((d) => (byDay.get(toISODate(d)) ?? []).filter((i) => i.allDay));
  const maxAllDay = Math.max(0, ...allDayByDay.map((l) => l.length));
  const allDayOverflow = maxAllDay > MAX_ALLDAY;

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* ── Day headers ────────────────────────────────────────────── */}
          <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-n-100 bg-n-25">
            <div />
            {days.map((d, i) => {
              const isToday = isSameDay(d, now ?? new Date());
              return (
                <div key={i} className="border-l border-n-100 px-2 py-2">
                  <div className={clsx(
                    "text-[10.5px] font-semibold uppercase tracking-[0.08em]",
                    isToday ? "text-rust-600" : i >= 5 ? "text-n-400" : "text-n-500",
                  )}>
                    {DAY_SHORT[i]}
                  </div>
                  <div className={clsx(
                    "font-num mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[16px] font-semibold",
                    isToday ? "bg-rust-500 text-white" : "text-n-800",
                  )}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── All-day row ────────────────────────────────────────────── */}
          {maxAllDay > 0 && (
            <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-n-200">
              <div className="flex items-start justify-end px-1.5 pt-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-n-400">All day</span>
              </div>
              {allDayByDay.map((list, i) => {
                const shown = expandAllDay ? list : list.slice(0, MAX_ALLDAY);
                const blocked = list.find((x) => x.blocked);
                return (
                  <div
                    key={i}
                    className="flex min-w-0 flex-col gap-[3px] border-l border-n-100 p-1"
                    style={blocked ? { backgroundColor: tint(blocked.colour, 5), backgroundImage: hatch(blocked.colour, 10) } : undefined}
                  >
                    {shown.map((item) => <Chip key={item.id} item={item} onClick={onItem} />)}
                    {!expandAllDay && list.length > MAX_ALLDAY && (
                      <button
                        onClick={() => setExpandAllDay(true)}
                        className="rounded px-1 text-left text-[10.5px] font-semibold text-n-500 hover:bg-n-100"
                      >
                        +{list.length - MAX_ALLDAY} more
                      </button>
                    )}
                  </div>
                );
              })}
              {allDayOverflow && expandAllDay && (
                <button
                  onClick={() => setExpandAllDay(false)}
                  className="col-span-8 border-t border-n-100 py-1 text-[10.5px] font-semibold text-n-500 hover:bg-n-50"
                >
                  Show less
                </button>
              )}
            </div>
          )}

          {/* ── Hour grid ──────────────────────────────────────────────── */}
          <div ref={scrollRef} className="max-h-[640px] overflow-y-auto">
            <div className="relative grid grid-cols-[52px_repeat(7,1fr)]" style={{ height: hours.length * HOUR_PX }}>
              {/* Hour labels */}
              <div className="relative">
                {hours.map((h, i) => (
                  <span
                    key={h}
                    className="font-num absolute right-2 -translate-y-1/2 text-[10px] text-n-400"
                    style={{ top: i * HOUR_PX }}
                  >
                    {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                  </span>
                ))}
              </div>

              {days.map((day, di) => {
                const timed = (byDay.get(toISODate(day)) ?? []).filter((i) => !i.allDay);
                const placed = layoutDay(timed, day, 22);
                const isToday = now != null && isSameDay(day, now);
                const nowMin = now ? now.getHours() * 60 + now.getMinutes() : 0;
                const nowTop = (nowMin - from * 60) * (HOUR_PX / 60);

                return (
                  <div
                    key={di}
                    className={clsx("relative cursor-cell border-l border-n-100", di >= 5 && "bg-n-25/50")}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      // Snap to the half hour under the cursor.
                      const mins = from * 60 + Math.floor((y / HOUR_PX) * 2) * 30;
                      onNewEvent(day, Math.max(0, Math.min(mins, 23 * 60)));
                    }}
                  >
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 border-t border-n-100"
                        style={{ top: i * HOUR_PX }}
                      >
                        <div className="absolute inset-x-0 border-t border-dashed border-n-100/70" style={{ top: HOUR_PX / 2 }} />
                      </div>
                    ))}

                    {placed.map(({ item, top, bottom, col, cols }) => {
                      const { className, style } = chipStyle(item);
                      const y = (top - from * 60) * (HOUR_PX / 60);
                      const h = (bottom - top) * (HOUR_PX / 60);
                      const short = h < 36;
                      const s = new Date(item.start);
                      const e = new Date(item.end);
                      const fmt = (d: Date) => fmtHM(d);

                      return (
                        <button
                          key={item.id}
                          onClick={(ev) => { ev.stopPropagation(); onItem(item, ev.currentTarget.getBoundingClientRect()); }}
                          title={`${item.title}\n${fmt(s)}–${fmt(e)}`}
                          className={clsx(
                            "absolute overflow-hidden rounded-[5px] px-1.5 text-left transition-[filter] duration-[120ms] hover:z-10 hover:brightness-[0.96]",
                            short ? "py-0.5" : "py-1",
                            item.done && "opacity-55",
                            className,
                          )}
                          style={{
                            ...style,
                            top: y + 1,
                            height: Math.max(h - 2, 18),
                            left: `calc(${(col / cols) * 100}% + 2px)`,
                            // 2px inset each side leaves a 4px surface gap between side-by-side blocks.
                            width: `calc(${100 / cols}% - 4px)`,
                          }}
                        >
                          <div className={clsx("flex min-w-0 gap-1", short ? "items-center" : "flex-col gap-0")}>
                            <span className={clsx("truncate font-semibold leading-4", short ? "text-[10.5px]" : "text-[11.5px]", item.done && "line-through")}>
                              {item.courseShort && item.source === "class" ? `${item.courseShort} · ` : ""}
                              {item.title}
                            </span>
                            <span className="font-num shrink-0 truncate text-[10px] leading-4 text-n-500">
                              {fmt(s)}{!short && `–${fmt(e)}`}
                            </span>
                            {!short && h > 56 && item.location && (
                              <span className="truncate text-[10px] leading-4 text-n-500">{item.location}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {isToday && nowTop >= 0 && nowTop <= hours.length * HOUR_PX && (
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
                        <div className="relative h-[2px] bg-rust-500">
                          <span className="absolute -left-[4px] -top-[3px] h-2 w-2 rounded-full bg-rust-500" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
