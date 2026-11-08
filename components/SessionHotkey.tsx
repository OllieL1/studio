"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resumeTimer, startTimer } from "@/app/actions";
import { studiedMs } from "@/lib/ultraFocus";
import { fmtClock } from "@/lib/dates";
import { Portal } from "@/lib/hooks/useModal";

/** How long the notice stays up before it sinks away. */
const HOLD_MS = 2400;
const OUT_MS = 240;

type Notice = { startMs: number; label: string; fresh: boolean; leaving: boolean };
type Clock = { startedAt: string; pausedAt: string | null; pausedMs: number };

/**
 * ⌥S starts a study session from anywhere - mid-sentence in a lecture too,
 * so it fires while typing, like ⌘K. A notice rises from the bottom to say
 * so, then goes. It's portalled above lecture focus mode, which covers the
 * timer bar, so starting from there still shows something happened.
 *
 * With a session already running it never stops it (stopping needs the stop
 * dialog); it just shows how long it's been going. A paused session it
 * resumes - ⌥S is "study now".
 */
export function SessionHotkey({ clock }: { clock: Clock | null }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  // Read at keypress time, so the listener needn't re-bind on every refresh.
  const running = useRef(clock);
  running.current = clock;

  useEffect(() => {
    const show = (startMs: number, label: string, fresh: boolean) => {
      timers.current.forEach(clearTimeout);
      setNotice({ startMs, label, fresh, leaving: false });
      timers.current = [
        window.setTimeout(() => setNotice((n) => n && { ...n, leaving: true }), HOLD_MS),
        window.setTimeout(() => setNotice(null), HOLD_MS + OUT_MS),
      ];
    };

    const onKey = async (e: KeyboardEvent) => {
      // `code`, not `key`: Option+S types "ß" on a Mac.
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyS") return;
      e.preventDefault();
      if (busy.current) return;

      const c = running.current;
      if (c) {
        // The clock less its pauses, as a start time the notice can tick from.
        const studied = studiedMs({ startedAt: new Date(c.startedAt), pausedAt: null, pausedMs: c.pausedMs });
        if (!c.pausedAt) return show(Date.now() - studied, "Already studying", false);
        busy.current = true;
        try {
          const paused = Date.now() - new Date(c.pausedAt).getTime();
          await resumeTimer();
          show(Date.now() - (studied - paused), "Resumed", true);
          router.refresh();
        } finally {
          busy.current = false;
        }
        return;
      }
      busy.current = true;
      try {
        const { startedAt } = await startTimer();
        const startMs = new Date(startedAt).getTime();
        // A start time from just now means this press started it; an older
        // one means another tab already had.
        const fresh = Date.now() - startMs < 5000;
        show(startMs, fresh ? "Session started" : "Already studying", fresh);
        router.refresh();
      } finally {
        busy.current = false;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      timers.current.forEach(clearTimeout);
    };
  }, [router]);

  if (!notice) return null;
  return <StartedNotice {...notice} />;
}

function StartedNotice({ startMs, label, fresh, leaving }: Notice) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, (now - startMs) / 1000);

  return (
    <Portal>
      {/* Above lecture focus mode (z-60) and its status pill (z-65), below
          dialogs (z-70); clear of the timer bar it's talking about. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[66] flex justify-center px-4" role="status" aria-live="polite">
        {/* A slim pill - a live dot, what happened, the clock. No play
            button: there's nothing to press, the session's already going. */}
        <div
          className={`${leaving ? "animate-sink-out" : "animate-rise-in"} flex h-9 items-center gap-2.5 rounded-full border border-n-200 bg-n-0/90 pl-3.5 pr-4 backdrop-blur-md`}
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          <span aria-hidden className="relative flex h-2 w-2">
            {fresh && <span className="absolute inset-0 animate-ping rounded-full bg-rust-400 opacity-60 [animation-iteration-count:2]" />}
            <span className="animate-pulse-dot relative h-2 w-2 rounded-full bg-rust-500" />
          </span>
          <span className="text-[12.5px] font-semibold text-n-800">{label}</span>
          <span aria-hidden className="h-3.5 w-px bg-n-200" />
          <span className="font-num text-[13px] font-semibold leading-none text-n-600 tabular-nums">{fmtClock(elapsed)}</span>
        </div>
      </div>
    </Portal>
  );
}
