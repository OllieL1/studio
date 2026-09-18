"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CalendarItem } from "@/lib/calendar";
import { fmtDateLong, fmtHM } from "@/lib/dates";
import { TASK_KIND_LABEL } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { Pill } from "../ui";
import { timeLabel } from "./chips";

const SOURCE_LABEL: Record<CalendarItem["source"], string> = {
  deadline: "Deadline",
  class: "Class",
  event: "Uni event",
  google: "Google Calendar",
};

/**
 * Details for a clicked item, without leaving the calendar. Positioned beside
 * the item and kept inside the viewport.
 */
export function ItemPopover({
  item,
  anchorRect,
  onClose,
  onEdit,
}: {
  item: CalendarItem;
  anchorRect: DOMRect;
  onClose: () => void;
  onEdit: (item: CalendarItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 8;
    // Prefer the right of the item; flip left if there's no room; clamp vertically.
    let left = anchorRect.right + gap;
    if (left + w > window.innerWidth - 12) left = anchorRect.left - w - gap;
    if (left < 12) left = Math.min(window.innerWidth - w - 12, Math.max(12, anchorRect.left));
    let top = anchorRect.top;
    if (top + h > window.innerHeight - 12) top = window.innerHeight - h - 12;
    setPos({ top: Math.max(12, top), left });
  }, [anchorRect]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const start = new Date(item.start);
  const end = new Date(item.end);
  const fmt = (d: Date) => fmtHM(d);
  const when =
    item.source === "deadline"
      ? `${fmtDateLong(start)}${timeLabel(item) ? ` · due ${timeLabel(item)}` : ""}`
      : item.allDay
        ? fmtDateLong(start)
        : `${fmtDateLong(start)} · ${fmt(start)}–${fmt(end)}`;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={item.title}
      className="animate-scale-in fixed z-[65] w-[290px] overflow-hidden rounded-lg border border-n-200 bg-n-0"
      style={{
        top: pos?.top ?? anchorRect.top,
        left: pos?.left ?? anchorRect.right + 8,
        visibility: pos ? "visible" : "hidden",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <div className="h-1" style={{ background: item.colour ?? (item.source === "google" ? "var(--color-info)" : "var(--color-n-300)") }} />
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-400">
            {item.kind ? TASK_KIND_LABEL[item.kind] ?? SOURCE_LABEL[item.source] : SOURCE_LABEL[item.source]}
            {item.courseShort && <span style={{ color: item.colour ?? undefined }}> · {item.courseShort}</span>}
          </p>
          <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-n-400 hover:bg-n-100 hover:text-n-700">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className={clsx("mt-1 text-[14.5px] font-semibold leading-5 text-n-900", item.done && "line-through decoration-n-400")}>
          {item.title}
        </p>
        <p className="mt-1 text-[12px] text-n-500">{when}</p>

        <div className="mt-2 flex flex-wrap gap-1">
          {item.done && <Pill tone="ok">Done</Pill>}
          {item.blocked && <Pill tone="danger">{item.kind === "EXAM" ? "Exam" : "Big deadline"}</Pill>}
          {item.gradeWeight != null && <Pill tone="neutral">{item.gradeWeight}% of grade</Pill>}
          {item.onGoogle && item.source !== "google" && <Pill tone="info">On Google Calendar</Pill>}
        </div>

        {item.location && (
          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-n-600">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-0.5 shrink-0 text-n-400">
              <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 10-9 0C3.5 9.8 8 14 8 14z" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="8" cy="6.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            {item.location}
          </p>
        )}
        {item.notes && (
          <p className="mt-2 line-clamp-3 border-l-2 border-n-200 pl-2 text-[11.5px] leading-4 text-n-500">
            {item.source === "google" ? `Calendar: ${item.notes}` : item.notes}
          </p>
        )}

        <div className="mt-3 flex items-center gap-1.5">
          {item.source === "event" && (
            <button
              onClick={() => onEdit(item)}
              className="rounded-md bg-rust-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rust-600"
            >
              Edit
            </button>
          )}
          {(item.source === "deadline" || item.source === "class") && item.href && (
            <Link
              href={item.href as Route}
              className="rounded-md bg-rust-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rust-600"
            >
              {item.source === "class" && item.kind !== "LAB" ? "Open lecture" : "Open task"}
            </Link>
          )}
          {item.source === "google" && item.href && (
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-md border border-n-200 px-3 py-1.5 text-[12px] font-semibold text-n-700 hover:bg-n-50"
            >
              Open in Google ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
