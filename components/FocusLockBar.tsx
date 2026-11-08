"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * What stands in for the nav while ultra focus is on: what Studio is locked
 * to, and how long is left. Nothing to click but the way back to the locked
 * page. When the time runs out it refreshes, the server sees no lock, and
 * the full Studio comes back.
 */
export function FocusLockBar({
  until,
  course,
  home,
}: {
  until: string;
  course: { name: string; colour: string; isProject: boolean };
  home: string;
}) {
  const router = useRouter();
  const end = new Date(until).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));

  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      if (ms === 0) {
        clearInterval(id);
        router.refresh();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [end, router]);

  return (
    <header className="animate-fade-in sticky top-0 z-40 border-b border-n-100 bg-n-25/85 backdrop-blur-md">
      <div className="mx-auto flex h-12 w-full max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
        <Link href={home as Route} className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-n-800 hover:text-rust-700">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: course.colour }} />
          <span className="truncate">{course.isProject ? "Project" : course.name}</span>
        </Link>
        <span className="flex items-center gap-2 text-[12px] font-medium text-n-500" title="Ends when the time's up or the session does">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="text-rust-500">
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="8" cy="8" r="1" fill="currentColor" />
          </svg>
          Ultra focus
          <span className="font-num text-[13px] font-semibold text-n-800 tabular-nums">{fmtLeft(left)}</span>
          left
        </span>
      </div>
    </header>
  );
}

/** "1h 05m", "42m", and the last minute in seconds - it's worth watching. */
function fmtLeft(ms: number): string {
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
  const m = Math.ceil(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
