"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startTimer } from "@/app/actions";
import { fmtClock } from "@/lib/dates";
import { Portal } from "@/lib/hooks/useModal";

/** How long the notice stays up before it sinks away. */
const HOLD_MS = 2400;
const OUT_MS = 240;

type Notice = { startMs: number; fresh: boolean; leaving: boolean };

/**
 * ⌥S starts a study session from anywhere - mid-sentence in a lecture too,
 * so it fires while typing, like ⌘K. A notice rises from the bottom to say
 * so, then goes. It's portalled above lecture focus mode, which covers the
 * timer bar, so starting from there still shows something happened.
 *
 * With a session already running it never stops it (stopping needs the stop
 * dialog); it just shows how long it's been going.
 */
export function SessionHotkey({ startedAt }: { startedAt: string | null }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  // Read at keypress time, so the listener needn't re-bind on every refresh.
  const running = useRef(startedAt);
  running.current = startedAt;

  useEffect(() => {
    const show = (startMs: number, fresh: boolean) => {
      timers.current.forEach(clearTimeout);
      setNotice({ startMs, fresh, leaving: false });
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

      if (running.current) {
        show(new Date(running.current).getTime(), false);
        return;
      }
      busy.current = true;
      try {
        const { startedAt } = await startTimer();
        const startMs = new Date(startedAt).getTime();
        // A start time from just now means this press started it; an older
        // one means another tab already had.
        show(startMs, Date.now() - startMs < 5000);
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

function StartedNotice({ startMs, fresh, leaving }: Notice) {
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
        <div
          className={`${leaving ? "animate-sink-out" : "animate-rise-in"} flex items-center gap-3 rounded-full border border-rust-200 bg-n-0/95 py-2 pl-2 pr-5 backdrop-blur-md`}
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-rust-500">
            {fresh && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-rust-400 opacity-40 [animation-iteration-count:1]" />}
            <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden className="relative">
              <path d="M1.5 1.8v9.4a.6.6 0 0 0 .92.5l7.4-4.7a.6.6 0 0 0 0-1L2.42 1.3a.6.6 0 0 0-.92.5Z" fill="white" />
            </svg>
          </span>
          <span className="text-[13px] font-semibold text-n-800">{fresh ? "Session started" : "Already studying"}</span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-rust-500" />
            <span className="font-num text-[17px] font-semibold leading-none tracking-tight text-n-900 tabular-nums">
              {fmtClock(elapsed)}
            </span>
          </span>
        </div>
      </div>
    </Portal>
  );
}
