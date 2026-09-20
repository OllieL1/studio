"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startTimer, cancelTimer } from "@/app/actions";
import { fmtClock } from "@/lib/dates";
import { clsx } from "@/lib/clsx";
import { StopDialog } from "./StopDialog";
import type { StudyLocation } from "@/lib/types";
import { NowPlaying } from "./NowPlaying";

type CourseLink = { id: string; name: string; shortName: string; colour: string; code: string };

/**
 * The globally-visible on/off control. The start time lives on the server
 * (ActiveTimer), so the elapsed figure is derived from it on every tick —
 * closing the tab, reloading or a crash can't lose or drift the session.
 */
export function TimerBar({
  startedAt,
  draftName,
  courses,
  lastLocation,
  lastLocationNote,
}: {
  startedAt: string | null;
  draftName: string | null;
  courses: CourseLink[];
  lastLocation: StudyLocation | null;
  lastLocationNote: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);
  const startMs = startedAt ? new Date(startedAt).getTime() : null;

  // Tick from the server-provided start time rather than accumulating a
  // counter, so the display stays correct across sleep and throttling.
  useEffect(() => {
    if (startMs == null) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, (Date.now() - startMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startMs]);

  // Keep the running time in the tab title — glanceable from another app.
  useEffect(() => {
    const base = "Studio - 26/27";
    document.title = startMs ? `${fmtClock(elapsed)} · Studying` : base;
    return () => {
      document.title = base;
    };
  }, [elapsed, startMs]);

  const running = startMs != null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2.5 px-4 pb-5">
        <NowPlaying studying={running} />
        <div
          className={clsx(
            "pointer-events-auto flex items-center gap-3 rounded-full border bg-n-0/95 py-2 pl-2 pr-2 backdrop-blur-md transition-[border-color] duration-200",
            running ? "border-rust-200" : "border-n-200",
          )}
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          {running ? (
            <>
              <button
                onClick={() => setStopping(true)}
                disabled={pending}
                className="group flex h-9 w-9 items-center justify-center rounded-full bg-rust-500 transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-50"
                aria-label="Stop timer and log session"
              >
                <span className="h-3 w-3 rounded-[3px] bg-white transition-transform duration-[180ms] group-hover:scale-90" />
              </button>

              <div className="flex items-center gap-2 pr-1">
                <span
                  aria-hidden
                  className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-rust-500"
                />
                <span className="font-num text-[19px] font-semibold leading-none tracking-tight text-n-900 tabular-nums">
                  {fmtClock(elapsed)}
                </span>
              </div>

              <button
                onClick={() => {
                  if (!confirm("Discard this session without recording it?")) return;
                  startTransition(async () => {
                    await cancelTimer();
                    router.refresh();
                  });
                }}
                className="mr-1 rounded-full px-2 py-1 text-[12px] font-medium text-n-400 transition-colors duration-[120ms] hover:bg-n-50 hover:text-danger"
              >
                Discard
              </button>
            </>
          ) : (
            <button
              onClick={() =>
                startTransition(async () => {
                  await startTimer();
                  router.refresh();
                })
              }
              disabled={pending}
              className="group flex items-center gap-2.5 rounded-full py-1 pl-1 pr-4 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rust-500 transition-transform duration-[180ms] group-hover:scale-105">
                <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden>
                  <path d="M1.5 1.8v9.4a.6.6 0 0 0 .92.5l7.4-4.7a.6.6 0 0 0 0-1L2.42 1.3a.6.6 0 0 0-.92.5Z" fill="white" />
                </svg>
              </span>
              <span className="text-[13px] font-semibold text-n-800">Start studying</span>
            </button>
          )}
        </div>
      </div>

      {stopping && startMs != null && (
        <StopDialog
          elapsedMinutes={Math.max(0, Math.round(elapsed / 60))}
          initialName={draftName ?? ""}
          courses={courses}
          lastLocation={lastLocation}
          lastLocationNote={lastLocationNote}
          onClose={() => setStopping(false)}
          onSaved={() => {
            setStopping(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
