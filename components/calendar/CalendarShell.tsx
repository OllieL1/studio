"use client";

import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseLocalDate, toISODate } from "@/lib/dates";
import { shiftAnchor, viewTitle, type CalendarItem, type CalendarView } from "@/lib/calendar";
import { clsx } from "@/lib/clsx";
import { MonthGrid } from "./MonthGrid";
import { WeekGrid } from "./WeekGrid";
import { CalendarSidebar, type SidebarData } from "./CalendarSidebar";
import { EventDialog, type EventDraft } from "./EventDialog";
import { ItemPopover } from "./ItemPopover";

export type CourseOption = { id: string; name: string; shortName: string; colour: string };

/** Which kinds of item are currently shown. Google can be hidden to focus on uni. */
export type Filters = { deadlines: boolean; classes: boolean; events: boolean; google: boolean };

/**
 * The calendar: month or week, a sidebar of what's coming, and event
 * creation. View and date live in the URL, so back/forward and bookmarks work.
 *
 * Keyboard: ← → page, T today, M month, W week, N new event.
 */
export function CalendarShell({
  view,
  anchor,
  items,
  sidebar,
  courses,
  googleConnected,
  googleError,
}: {
  view: CalendarView;
  anchor: string;
  items: CalendarItem[];
  sidebar: SidebarData;
  courses: CourseOption[];
  googleConnected: boolean;
  googleError: string | null;
}) {
  const router = useRouter();
  const anchorDate = useMemo(() => parseLocalDate(anchor), [anchor]);
  const [dialog, setDialog] = useState<EventDraft | null>(null);
  const [popover, setPopover] = useState<{ item: CalendarItem; rect: DOMRect } | null>(null);
  const [filters, setFilters] = useState<Filters>({
    deadlines: true, classes: true, events: true, google: true,
  });

  const go = useCallback(
    (nextView: CalendarView, date: Date) => {
      setPopover(null);
      router.push(`/calendar?view=${nextView}&date=${toISODate(date)}` as Route, { scroll: false });
    },
    [router],
  );

  const visible = useMemo(
    () =>
      items.filter((i) =>
        i.source === "deadline" ? filters.deadlines
          : i.source === "class" ? filters.classes
          : i.source === "event" || i.source === "meeting" ? filters.events
          : filters.google,
      ),
    [items, filters],
  );

  const newEvent = useCallback(
    (date: Date, startMinutes?: number) => {
      setPopover(null);
      const s = startMinutes ?? 10 * 60;
      const e = Math.min(s + 60, 23 * 60 + 59);
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      setDialog({
        id: null,
        title: "",
        date: toISODate(date),
        endDate: toISODate(date),
        allDay: false,
        startTime: hhmm(s),
        endTime: hhmm(e),
        location: "",
        notes: "",
        courseId: null,
        syncToGoogle: googleConnected,
      });
    },
    [googleConnected],
  );

  const editEvent = useCallback((item: CalendarItem) => {
    setPopover(null);
    const s = new Date(item.start);
    const e = new Date(item.end);
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    // All-day ends are exclusive; show the inclusive last day in the form.
    const lastDay = item.allDay ? new Date(e.getTime() - 1) : e;
    setDialog({
      id: item.id.replace(/^event-/, ""),
      title: item.title,
      date: toISODate(s),
      endDate: toISODate(lastDay),
      allDay: item.allDay,
      startTime: hhmm(s),
      endTime: hhmm(e),
      location: item.location ?? "",
      notes: item.notes ?? "",
      courseId: item.courseId,
      syncToGoogle: item.onGoogle,
    });
  }, []);

  // Keyboard navigation — ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey || dialog) return;

      if (e.key === "ArrowLeft") { e.preventDefault(); go(view, shiftAnchor(view, anchorDate, -1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(view, shiftAnchor(view, anchorDate, 1)); }
      else if (e.key.toLowerCase() === "t") go(view, new Date());
      else if (e.key.toLowerCase() === "m") go("month", anchorDate);
      else if (e.key.toLowerCase() === "w") go("week", anchorDate);
      else if (e.key.toLowerCase() === "n") { e.preventDefault(); newEvent(new Date()); }
      else if (e.key === "Escape") setPopover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, view, anchorDate, newEvent, dialog]);

  const counts = {
    deadlines: items.filter((i) => i.source === "deadline").length,
    classes: items.filter((i) => i.source === "class").length,
    events: items.filter((i) => i.source === "event" || i.source === "meeting").length,
    google: items.filter((i) => i.source === "google").length,
  };

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">
            {viewTitle(view, anchorDate)}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5">
            {(["month", "week"] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => go(v, anchorDate)}
                aria-pressed={view === v}
                className={clsx(
                  "rounded-[6px] px-3 py-1 text-[12.5px] font-semibold capitalize transition-colors duration-[120ms]",
                  view === v ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50 hover:text-n-700",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-md border border-n-200 bg-n-0">
            <button
              onClick={() => go(view, shiftAnchor(view, anchorDate, -1))}
              aria-label={`Previous ${view}`}
              className="flex h-8 w-8 items-center justify-center text-n-500 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-800"
            >
              <Chevron dir="left" />
            </button>
            <button
              onClick={() => go(view, new Date())}
              className="h-8 border-x border-n-100 px-3 text-[12.5px] font-semibold text-n-700 transition-colors duration-[120ms] hover:bg-n-50"
            >
              Today
            </button>
            <button
              onClick={() => go(view, shiftAnchor(view, anchorDate, 1))}
              aria-label={`Next ${view}`}
              className="flex h-8 w-8 items-center justify-center text-n-500 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-800"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <button
            onClick={() => newEvent(new Date())}
            className="flex h-8 items-center gap-1.5 rounded-md bg-rust-500 px-3 text-[12.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 2.2v7.6M2.2 6h7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            New event
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip label="Deadlines" count={counts.deadlines} on={filters.deadlines} swatch={<DeadlineSwatch />}
          onToggle={() => setFilters((f) => ({ ...f, deadlines: !f.deadlines }))} />
        <FilterChip label="Classes" count={counts.classes} on={filters.classes} swatch={<ClassSwatch />}
          onToggle={() => setFilters((f) => ({ ...f, classes: !f.classes }))} />
        <FilterChip label="Events & meetings" count={counts.events} on={filters.events} swatch={<EventSwatch />}
          onToggle={() => setFilters((f) => ({ ...f, events: !f.events }))} />
        {googleConnected && (
          <FilterChip label="Google" count={counts.google} on={filters.google} swatch={<GoogleSwatch />}
            onToggle={() => setFilters((f) => ({ ...f, google: !f.google }))} />
        )}

        {!googleConnected && (
          <a href="/settings" className="ml-1 text-[11.5px] font-medium text-n-400 hover:text-rust-600">
            Connect Google Calendar to see your other events →
          </a>
        )}
        {googleError && <span className="ml-1 text-[11.5px] font-medium text-warn">{googleError}</span>}

        <span className="ml-auto hidden text-[11px] text-n-400 lg:inline">
          ← → to page · T today · M / W to switch · N new event
        </span>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {view === "month" ? (
            <MonthGrid
              anchor={anchorDate}
              items={visible}
              onDayOpen={(d) => go("week", d)}
              onNewEvent={(d) => newEvent(d)}
              onItem={(item, rect) => setPopover({ item, rect })}
            />
          ) : (
            <WeekGrid
              anchor={anchorDate}
              items={visible}
              onNewEvent={(d, mins) => newEvent(d, mins)}
              onItem={(item, rect) => setPopover({ item, rect })}
            />
          )}
        </div>

        <CalendarSidebar data={sidebar} />
      </div>

      {popover && (
        <ItemPopover
          item={popover.item}
          anchorRect={popover.rect}
          onClose={() => setPopover(null)}
          onEdit={editEvent}
        />
      )}

      {dialog && (
        <EventDialog
          draft={dialog}
          courses={courses}
          googleConnected={googleConnected}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function FilterChip({
  label, count, on, swatch, onToggle,
}: { label: string; count: number; on: boolean; swatch: React.ReactNode; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      className={clsx(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-[180ms]",
        on ? "border-n-200 bg-n-0 text-n-700" : "border-dashed border-n-200 bg-transparent text-n-400",
      )}
    >
      <span className={clsx("transition-opacity duration-[180ms]", on ? "opacity-100" : "opacity-35")}>{swatch}</span>
      {label}
      <span className="font-num text-[10.5px] text-n-400">{count}</span>
    </button>
  );
}

/* Legend swatches — each mirrors how that kind is actually drawn on the grid. */
export function DeadlineSwatch() {
  return <span className="block h-2.5 w-2.5 rounded-[3px] border-l-[3px] border-rust-500 bg-rust-100" />;
}
export function ClassSwatch() {
  return <span className="block h-2.5 w-2.5 rounded-full bg-n-400" />;
}
export function EventSwatch() {
  return <span className="block h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-n-600 bg-n-0" />;
}
export function GoogleSwatch() {
  return <span className="block h-2.5 w-2.5 rounded-[3px] border-l-[3px] border-info bg-info-soft" />;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M7.5 2.5L4 6l3.5 3.5" : "M4.5 2.5L8 6l-3.5 3.5"}
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
