"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { clsx } from "@/lib/clsx";
import { SETTINGS_TREE, isSettingsSlug, sectionOf } from "@/lib/settingsSections";

/**
 * The Settings sidebar: a small file tree of sections, the open one on the
 * right. Groups (Connectors, Data) are folders, always expanded - there are
 * few enough that hiding any would only cost a click.
 *
 * On a phone the tree would eat the screen, so it becomes a wrapped row of
 * the same links above the section.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const current = sectionOf(pathname);

  // Settings used to be one long page with anchors (/settings#github), and
  // bookmarks or old links may still say so: send them to the section.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (pathname === "/settings" && isSettingsSlug(hash)) router.replace(`/settings/${hash}` as Route);
  }, [pathname, router]);

  const href = (slug: string) => (slug === "appearance" ? "/settings" : `/settings/${slug}`) as Route;

  return (
    <nav aria-label="Settings sections">
      {/* Phone: one wrapped row. */}
      <div className="flex flex-wrap gap-1.5 md:hidden">
        {SETTINGS_TREE.flatMap((g) => g.sections).map((s) => (
          <Link
            key={s.slug}
            href={href(s.slug)}
            aria-current={current === s.slug ? "page" : undefined}
            className={clsx(
              "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors duration-[120ms]",
              current === s.slug ? "border-transparent bg-rust-500 text-white" : "border-n-200 bg-n-0 text-n-600 hover:bg-n-50",
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* Wider: the tree. */}
      <div className="hidden space-y-3 md:block">
        {SETTINGS_TREE.map((g, gi) => (
          <div key={g.label ?? `g${gi}`}>
            {g.label && (
              <p className="mb-1 flex items-center gap-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-500">
                <FolderIcon />
                {g.label}
              </p>
            )}
            <ul className={clsx(g.label && "ml-[13px] border-l border-n-200 pl-1.5")}>
              {g.sections.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={href(s.slug)}
                    aria-current={current === s.slug ? "page" : undefined}
                    className={clsx(
                      "block rounded-md px-2 py-1.5 text-[13px] transition-colors duration-[120ms]",
                      current === s.slug ? "bg-rust-50 font-semibold text-rust-700" : "text-n-600 hover:bg-n-50 hover:text-n-900",
                    )}
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden width="11" height="11" viewBox="0 0 12 12" className="text-n-400">
      <path d="M1.5 3.2c0-.5.4-.9.9-.9h2.4l1 1.1h3.8c.5 0 .9.4.9.9v4.6c0 .5-.4.9-.9.9H2.4c-.5 0-.9-.4-.9-.9z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}
