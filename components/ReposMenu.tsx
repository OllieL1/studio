"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RepoMenuEntry, RepoPulse } from "@/lib/githubData";
import { repoUrl } from "@/lib/repos";
import { fmtAgo } from "@/lib/dates";
import { clsx } from "@/lib/clsx";
import { GitHubMark } from "./GitHubMark";

const PULSE_MS = 5 * 60_000;

/**
 * The Repos menu. On a wide screen it's a "Repos" item beside Courses that
 * opens on hover, like Courses does; narrower, it's the GitHub mark beside
 * search and opens on click.
 *
 * Each row links straight to GitHub. Open issues, PRs and the last push are
 * fetched the first time the menu opens (and at most every five minutes
 * after), so the nav itself never waits on GitHub.
 */
export function ReposMenu({ repos, variant, active }: { repos: RepoMenuEntry[]; variant: "label" | "icon"; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState<{ at: number; connected: boolean; byRepo: Map<string, RepoPulse> } | null>(null);
  const loading = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loading.current || (pulse && Date.now() - pulse.at < PULSE_MS)) return;
    loading.current = true;
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((d: { connected: boolean; repos: RepoPulse[] }) =>
        setPulse({ at: Date.now(), connected: d.connected, byRepo: new Map(d.repos.map((p) => [p.fullName.toLowerCase(), p])) }),
      )
      .catch(() => {})
      .finally(() => { loading.current = false; });
  }, [open, pulse]);

  // The icon variant opens on click, so it closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!open || variant !== "icon") return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, variant]);

  const hover = variant === "label" ? { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) } : {};

  return (
    <div ref={root} className="relative" {...hover}>
      {variant === "label" ? (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={clsx(
            "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-[120ms]",
            active ? "bg-rust-100 text-rust-700" : "text-n-600 hover:bg-n-50 hover:text-n-800",
          )}
        >
          Repos
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={clsx("transition-transform duration-[180ms]", open && "rotate-180")}>
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Repos"
          title="Repos"
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-[120ms]",
            open || active ? "bg-n-100 text-n-800" : "text-n-500 hover:bg-n-100/60 hover:text-n-800",
          )}
        >
          <GitHubMark size={15} />
        </button>
      )}

      {open && (
        <div className={clsx("animate-scale-in absolute top-full w-80 pt-1.5", variant === "label" ? "left-0 origin-top-left" : "right-0 origin-top-right")}>
          <div className="rounded-lg border border-n-100 bg-n-0 p-1 shadow-[var(--shadow-pop)]">
            {repos.length === 0 ? (
              <p className="px-2.5 py-3 text-[12.5px] text-n-500">No repos yet.</p>
            ) : (
              repos.map((r) => {
                const p = pulse?.byRepo.get(r.fullName.toLowerCase());
                return (
                  <div key={r.fullName} className="group flex items-center rounded-md transition-colors duration-[120ms] hover:bg-n-50">
                    <a
                      href={repoUrl(r.fullName)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpen(false)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2"
                    >
                      <span className={clsx("shrink-0", r.isProject ? "text-rust-500" : "text-n-400")}><GitHubMark size={14} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-medium text-n-800">{r.label}</span>
                          {p && <PulseText p={p} />}
                        </span>
                        <span className="font-num block truncate text-[10.5px] text-n-400">{r.fullName}</span>
                      </span>
                    </a>
                    {r.isProject && (
                      <Link
                        href={"/project?tab=github" as Route}
                        onClick={() => setOpen(false)}
                        title="The project's GitHub tab in Studio"
                        className="mr-1.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-n-500 hover:bg-n-100 hover:text-rust-700"
                      >
                        In Studio
                      </Link>
                    )}
                  </div>
                );
              })
            )}
            <div className="mt-1 flex items-center justify-between border-t border-n-100 px-2.5 pb-1 pt-2 text-[11px]">
              <span className="text-n-400">{pulse && !pulse.connected ? "Connect GitHub for live counts" : "Opens on GitHub"}</span>
              <Link href={"/settings#github" as Route} onClick={() => setOpen(false)} className="font-semibold text-n-500 hover:text-rust-700">
                Manage
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PulseText({ p }: { p: RepoPulse }) {
  if ("error" in p) return <span className="shrink-0 text-[10.5px] text-n-400">{p.error === "not-found" ? "no access" : "offline"}</span>;
  const bits = [p.openPulls ? `${p.openPulls} PR${p.openPulls === 1 ? "" : "s"}` : null, p.openIssues ? `${p.openIssues} issue${p.openIssues === 1 ? "" : "s"}` : null].filter(Boolean);
  return (
    <span className="font-num shrink-0 text-[10.5px] text-n-400">
      {bits.length ? bits.join(" · ") : p.pushedAt ? fmtAgo(new Date(p.pushedAt)) : ""}
    </span>
  );
}
