"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { courseHref } from "@/lib/types";
import { OPEN_PALETTE_EVENT } from "./CommandPalette";
import { Wordmark } from "./Wordmark";
import { cssColour } from "@/lib/palette";

type CourseLink = { id: string; name: string; shortName: string; colour: string; code: string; isProject: boolean };

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/calendar", label: "Calendar" },
  { href: "/project", label: "Project" },
  { href: "/lectures", label: "Lectures" },
  { href: "/stats", label: "Stats" },
  { href: "/sessions", label: "Sessions" },
  { href: "/settings", label: "Settings" },
] as const;

export function Nav({ courses }: { courses: CourseLink[] }) {
  const pathname = usePathname();
  const [coursesOpen, setCoursesOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-n-100 bg-n-25/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-1 px-5 sm:px-8">
        <Link href="/" className="mr-4 flex items-center gap-2.5 shrink-0">
          <Mark />
          <Wordmark className="text-[17px]" />
          {process.env.NODE_ENV === "development" && (
            <span
              title="Development server - this is a copy of your data, not the live copy on the USB stick"
              className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7a5f16]"
            >
              Dev copy
            </span>
          )}
          <span className="font-num hidden text-[11px] font-medium text-n-400 sm:inline">26/27</span>
        </Link>

        <nav className="flex items-center gap-0.5">
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
                    <Link
                      key={c.id}
                      href={courseHref(c) as Route}
                      onClick={() => setCoursesOpen(false)}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-n-700 transition-colors duration-[120ms] hover:bg-n-50"
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: cssColour(c.colour) }}
                      />
                      <span className="truncate font-medium">{c.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>

        <SearchHint />
      </div>
    </header>
  );
}

/** Wordmark: a small progress-ring, echoing what the app is about. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
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


/** Opens the ⌘K palette. Deliberately no shortcut hint — just a quiet field
 *  that reads as search at a glance. */
function SearchHint() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      className="group ml-auto hidden h-8 w-44 items-center gap-2 rounded-full bg-n-100/60 px-3 text-[12.5px] text-n-400 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-600 sm:flex"
      aria-label="Search"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
        <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Search
    </button>
  );
}
