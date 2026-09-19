"use client";

import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import type { SearchHit } from "@/app/api/search/route";

/** Dispatched on window by anything that wants to open the palette. */
export const OPEN_PALETTE_EVENT = "open-command-palette";

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  course: "Course",
  lecture: "Lecture",
  task: "Task",
  note: "In notes",
  page: "Go to",
  paper: "Paper",
  meeting: "Meeting",
};

/**
 * ⌘K / Ctrl-K global search.
 *
 * Searches courses, lectures, tasks and the full text of typed notes. Opens
 * from anywhere, navigable entirely from the keyboard, and closes on Escape.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // Open on ⌘K / Ctrl-K from anywhere, including from inside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
    } else {
      setQ("");
      setHits([]);
    }
  }, [open]);

  // Debounced search. A sequence number guards against an older, slower
  // response overwriting a newer one.
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (mine === seq.current) {
          setHits(data.hits ?? []);
          setActive(0);
        }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 130);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    router.push(hit.href as Route);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <ModalLock onClose={() => setOpen(false)} initialFocus={inputRef}>
    <Portal>
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center bg-n-900/25 px-4 pt-[12vh] backdrop-blur-[2px]"
      {...backdropProps(() => setOpen(false))}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div
        className="animate-scale-in w-full max-w-[600px] overflow-hidden rounded-lg border border-n-200 bg-n-0"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        {/* No divider under the field — with the dialog's own outline it boxed
            the input into a strip and made it feel cramped. Horizontal padding
            stays at 16px so the field aligns with the result rows below
            (6px list padding + 10px row padding). */}
        <div className="flex h-[72px] items-center gap-3 px-4">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
            <circle cx="7" cy="7" r="4.6" stroke="var(--color-n-400)" strokeWidth="1.6" />
            <path d="M10.6 10.6L14 14" stroke="var(--color-n-400)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search courses, lectures, tasks, notes…"
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-n-800 outline-none placeholder:text-n-400"
            aria-label="Search"
          />
          {/* Fixed width so the esc hint doesn't shift as results load. */}
          <span
            aria-hidden
            className={clsx(
              "w-3 shrink-0 text-center text-[11px] text-n-400 transition-opacity duration-[120ms]",
              loading ? "opacity-100" : "opacity-0",
            )}
          >
            …
          </span>
          <kbd className="font-num shrink-0 rounded border border-n-200 bg-n-50 px-1.5 py-0.5 text-[10px] font-medium text-n-500">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {q.trim() === "" ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-n-400">
              Type to search across every course, lecture, task and note.
            </p>
          ) : hits.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-n-400">
              Nothing found for “{q}”.
            </p>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.type}-${h.id}`}
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={clsx(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-[80ms]",
                  i === active ? "bg-rust-50" : "hover:bg-n-50",
                )}
              >
                <span
                  aria-hidden
                  className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                  style={{ background: h.colour ?? "var(--color-n-300)" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[13.5px] font-medium text-n-800">{h.title}</span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-n-400">
                      {TYPE_LABEL[h.type]}
                    </span>
                  </span>
                  {h.subtitle && (
                    <span className="mt-0.5 block truncate text-[11.5px] text-n-500">{h.subtitle}</span>
                  )}
                  {h.excerpt && (
                    <span className="mt-1 block truncate border-l-2 border-n-200 pl-2 text-[11.5px] italic text-n-500">
                      {h.excerpt}
                    </span>
                  )}
                </span>
                {i === active && (
                  <kbd className="font-num mt-0.5 shrink-0 rounded border border-n-200 bg-n-0 px-1.5 py-0.5 text-[10px] text-n-500">
                    ↵
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
    </Portal>
    </ModalLock>
  );
}
