"use client";

import { useEffect, useRef, useState } from "react";
import { ModalLock, Portal } from "@/lib/hooks/useModal";
import { DAY_SHORT, fmtDuration, fmtHM, isSameDay } from "@/lib/dates";
import { Bars, type NowPlayingView } from "./NowPlaying";

/**
 * Full-screen studying mode: the time, when this session began and how long
 * it's run, and whatever's playing - big enough to read from across a desk.
 *
 * It fills the whole page rather than asking the browser for fullscreen, so
 * there's no mode change and nothing to get stuck in. Escape or the close
 * button put it away. Nothing else is on the screen: stopping the session is
 * for the timer, once you're back.
 */
export function FocusMode({
  startMs,
  elapsed,
  np,
  onClose,
}: {
  startMs: number;
  /** Seconds, ticking - owned by the timer so the two can never disagree. */
  elapsed: number;
  np: NowPlayingView;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = new Date(now);
  const [hh, mm] = fmtHM(time).split(":");
  const started = new Date(startMs);
  // A session left running overnight started on another day; say which.
  const startedLabel = isSameDay(started, time)
    ? fmtHM(started)
    : `${DAY_SHORT[(started.getDay() + 6) % 7]} ${fmtHM(started)}`;

  return (
    <ModalLock onClose={onClose} initialFocus={closeRef}>
      <Portal>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Studying mode"
          className="animate-fade-in fixed inset-0 z-[80] overflow-y-auto bg-n-25 text-n-900"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 55% at 50% 38%, color-mix(in oklab, var(--color-rust-500) 9%, transparent), transparent 70%)",
          }}
        >
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Exit studying mode"
            title="Exit (Esc)"
            className="fixed right-[max(1rem,2.5vmin)] top-[max(1rem,2.5vmin)] z-10 flex h-11 items-center gap-2 rounded-full border border-n-200 bg-n-0/70 pl-3.5 pr-3 text-n-500 backdrop-blur-sm transition-colors duration-[120ms] hover:border-n-300 hover:text-n-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-500"
          >
            <kbd className="font-num hidden text-[11px] font-medium uppercase tracking-[0.06em] text-n-400 sm:inline">esc</kbd>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="focus-body mx-auto flex min-h-full max-w-[1500px] flex-col items-center justify-center px-6 text-center">
            <p
              aria-label={`${hh}:${mm}`}
              className="focus-clock font-semibold leading-none tracking-[-0.045em] text-n-900 tabular-nums"
            >
              {hh}
              <span aria-hidden className="animate-colon mx-[0.02em] text-rust-600">:</span>
              {mm}
            </p>

            <div className="focus-lower">
              <dl className="flex items-start justify-center" style={{ gap: "clamp(1.75rem, 8vmin, 5rem)" }}>
                <Stat label="Started" value={startedLabel} />
                <Stat label="So far" value={fmtDuration(Math.floor(elapsed / 60))} />
              </dl>

              {np && <Song np={np} />}
            </div>
          </div>
        </div>
      </Portal>
    </ModalLock>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt
        className="font-semibold uppercase text-n-400"
        style={{ fontSize: "clamp(0.65rem, 1.2vmin + 0.35rem, 0.9rem)", letterSpacing: "0.16em" }}
      >
        {label}
      </dt>
      <dd
        className="mt-[0.35em] font-semibold leading-none text-n-800 tabular-nums"
        style={{ fontSize: "clamp(1.25rem, 3.2vmin + 0.5rem, 2.75rem)" }}
      >
        {value}
      </dd>
    </div>
  );
}

function Song({ np }: { np: NonNullable<NowPlayingView> }) {
  const { track, playing, progress } = np;
  const art = "clamp(3.5rem, 11vmin, 7rem)";
  return (
    <div
      className="focus-song flex items-center rounded-2xl border border-n-100 bg-n-0/60 text-left backdrop-blur-sm"
      style={{ gap: "clamp(0.75rem, 2.2vmin, 1.5rem)", padding: "clamp(0.6rem, 1.8vmin, 1.1rem)" }}
    >
      <span className="relative shrink-0 overflow-hidden rounded-xl bg-n-100" style={{ width: art, height: art }}>
        {track.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.imageUrl} alt="" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <Bars playing={playing} />
          <span
            className="truncate font-semibold leading-tight text-n-900"
            style={{ fontSize: "clamp(1rem, 2.4vmin + 0.45rem, 1.75rem)" }}
          >
            {track.title}
          </span>
        </span>
        <span
          className="mt-0.5 block truncate leading-tight text-n-500"
          style={{ fontSize: "clamp(0.85rem, 1.7vmin + 0.4rem, 1.2rem)" }}
        >
          {track.artist}
        </span>
        <span aria-hidden className="mt-[0.7em] block h-[3px] w-full overflow-hidden rounded-full bg-n-100">
          <span
            className="block h-full rounded-full bg-rust-500 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      </span>
    </div>
  );
}
