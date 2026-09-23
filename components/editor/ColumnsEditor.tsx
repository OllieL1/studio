"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseColumns, serializeColumns } from "@/lib/editor/blocks";
import { LiveEditor } from "./LiveEditor";

/**
 * A two-column block, edited as two panes.
 *
 * Each pane is a full editor - bullets, headings, code, maths - and the block
 * is stored as `::: columns … ||| … :::`, so raw markdown and the PDF both
 * see the same thing. The panes keep their own state while they're being
 * typed in, for the same reason the table grid does: round-tripping through
 * markdown on every keystroke eats trailing spaces.
 */
export function ColumnsEditor({
  markdown,
  onChange,
  onExit,
  onDelete,
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  /** Leave the block: "after" continues below it, "close" just renders it. */
  onExit: (where: "after" | "close") => void;
  /** Remove the whole block. */
  onDelete: () => void;
}) {
  const [left, right] = parseColumns(markdown);
  const [sides, setSides] = useState<[string, string]>([left, right]);
  const mine = useRef(markdown);
  const host = useRef<HTMLDivElement>(null);

  // Escape leaves the whole block, not just the pane - the pane's own editor
  // would otherwise swallow it and the block would stay open and unrendered.
  const exit = useCallback((where: "after" | "close") => onExit(where), [onExit]);

  const remove = useCallback(() => {
    const hasContent = sides.some((side) => side.trim());
    if (hasContent && !confirm("Delete these columns and what's in them?")) return;
    onDelete();
  }, [sides, onDelete]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!host.current?.contains(document.activeElement)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        (document.activeElement as HTMLElement | null)?.blur();
        exit("close");
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        exit("after");
      }
      // ⌘⌫ removes the block rather than a character inside a pane.
      if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        e.stopPropagation();
        remove();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [exit, remove]);

  // Clicking away renders the block, like leaving any other one.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (host.current && !host.current.contains(e.target as Node)) exit("close");
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [exit]);

  useEffect(() => {
    if (markdown === mine.current) return;
    mine.current = markdown;
    setSides(parseColumns(markdown));
  }, [markdown]);

  const set = (index: 0 | 1, value: string) => {
    const next: [string, string] = index === 0 ? [value, sides[1]] : [sides[0], value];
    setSides(next);
    const md = serializeColumns(next[0], next[1]);
    mine.current = md;
    onChange(md);
  };

  return (
    <div ref={host} data-columns className="my-1 rounded-md border border-n-200">
      <div className="grid grid-cols-2 divide-x divide-n-100">
        {([0, 1] as const).map((i) => (
          <div key={i} data-pane={i} className="min-w-0 px-2 py-1.5">
            <LiveEditor
              initial={sides[i]}
              onSave={(md) => set(i, md)}
              eager
              nested
              autoFocus={i === 0}
              placeholder={i === 0 ? "Left column" : "Right column"}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-n-100 bg-n-25 px-2 py-1">
        <button
          onClick={() => exit("after")}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-n-500 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-800"
        >
          Done
        </button>
        <button
          onClick={remove}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-n-500 transition-colors duration-[120ms] hover:bg-danger-soft hover:text-danger"
        >
          Delete columns
        </button>
        <span className="ml-auto text-[10.5px] text-n-400">⌘↵ leaves · ⌘⌫ deletes</span>
      </div>
    </div>
  );
}
