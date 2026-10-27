"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { toggleTask } from "@/app/actions";
import type { DueSoon } from "@/lib/queries";
import { fmtDuration, fmtHM } from "@/lib/dates";
import { cssColour } from "@/lib/palette";
import { afterTick, Tick, useShown } from "./Tick";

const POLL_MS = 60_000;
const KEY = "studio:dueSoonDismissed";

function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {}
}

/**
 * Coursework or a quiz due within three hours, across the top of every page
 * until it's done, dismissed, or due. Dismissing is for "I know, I'm on it" -
 * it's remembered per task in this browser.
 *
 * It polls, so a deadline crossing into the window turns up without
 * navigating, and counts down between polls. Nothing renders until mounted:
 * the countdown and the dismissed list are both the browser's to know.
 */
export function DueSoonBanner({ initial }: { initial: DueSoon[] | null }) {
  const [items, setItems] = useState<DueSoon[]>(initial ?? []);
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const inFlight = useRef(false);
  // Livio has no server copy to start from, so it asks straight away.
  const hasInitial = useRef(initial != null);

  useEffect(() => {
    setDismissed(readDismissed());
    setNow(Date.now());
    const poll = async () => {
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/due-soon", { cache: "no-store" });
        const data = (await res.json()) as DueSoon[] | null;
        if (data) setItems(data);
      } catch {
        /* offline - keep what's showing */
      } finally {
        inFlight.current = false;
      }
    };
    if (!hasInitial.current) poll();
    const t = setInterval(poll, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    const onVisible = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // A fresh server render (after a tick anywhere, or navigating) is newer
  // than the last poll.
  useEffect(() => {
    if (initial) setItems(initial);
  }, [initial]);

  // Forget dismissals for tasks no longer in the window, so the list can't grow.
  useEffect(() => {
    if (!dismissed || items.length === 0) return;
    const live = dismissed.filter((id) => items.some((i) => i.id === id));
    if (live.length !== dismissed.length) writeDismissed(live);
  }, [items, dismissed]);

  if (now == null || dismissed == null) return null;
  const shown = items.filter((i) => !dismissed.includes(i.id) && new Date(i.dueAt).getTime() > now);
  if (shown.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 pt-4 sm:px-8" role="region" aria-label="Due soon">
      <ul className="space-y-2">
        {shown.map((t) => (
          <DueRow
            key={t.id}
            task={t}
            now={now}
            onDismiss={() => dismiss(t.id)}
            onDone={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
          />
        ))}
      </ul>
    </div>
  );
}

function DueRow({ task, now, onDismiss, onDone }: { task: DueSoon; now: number; onDismiss: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useShown(false);
  const due = new Date(task.dueAt);
  const mins = Math.max(1, Math.ceil((due.getTime() - now) / 60_000));
  const urgent = mins <= 60;
  const colour = cssColour(task.course.colour) || "var(--color-rust-500)";

  return (
    <li
      className="animate-fade-up relative flex items-center gap-3 overflow-hidden rounded-lg border border-n-100 bg-n-0 py-2.5 pl-4 pr-3"
      style={{ boxShadow: "var(--shadow-pop)", background: `color-mix(in srgb, ${colour} 6%, var(--color-n-0))` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: colour }} />
      <Tick
        size="md"
        done={shown}
        disabled={pending}
        label={`Mark ${task.title} as done`}
        onToggle={() => {
          setShown(true);
          startTransition(async () => {
            await Promise.all([toggleTask(task.id), afterTick()]);
            onDone();
            router.refresh();
          });
        }}
      />
      <div className="tick-text min-w-0 flex-1" data-done={shown}>
        <div className="flex min-w-0 items-baseline gap-2">
          <Link href={`/tasks/${task.id}` as Route} className="tick-words truncate text-[13.5px] font-semibold text-n-900 hover:underline">
            {task.title}
          </Link>
          <span className="shrink-0 text-[11.5px] font-semibold" style={{ color: colour }}>{task.course.shortName}</span>
        </div>
        <p className="text-[12px] text-n-500">
          <span className={urgent ? "font-semibold text-rust-600" : "font-medium text-n-700"}>Due in {fmtDuration(mins)}</span>
          {" · "}{fmtHM(due)}
          {task.gradeWeight != null && <>{" · "}<span className="font-num tabular-nums">{fmtWeight(task.gradeWeight)}</span> of the course</>}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-n-400 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-700"
        title="Hide this until it's due - you know about it"
      >
        Dismiss
      </button>
    </li>
  );
}

/** 1.8 → "1.8%", 15 → "15%". */
function fmtWeight(w: number): string {
  return `${Number.isInteger(w) ? w : w.toFixed(1)}%`;
}
