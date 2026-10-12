"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { ActiveNow as ActiveNowData } from "@/lib/calendarData";
import { cssColour } from "@/lib/palette";
import { fmtHM, fmtRelative, isSameDay } from "@/lib/dates";

/** How often to check what's on. Nothing here needs second-by-second
 *  freshness, unlike the music widget it borrows its shape from. */
const POLL_MS = 60_000;

/**
 * Whatever's on right now, or the next thing coming up if nothing is - a
 * class, a project meeting, or a uni event - sat in the header next to
 * search. Styled after `NowPlaying`: the same rounded pill, so "something's
 * on your plate" reads the same way whether it's a track or a timetable.
 *
 * Clicking it opens the thing itself. An active item clears itself the
 * moment it ends, between polls, rather than lingering stale until the next
 * fetch notices; an upcoming one just waits for the next poll to promote it.
 */
export function ActiveNow() {
  const [data, setData] = useState<ActiveNowData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/active", { cache: "no-store" });
        setData(await res.json());
      } catch {
        /* network blip — keep showing whatever was last known */
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

  // A plain tick, so the badge clears itself the moment the item ends
  // instead of waiting up to a minute for the next poll to notice.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Only an active item's clock is worth watching locally — an upcoming
  // one's start time arriving is exactly what should promote it to active,
  // which is the next poll's job, not this tick's.
  if (!data || (data.status === "active" && new Date(data.at).getTime() <= now)) return null;

  const at = new Date(data.at);
  const timeLabel =
    data.status === "active"
      ? `until ${fmtHM(at)}`
      : isSameDay(at, new Date(now))
        ? `at ${fmtHM(at)}`
        : `${fmtRelative(at)} · ${fmtHM(at)}`;

  return (
    <Link
      href={data.href as Route}
      title={data.title}
      className="animate-fade-in flex min-w-0 max-w-[150px] items-center gap-2 rounded-full border border-n-200 bg-n-0/95 py-1 pl-1 pr-2.5 backdrop-blur-md transition-colors duration-[120ms] hover:border-n-300 sm:max-w-[220px] sm:pr-3"
      style={{ boxShadow: "var(--shadow-pop)" }}
    >
      <span
        aria-hidden
        className="h-6 w-6 shrink-0 rounded-full"
        style={{ background: cssColour(data.colour) || "var(--color-rust-500)" }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold leading-4 text-n-800">{data.title}</span>
        <span className="hidden truncate text-[10.5px] leading-4 text-n-500 sm:block">
          {data.subtitle ? `${data.subtitle} · ` : ""}{timeLabel}
        </span>
      </span>
    </Link>
  );
}
