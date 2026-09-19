"use client";

import { useEffect, useRef, useState } from "react";
import type { NowPlaying as NowPlayingData } from "@/lib/spotify";
import { clsx } from "@/lib/clsx";

/** How often to ask Spotify what's playing while the tab is visible. */
const POLL_MS = 15_000;

/**
 * Currently playing on Spotify, sat beside the timer.
 *
 * Polls every 15s while the tab is visible and interpolates the progress bar
 * in between, so it moves smoothly without hammering the API. Hides itself
 * entirely when Spotify isn't connected or nothing is playing.
 */
export function NowPlaying({ studying = false }: { studying?: boolean }) {
  const [data, setData] = useState<NowPlayingData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);
  const studyingRef = useRef(studying);
  studyingRef.current = studying;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      // While studying, keep polling in a hidden tab too — each poll records
      // what's playing for the session. Browsers slow hidden timers to about
      // once a minute, which still catches most tracks.
      if (inFlight.current || (document.hidden && !studyingRef.current)) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/spotify/now-playing", { cache: "no-store" });
        const next = (await res.json()) as NowPlayingData;
        // Stamp with client time so interpolation isn't skewed by server clock.
        setData(next.state === "playing" || next.state === "paused" ? { ...next, fetchedAt: Date.now() } : next);
      } catch {
        /* network blip — keep showing the last known track */
      } finally {
        inFlight.current = false;
      }
    };

    poll();
    timer = setInterval(poll, POLL_MS);
    const onVisible = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Tick once a second for a smooth progress bar between polls.
  useEffect(() => {
    if (data?.state !== "playing") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [data?.state]);

  if (!data || (data.state !== "playing" && data.state !== "paused")) return null;

  const elapsed = data.state === "playing" ? now - data.fetchedAt : 0;
  const progress = data.durationMs > 0 ? Math.min(1, (data.progressMs + elapsed) / data.durationMs) : 0;
  const playing = data.state === "playing";

  return (
    <a
      href={data.url ?? "https://open.spotify.com"}
      target="_blank"
      rel="noreferrer noopener"
      title={`${data.title} - ${data.artist}`}
      className="animate-fade-in group pointer-events-auto hidden max-w-[260px] items-center gap-2.5 rounded-full border border-n-200 bg-n-0/95 py-1.5 pl-1.5 pr-3.5 backdrop-blur-md transition-colors duration-[120ms] hover:border-n-300 sm:flex"
      style={{ boxShadow: "var(--shadow-pop)" }}
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-n-100">
        {data.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.imageUrl}
            alt=""
            className={clsx(
              "h-full w-full object-cover",
              // A slow turn while playing, like a record — paused stops it.
              playing && "animate-[spin_18s_linear_infinite] motion-reduce:animate-none",
            )}
          />
        )}
        <span aria-hidden className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-n-0/70 bg-n-0/90" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <Bars playing={playing} />
          <span className="truncate text-[12px] font-semibold leading-4 text-n-800">{data.title}</span>
        </span>
        <span className="block truncate text-[11px] leading-4 text-n-500">{data.artist}</span>
        <span aria-hidden className="mt-1 block h-[2px] w-full overflow-hidden rounded-full bg-n-100">
          <span
            className="block h-full rounded-full bg-rust-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      </span>
    </a>
  );
}

/** Three little equaliser bars: bouncing while playing, flat when paused. */
function Bars({ playing }: { playing: boolean }) {
  return (
    <span aria-label={playing ? "Playing" : "Paused"} className="flex h-2.5 shrink-0 items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={clsx("w-[2px] rounded-full bg-rust-500", playing ? "animate-eq" : "h-[3px] opacity-50")}
          style={playing ? { animationDelay: `${i * 160}ms` } : undefined}
        />
      ))}
    </span>
  );
}
