"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LiveEditor } from "./editor/LiveEditor";
import { clsx } from "@/lib/clsx";

/**
 * A markdown field for meeting agendas, meeting notes and paper notes.
 *
 * It's the lecture editor in a box: live blocks, the `[` insert menu, tables
 * as grids, callouts, maths - with the same Live / Markdown switch. `save` is
 * a server action (usually bound to the record's id) and runs on the editor's
 * own debounce, so there's nothing to press.
 */
export function MarkdownField({
  initial,
  save,
  placeholder,
  minHeight = 180,
  toolbar,
  value: controlled,
  onValueChange,
}: {
  initial: string;
  save: (markdown: string) => Promise<unknown>;
  placeholder?: string;
  minHeight?: number;
  /** Extra buttons beside the mode switch (e.g. "Draft from recent work"). */
  toolbar?: (api: { setValue: (v: string) => void; value: string }) => React.ReactNode;
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(controlled ?? initial);
  const [raw, setRaw] = useState(false);
  const [saved, setSaved] = useState(true);
  const [pending, startTransition] = useTransition();
  /** Bumped to remount the editor when the value is replaced from outside. */
  const [version, setVersion] = useState(0);
  const lastSaved = useRef(initial);
  const host = useRef<HTMLDivElement>(null);

  // ⌘/ switches modes, but only for the field the caret is actually in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "/") return;
      if (!host.current?.contains(document.activeElement)) return;
      e.preventDefault();
      setRaw((r) => !r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The parent can replace the text wholesale - "draft an agenda" does. The
  // editor holds its own blocks, so it has to be rebuilt when that happens.
  useEffect(() => {
    if (controlled === undefined || controlled === value) return;
    setValue(controlled);
    setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled]);

  const persist = (text: string) => {
    setValue(text);
    onValueChange?.(text);
    if (text === lastSaved.current) {
      setSaved(true);
      return;
    }
    setSaved(false);
    startTransition(async () => {
      await save(text);
      lastSaved.current = text;
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div ref={host} className="overflow-hidden rounded-md border border-n-200 bg-n-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-n-100 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-n-200 p-0.5" role="group" aria-label="Editing mode">
            {([["Live", false], ["Markdown", true]] as const).map(([label, mode]) => (
              <button
                key={label}
                type="button"
                onClick={() => setRaw(mode)}
                aria-pressed={raw === mode}
                title={`${label} (⌘/)`}
                className={clsx(
                  "rounded-[5px] px-2 py-0.5 text-[11.5px] font-semibold transition-colors duration-[120ms]",
                  raw === mode ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {toolbar?.({
            value,
            setValue: (v) => {
              setValue(v);
              setVersion((n) => n + 1);
              persist(v);
            },
          })}
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-n-400">
          <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", pending || !saved ? "bg-warn" : "bg-ok")} />
          {pending ? "Saving…" : saved ? "Saved" : "Unsaved"}
        </span>
      </div>

      <div className="px-2 py-1.5" style={{ minHeight }}>
        <LiveEditor
          key={version}
          initial={value}
          onSave={persist}
          onSavedChange={setSaved}
          raw={raw}
          onRawChange={setRaw}
          minRows={3}
          placeholder={placeholder ?? "Write here. Press [ for headings, lists, tables and callouts."}
        />
      </div>
    </div>
  );
}
