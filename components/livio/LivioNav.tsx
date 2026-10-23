"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { LIVIO_BASE } from "@/lib/apps";
import { Wordmark } from "../Wordmark";
import { AppSwitch } from "../AppSwitch";

/** Livio's pages. Each joins this list as it's built. */
const LINKS: { href: string; label: string }[] = [
  { href: LIVIO_BASE, label: "Home" },
  { href: `${LIVIO_BASE}/todo`, label: "Todo" },
  { href: `${LIVIO_BASE}/careers`, label: "Careers" },
  { href: `${LIVIO_BASE}/reading`, label: "Reading" },
  { href: `${LIVIO_BASE}/cv`, label: "CV" },
];

/** Studio's nav, pared down: Livio has no timer, courses or repos. */
export function LivioNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === LIVIO_BASE ? pathname === LIVIO_BASE : pathname.startsWith(href));
  const prefsHref = `${LIVIO_BASE}/preferences`;

  return (
    <header className="cv-chrome sticky top-0 z-40 border-b border-n-100 bg-n-25/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-1 px-4 sm:px-8">
        <Link href={LIVIO_BASE as Route} className="flex min-w-0 items-center gap-2.5">
          <Mark />
          <Wordmark app="livio" className="text-[17px]" />
          {process.env.NODE_ENV === "development" && (
            <span
              title="Development server - this is a copy of your data, not the live copy on the USB stick"
              className="hidden shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-warn-ink min-[420px]:inline"
            >
              Dev copy
            </span>
          )}
        </Link>
        <div className="mr-1 ml-1 sm:mr-3">
          <AppSwitch />
        </div>

        {/* Few enough links to stay a row at every width; it scrolls rather
            than wraps if a phone is ever narrower than they are. */}
        <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href as Route}
              className={clsx(
                "shrink-0 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-[120ms]",
                // Hover only brightens the words: a hover pill read as a
                // second active page, the tints are that close in dark mode.
                isActive(l.href) ? "bg-rust-100 text-rust-700" : "text-n-600 hover:text-n-900",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href={prefsHref as Route}
            title="Preferences"
            aria-label="Preferences"
            className={clsx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-[120ms]",
              isActive(prefsHref) ? "bg-rust-100 text-rust-700" : "text-n-500 hover:bg-n-100 hover:text-n-700",
            )}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="10" cy="4" r="1.7" fill="currentColor" />
              <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="6" cy="8" r="1.7" fill="currentColor" />
              <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="11" cy="12" r="1.7" fill="currentColor" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Studio's mark is a progress ring; Livio's closes it - a full ring around a
 *  centre, everything in one place. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden className="shrink-0">
      <circle cx="11" cy="11" r="8.5" stroke="var(--color-rust-500)" strokeWidth="3" />
      <circle cx="11" cy="11" r="3" fill="var(--color-rust-500)" />
    </svg>
  );
}
