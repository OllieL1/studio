"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { APP_NAME, appOf, switchHref } from "@/lib/apps";
import { useAliases } from "./Aliases";

/**
 * Studio ⇄ Livio. A quiet button beside the wordmark, and ⌘⇧Space (Ctrl⇧Space
 * on Windows) from anywhere. Not a `g g` sequence: `g` already syncs the
 * weekly schedule to Google.
 *
 * The two apps have different root layouts, so this is always a full page
 * load - a plain <a>, not a <Link>.
 */
export function AppSwitch() {
  const pathname = usePathname();
  const other = APP_NAME[appOf(pathname) === "studio" ? "livio" : "studio"];
  // `location` only exists in the browser; the path-only href is right on
  // plain localhost and is what the server renders.
  const aliases = useAliases();
  const [href, setHref] = useState(() => switchHref(pathname, { protocol: "", hostname: "", port: "" }));
  useEffect(() => setHref(switchHref(pathname, window.location, aliases)), [pathname, aliases]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        window.location.assign(switchHref(window.location.pathname, window.location, aliases));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aliases]);

  return (
    <a
      href={href}
      title={`Switch to ${other}  ⌘⇧Space`}
      aria-label={`Switch to ${other}`}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-n-400 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-700"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
