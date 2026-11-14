"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pauseSovrano, resumeSovrano, startSovrano } from "@/app/sovranoActions";
import { clsx } from "@/lib/clsx";
import { fmtClock } from "@/lib/dates";
import { OPEN_SOVRANO_LOG_EVENT, SOVRANO_KEY } from "@/lib/sovrano";
import type { SovranoClock, SovranoProjectOption } from "@/lib/sovranoData";
import { studiedMs } from "@/lib/ultraFocus";
import { Portal } from "@/lib/hooks/useModal";
import { SovranoLogDialog } from "./SovranoLogDialog";

const HOLD_MS = 2400;
const OUT_MS = 240;

/**
 * Sovrano's timer: paid work, in both apps. It's the study bar's cousin, not
 * its twin - bottom-left rather than centred, teal rather than either app's
 * accent, squarer, and labelled - so a glance never confuses earning with
 * studying. Idle, it's a small chip.
 *
 * ⌥W starts a session from anywhere (it fires while typing, like ⌥S). With
 * one going, ⌥W opens the log dialog - stopping always goes through it. The
 * start time is server state, so the clock is derived on every tick and a
 * reload or a crash can't lose it. Starting either timer pauses the other
 * (lib/sovranoData.ts).
 *
 * `stacked` lifts it above Studio's centred bar on a phone, where the two
 * would otherwise overlap.
 */
export function SovranoBar({
  clock,
  projects,
  stacked = false,
  ownsTitle = true,
}: {
  clock: SovranoClock | null;
  projects: SovranoProjectOption[];
  stacked?: boolean;
  /** False in Studio while a study session is running and not paused. */
  ownsTitle?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const [logging, setLogging] = useState(false);
  const [notice, setNotice] = useState<{ label: string; leaving: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);

  const startMs = clock ? new Date(clock.startedAt).getTime() : null;
  const pausedAtMs = clock?.pausedAt ? new Date(clock.pausedAt).getTime() : null;
  const pausedMs = clock?.pausedMs ?? 0;
  const running = startMs != null;
  const paused = pausedAtMs != null;

  useEffect(() => {
    if (startMs == null) return setElapsed(0);
    const c = { startedAt: new Date(startMs), pausedAt: pausedAtMs == null ? null : new Date(pausedAtMs), pausedMs };
    const tick = () => setElapsed(studiedMs(c) / 1000);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startMs, pausedAtMs, pausedMs]);

  // The running clock in the tab title, as the study bar does - put back as
  // it was when the session stops or pauses.
  const before = useRef<string | null>(null);
  const titled = running && !paused && ownsTitle;
  useEffect(() => {
    if (!titled) return;
    if (before.current == null) before.current = document.title;
    document.title = `${fmtClock(elapsed)} · Working`;
  }, [titled, elapsed]);
  useEffect(() => {
    if (titled || before.current == null) return;
    document.title = before.current;
    before.current = null;
  }, [titled]);

  // A session that ends elsewhere (another tab) takes the dialog with it.
  useEffect(() => {
    if (!running) setLogging(false);
  }, [running]);

  const showNotice = (label: string) => {
    timers.current.forEach(clearTimeout);
    setNotice({ label, leaving: false });
    timers.current = [
      window.setTimeout(() => setNotice((n) => n && { ...n, leaving: true }), HOLD_MS),
      window.setTimeout(() => setNotice(null), HOLD_MS + OUT_MS),
    ];
  };

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { fresh } = await startSovrano();
      showNotice(fresh ? "Work started" : "Already working");
      router.refresh();
    } finally {
      busy.current = false;
    }
  };

  // Read at keypress time, so the listener needn't re-bind on every tick.
  const live = useRef({ running, start });
  live.current = { running, start };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `code`, not `key`: Option+W types "∑" on a Mac.
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyW") return;
      e.preventDefault();
      if (live.current.running) setLogging(true);
      else void live.current.start();
    };
    const onOpen = () => live.current.running && setLogging(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SOVRANO_LOG_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SOVRANO_LOG_EVENT, onOpen);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <>
      <div
        className={clsx(
          "pointer-events-none fixed left-0 z-50 flex px-4",
          stacked ? "bottom-[84px] sm:bottom-5" : "bottom-5",
        )}
      >
        {running ? (
          <div
            className={clsx(
              "pointer-events-auto flex items-center gap-2.5 rounded-[12px] border bg-n-0/95 py-1.5 pl-1.5 pr-2 backdrop-blur-md",
              paused ? "border-n-200" : "border-sov-200",
            )}
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <button
              onClick={() => setLogging(true)}
              disabled={pending}
              className="group flex h-8 w-8 items-center justify-center rounded-[8px] bg-sov-500 transition-colors duration-[120ms] hover:bg-sov-600 disabled:opacity-50"
              aria-label="Stop and log this work session"
              title={`Stop and log (${SOVRANO_KEY})`}
            >
              <span className="h-2.5 w-2.5 rounded-[2px] bg-white transition-transform duration-[180ms] group-hover:scale-90" />
            </button>
            <div className="flex flex-col">
              <span className="text-[9.5px] font-bold uppercase leading-3 tracking-[0.12em] text-sov-600">
                Sovrano{paused && <span className="text-n-400"> · paused</span>}
              </span>
              <span
                className={clsx(
                  "font-num text-[16px] font-semibold leading-5 tracking-tight tabular-nums",
                  paused ? "text-n-400" : "text-n-900",
                )}
              >
                {fmtClock(elapsed)}
              </span>
            </div>
            <button
              onClick={() => act(paused ? resumeSovrano : pauseSovrano)}
              disabled={pending}
              aria-label={paused ? "Resume work" : "Pause work"}
              title={paused ? "Resume (pauses study if it's running)" : "Pause"}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-sov-600 transition-colors duration-[120ms] hover:bg-sov-50 disabled:opacity-50"
            >
              {paused ? (
                <svg width="10" height="11" viewBox="0 0 12 13" fill="none" aria-hidden>
                  <path d="M1.5 1.8v9.4a.6.6 0 0 0 .92.5l7.4-4.7a.6.6 0 0 0 0-1L2.42 1.3a.6.6 0 0 0-.92.5Z" fill="currentColor" />
                </svg>
              ) : (
                <svg width="10" height="11" viewBox="0 0 10 11" fill="none" aria-hidden>
                  <rect x="1" y="1" width="2.6" height="9" rx=".8" fill="currentColor" />
                  <rect x="6.4" y="1" width="2.6" height="9" rx=".8" fill="currentColor" />
                </svg>
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={() => void start()}
            disabled={pending}
            title={`Start a Sovrano work session (${SOVRANO_KEY}, from anywhere)`}
            className="pointer-events-auto group flex h-8 items-center gap-2 rounded-[10px] border border-n-200 bg-n-0/90 pl-2 pr-2.5 text-[12px] font-semibold text-n-600 backdrop-blur-md transition-colors duration-[120ms] hover:border-sov-200 hover:text-sov-700"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-sov-500 transition-transform duration-[180ms] group-hover:scale-105">
              <svg width="7" height="8" viewBox="0 0 12 13" fill="none" aria-hidden>
                <path d="M1.5 1.8v9.4a.6.6 0 0 0 .92.5l7.4-4.7a.6.6 0 0 0 0-1L2.42 1.3a.6.6 0 0 0-.92.5Z" fill="white" />
              </svg>
            </span>
            Work
            <kbd className="font-num hidden rounded-[4px] border border-n-200 px-1 text-[10px] font-medium leading-[15px] text-n-400 sm:inline">{SOVRANO_KEY}</kbd>
          </button>
        )}
      </div>

      {notice && (
        <Portal>
          {/* Above lecture focus mode (z-60/65) like ⌥S's notice; below dialogs. */}
          <div
            className={clsx("pointer-events-none fixed left-0 z-[66] flex px-4", stacked ? "bottom-[132px] sm:bottom-[68px]" : "bottom-[68px]")}
            role="status"
            aria-live="polite"
          >
            <div
              className={clsx(
                notice.leaving ? "animate-sink-out" : "animate-rise-in",
                "flex h-8 items-center gap-2 rounded-[10px] border border-sov-200 bg-n-0/95 pl-3 pr-3.5 backdrop-blur-md",
              )}
              style={{ boxShadow: "var(--shadow-pop)" }}
            >
              <span aria-hidden className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-sov-500" />
              <span className="text-[12.5px] font-semibold text-n-800">{notice.label}</span>
            </div>
          </div>
        </Portal>
      )}

      {logging && startMs != null && (
        <SovranoLogDialog
          trackedMinutes={Math.max(0, Math.round(elapsed / 60))}
          projects={projects}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
