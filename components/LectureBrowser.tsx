"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtDate, fmtTime } from "@/lib/dates";
import { clsx } from "@/lib/clsx";
import { Card, EmptyState, Pill } from "./ui";
import { NotebookLocation } from "./NotebookLocation";
import { cssColour } from "@/lib/palette";

type Item = { id: string; label: string; done: boolean; isRevision: boolean };
type Lecture = {
  id: string; title: string; kind: string; dueAt: string | null; startMin: number | null;
  notebook: string | null; notebookPages: string | null;
  hasNotes: boolean; words: number;
  course: { id: string; shortName: string; colour: string; name: string };
  items: Item[];
};
type Course = { id: string; name: string; shortName: string; colour: string; code: string; revisionMode: boolean };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "typed", label: "Has typed notes" },
  { key: "untyped", label: "Missing typed notes" },
  { key: "handwritten", label: "Handwritten logged" },
  { key: "unlocated", label: "Handwritten missing" },
] as const;

/** Browse lectures by course, split by what's been written up. */
export function LectureBrowser({
  courses,
  lectures,
  activeCourse,
  activeFilter,
}: {
  courses: Course[];
  lectures: Lecture[];
  activeCourse: string | null;
  activeFilter: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Non-literal (the query string is built at runtime), so it needs the cast.
    router.push(`/lectures${next.toString() ? `?${next}` : ""}` as Route, { scroll: false });
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return lectures.filter((l) => {
      if (term && !`${l.title} ${l.course.name} ${l.notebook ?? ""}`.toLowerCase().includes(term))
        return false;
      switch (activeFilter) {
        case "typed": return l.hasNotes;
        case "untyped": return !l.hasNotes;
        case "handwritten": return !!l.notebook;
        case "unlocated": return !l.notebook;
        default: return true;
      }
    });
  }, [lectures, activeFilter, q]);

  const course = courses.find((c) => c.id === activeCourse) ?? null;

  return (
    <div className="space-y-4">
      {/* Filters — one row above the content. */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setParam("course", null)}
              aria-pressed={!activeCourse}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-[180ms]",
                !activeCourse
                  ? "border-transparent bg-n-800 text-n-0"
                  : "border-n-200 text-n-500 hover:bg-n-50",
              )}
            >
              All courses
            </button>
            {courses.map((c) => {
              const on = activeCourse === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setParam("course", on ? null : c.id)}
                  aria-pressed={on}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-[180ms]",
                    on ? "border-transparent text-white" : "border-n-200 text-n-500 hover:bg-n-50",
                  )}
                  style={on ? { background: cssColour(c.colour) } : undefined}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: on ? "rgba(255,255,255,.85)" : cssColour(c.colour) }}
                  />
                  {c.shortName}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              className="h-8 w-36 rounded-sm border border-n-200 px-2.5 text-[12.5px] outline-none transition-colors focus:border-rust-400"
            />
            {course && (
              <Link
                href={`/courses/${course.id}/notes`}
                className="shrink-0 rounded-md bg-rust-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600"
              >
                Export all notes
              </Link>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-n-100 pt-2.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setParam("filter", f.key === "all" ? null : f.key)}
              aria-pressed={activeFilter === f.key}
              className={clsx(
                "rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors duration-[120ms]",
                activeFilter === f.key
                  ? "bg-rust-100 text-rust-700"
                  : "text-n-500 hover:bg-n-50 hover:text-n-700",
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="font-num ml-auto text-[11px] text-n-400">
            {shown.length} shown
          </span>
        </div>
      </Card>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing matches."
            body="Try a different course or filter."
          />
        </Card>
      ) : (
        <Card>
          {shown.map((l) => (
            <LectureRow key={l.id} lecture={l} />
          ))}
        </Card>
      )}
    </div>
  );
}

function LectureRow({ lecture: l }: { lecture: Lecture }) {
  const [open, setOpen] = useState(false);
  const revision = l.items.find((i) => i.isRevision);

  return (
    <div className="group relative border-b border-n-100 last:border-b-0">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: cssColour(l.course.colour) }}
      />

      <div className="flex items-start gap-3 py-2.5 pl-4 pr-3 hover:bg-n-25">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link
              href={`/lectures/${l.id}`}
              className="text-[14px] font-medium text-n-800 hover:text-rust-700"
            >
              {l.title}
            </Link>
            <span className="text-[11.5px] font-medium" style={{ color: cssColour(l.course.colour) }}>
              {l.course.shortName}
            </span>
            {revision && (
              <Pill tone={revision.done ? "ok" : "warn"}>
                {revision.done ? "Revised" : "To revise"}
              </Pill>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-n-500">
            {l.dueAt && <span className="font-num">{fmtDate(new Date(l.dueAt))}</span>}
            {l.startMin != null && <span className="font-num">{fmtTime(l.startMin)}</span>}

            <span className={clsx("flex items-center gap-1", l.hasNotes ? "text-ok" : "text-n-400")}>
              <Dot on={l.hasNotes} />
              {l.hasNotes ? `Typed · ${l.words} words` : "No typed notes"}
            </span>

            <span className={clsx("flex items-center gap-1", l.notebook ? "text-ok" : "text-n-400")}>
              <Dot on={!!l.notebook} />
              {l.notebook
                ? `${l.notebook}${l.notebookPages ? ` pp. ${l.notebookPages}` : ""}`
                : "Handwritten not logged"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/lectures/${l.id}`}
            className="rounded-md px-2 py-1.5 text-[11.5px] font-semibold text-n-500 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-800"
          >
            {l.hasNotes ? "Open" : "Write"}
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Hide notebook location" : "Set notebook location"}
            className="rounded-md p-1.5 text-n-400 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-600"
          >
            <svg
              width="11" height="11" viewBox="0 0 10 10" fill="none"
              className={clsx("transition-transform duration-[180ms]", open && "rotate-180")}
            >
              <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="animate-fade-in pb-3 pl-4 pr-3">
          <NotebookLocation
            taskId={l.id}
            notebook={l.notebook}
            pages={l.notebookPages}
          />
        </div>
      )}
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 rounded-full"
      style={{ background: on ? "var(--color-ok)" : "var(--color-n-300)" }}
    />
  );
}
