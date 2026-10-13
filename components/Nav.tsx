"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { courseHref } from "@/lib/types";
import { OPEN_PALETTE_EVENT } from "./CommandPalette";
import { Wordmark } from "./Wordmark";
import { ActiveNow } from "./ActiveNow";
import { cssColour } from "@/lib/palette";
import { MoodleIcon } from "./MoodleIcon";
import { ReposMenu } from "./ReposMenu";
import type { RepoMenuEntry } from "@/lib/githubData";

type CourseLink = { id: string; name: string; shortName: string; colour: string; code: string; isProject: boolean; moodleUrl: string | null };

/** The named links - desktop row and the mobile menu both read from this.
 *  Stats and Settings live as icons instead (see `ICON_LINKS`), so they're
 *  not repeated here. */
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/calendar", label: "Calendar" },
  { href: "/project", label: "Project" },
  { href: "/lectures", label: "Lectures" },
  { href: "/sessions", label: "Sessions" },
] as const;

/** Pages compact enough to live as an icon in the always-visible cluster,
 *  next to search - trading a label for the room it saves. */
const ICON_LINKS = [
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/stats", label: "Stats", icon: StatsIcon },
] as const;

export function Nav({ courses, repos }: { courses: CourseLink[]; repos: RepoMenuEntry[] }) {
  const pathname = usePathname();
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // A tap on a link, or a route change from anywhere else (back/forward,
  // ⌘K), should always leave the mobile menu closed behind it.
  useEffect(() => setMobileOpen(false), [pathname]);

  // Pressing anywhere outside the header, or Escape, closes the menu. This
  // can't be a full-screen backdrop inside the header: its backdrop-blur makes
  // the header the containing block for `fixed` children, so the "full-screen"
  // overlay was only ever as big as the header itself.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setMobileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-n-100 bg-n-25/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-1 px-4 sm:px-8">
        <Link href="/" className="mr-2 flex min-w-0 items-center gap-2.5 sm:mr-4">
          <Mark />
          <Wordmark className="text-[17px]" />
          {process.env.NODE_ENV === "development" && (
            <span
              title="Development server - this is a copy of your data, not the live copy on the USB stick"
              className="hidden shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7a5f16] min-[420px]:inline"
            >
              Dev copy
            </span>
          )}
          <span className="font-num hidden text-[11px] font-medium text-n-400 sm:inline">26/27</span>
        </Link>

        {/* A hamburger takes over below `lg`, in this same slot. Below that the
            links, Courses, the repo icon and the live badge can't all fit: at
            `md` the badge was squeezed to a sliver. */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className={clsx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-[120ms] lg:hidden",
            mobileOpen ? "bg-n-100 text-n-800" : "text-n-500 hover:bg-n-100 hover:text-n-700",
          )}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            {mobileOpen ? (
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-[120ms]",
                isActive(l.href)
                  ? "bg-rust-100 text-rust-700"
                  : "text-n-600 hover:bg-n-50 hover:text-n-800",
              )}
            >
              {l.label}
            </Link>
          ))}

          <div
            className="relative"
            onMouseEnter={() => setCoursesOpen(true)}
            onMouseLeave={() => setCoursesOpen(false)}
          >
            <button
              onClick={() => setCoursesOpen((v) => !v)}
              aria-expanded={coursesOpen}
              className={clsx(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-[120ms]",
                pathname.startsWith("/courses")
                  ? "bg-rust-100 text-rust-700"
                  : "text-n-600 hover:bg-n-50 hover:text-n-800",
              )}
            >
              Courses
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none"
                className={clsx("transition-transform duration-[180ms]", coursesOpen && "rotate-180")}
              >
                <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {coursesOpen && (
              <div className="animate-scale-in absolute left-0 top-full w-64 origin-top-left pt-1.5">
                <div className="rounded-lg border border-n-100 bg-n-0 p-1 shadow-[var(--shadow-pop)]">
                  {courses.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center rounded-md transition-colors duration-[120ms] hover:bg-n-50"
                    >
                      <Link
                        href={courseHref(c) as Route}
                        onClick={() => setCoursesOpen(false)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-[13px] text-n-700"
                      >
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: cssColour(c.colour) }}
                        />
                        <span className="truncate font-medium">{c.name}</span>
                      </Link>
                      {c.moodleUrl && (
                        <a
                          href={c.moodleUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setCoursesOpen(false)}
                          title={`${c.shortName || c.name} on Moodle`}
                          aria-label={`Open ${c.name} on Moodle`}
                          className="mr-1.5 shrink-0 rounded-[5px] transition-[filter] duration-[120ms] hover:brightness-90"
                        >
                          <MoodleIcon size={20} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Beside Courses when there's room; next to search when there isn't. */}
          <div className="hidden min-[1100px]:block">
            <ReposMenu repos={repos} variant="label" />
          </div>
        </nav>

        {/* Settings, Stats and search as icons to save the room their words
            took, then whatever's on right now - the one time-sensitive
            thing here - anchored at the very end, visible at every width. */}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {/* Repos is a word beside Courses when there's room (above); this
              is the same menu as an icon when there isn't. */}
          <div className="min-[1100px]:hidden">
            <ReposMenu repos={repos} variant="icon" />
          </div>
          <SearchHint />
          {ICON_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              title={l.label}
              aria-label={l.label}
              className={clsx(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-[120ms]",
                isActive(l.href)
                  ? "bg-rust-100 text-rust-700"
                  : "text-n-500 hover:bg-n-100 hover:text-n-700",
              )}
            >
              <l.icon />
            </Link>
          ))}
          <ActiveNow />
        </div>
      </div>

      {mobileOpen && (
        <nav className="animate-fade-in max-h-[calc(100vh-56px)] overflow-y-auto border-t border-n-100 bg-n-0 px-4 py-2 lg:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "block rounded-md px-3 py-2.5 text-[14px] font-medium transition-colors duration-[120ms]",
                isActive(l.href) ? "bg-rust-100 text-rust-700" : "text-n-700 hover:bg-n-50",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/** Wordmark: a small progress-ring, echoing what the app is about. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden className="shrink-0">
      <circle cx="11" cy="11" r="8.5" stroke="var(--color-n-200)" strokeWidth="3" />
      <circle
        cx="11" cy="11" r="8.5"
        stroke="var(--color-rust-500)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray="53.4" strokeDashoffset="17"
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

/** Opens the ⌘K palette. Icon-only - the label cost more room than it was
 *  worth once search sat alongside two other icons and a badge. */
function SearchHint() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-n-500 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-700"
      aria-label="Search"
      title="Search"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="4" r="1.7" fill="currentColor" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6" cy="8" r="1.7" fill="currentColor" />
      <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.3" y="9" width="2.7" height="4.5" rx="0.8" fill="currentColor" />
      <rect x="6.65" y="5.5" width="2.7" height="8" rx="0.8" fill="currentColor" />
      <rect x="11" y="2.5" width="2.7" height="11" rx="0.8" fill="currentColor" />
    </svg>
  );
}
