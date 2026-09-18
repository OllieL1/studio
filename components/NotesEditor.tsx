"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNotes } from "@/app/actions";
import { clsx } from "@/lib/clsx";

/**
 * Typed lecture notes.
 *
 * Edit / Preview rather than a split pane — at this width a side-by-side
 * preview halves the writing column for little gain. Autosaves on a debounce
 * and on blur, because losing notes would be the worst failure this app has.
 */
export function NotesEditor({
  taskId,
  initial,
  renderedInitial,
}: {
  taskId: string;
  initial: string;
  renderedInitial: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"edit" | "preview">(initial ? "preview" : "edit");
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(true);
  const [rendered, setRendered] = useState(renderedInitial);
  const [pending, startTransition] = useTransition();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [exporting, setExporting] = useState(false);

  /** Save anything unsaved, then open the print view with its dialog up —
   *  so the PDF always matches what's on screen. */
  const exportPdf = async () => {
    setExporting(true);
    if (timer.current) clearTimeout(timer.current);
    if (value !== initial || !saved) {
      await saveNotes(taskId, value);
      setSaved(true);
    }
    router.push(`/lectures/${taskId}/print?auto=1`);
  };

  const persist = (text: string) => {
    startTransition(async () => {
      await saveNotes(taskId, text);
      setSaved(true);
      router.refresh();
    });
  };

  // Debounced autosave.
  useEffect(() => {
    if (value === initial) return;
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(value), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Warn before losing an unsaved edit on navigation away.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!saved) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved]);

  // Re-render the preview server-side when switching to it, so the preview
  // uses exactly the same renderer as the printed PDF.
  const showPreview = async () => {
    setTab("preview");
    if (value === initial && rendered) return;
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: value }),
    });
    const data = await res.json();
    setRendered(data.html ?? "");
  };

  /** Tab indents rather than leaving the field — this is a writing surface. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = el;
      const next = value.slice(0, s) + "  " + value.slice(en);
      setValue(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      persist(value);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-n-100 px-3 py-2">
        <div className="flex items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5">
          <button
            onClick={() => setTab("edit")}
            className={clsx(
              "rounded-[6px] px-2.5 py-1 text-[12px] font-semibold transition-colors duration-[120ms]",
              tab === "edit" ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50",
            )}
          >
            Write
          </button>
          <button
            onClick={showPreview}
            className={clsx(
              "rounded-[6px] px-2.5 py-1 text-[12px] font-semibold transition-colors duration-[120ms]",
              tab === "preview" ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50",
            )}
          >
            Preview
          </button>
        </div>

        <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-[11px] text-n-400">
          {pending ? (
            "Saving…"
          ) : saved ? (
            <>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
              Saved
            </>
          ) : (
            <>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
              Unsaved
            </>
          )}
        </span>

        <button
          onClick={exportPdf}
          disabled={exporting || !value.trim()}
          title={value.trim() ? "Save and export these notes as a PDF" : "Write something first"}
          className="flex items-center gap-1.5 rounded-md border border-n-200 bg-n-0 px-2.5 py-1 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-800 disabled:opacity-40"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1.8v6.4M3.4 5.6 6 8.2l2.6-2.6M2 10.2h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {exporting ? "Preparing…" : "PDF"}
        </button>
        </div>
      </div>

      {tab === "edit" ? (
        <textarea
          ref={areaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!saved) {
              if (timer.current) clearTimeout(timer.current);
              persist(value);
            }
          }}
          spellCheck
          placeholder={"# Lecture title\n\nWrite your notes in markdown…\n\n- Bullet points\n- `inline code`\n\n```haskell\nfoldr :: (a -> b -> b) -> b -> [a] -> b\n```"}
          className="font-num min-h-[420px] w-full resize-y bg-transparent p-4 text-[13.5px] leading-[22px] text-n-800 outline-none placeholder:text-n-400"
        />
      ) : rendered ? (
        <div
          className="prose-notes p-5"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      ) : (
        <p className="p-8 text-center text-[13px] text-n-400">
          Nothing written yet — switch to Write and start typing.
        </p>
      )}
    </div>
  );
}
