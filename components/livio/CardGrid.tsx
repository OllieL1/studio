"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { isTypingTarget } from "@/lib/livio/keys";

/**
 * Rows as cards, for when a table is too much at once. Same keys as the
 * table, laid out in two dimensions: arrows (or hjkl) move between cards,
 * ↑↓ by a whole row of them. Space, o or ↵ opens one; ⌫ deletes; ⌘↵
 * follows its link. The cards themselves are the page's to draw.
 */
export function CardGrid<R>({
  rows,
  rowId,
  card,
  onOpen,
  onDelete,
  href,
  dim,
  keysActive,
  focus,
  empty,
  onRowKey,
  onCursor,
}: {
  rows: R[];
  rowId: (row: R) => string;
  card: (row: R) => React.ReactNode;
  onOpen?: (row: R) => void;
  onDelete?: (row: R) => void;
  href?: (row: R) => string | null;
  dim?: (row: R) => boolean;
  keysActive: boolean;
  focus?: { id: string; nonce: number } | null;
  empty?: React.ReactNode;
  onRowKey?: (row: R, e: KeyboardEvent) => boolean;
  onCursor?: (row: R | null) => void;
}) {
  const ids = useMemo(() => rows.map(rowId), [rows, rowId]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const handled = useRef<number | null>(null);
  const active = activeId ? ids.indexOf(activeId) : -1;
  useEffect(() => {
    onCursor?.(active >= 0 ? rows[active] : null);
    // Only when the card under the cursor changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // A card that's gone (deleted, filtered out) takes the cursor with it.
  useLayoutEffect(() => {
    if (activeId && !ids.includes(activeId)) setActiveId(null);
  }, [ids, activeId]);

  useEffect(() => {
    if (!focus || handled.current === focus.nonce || !ids.includes(focus.id)) return;
    handled.current = focus.nonce;
    select(ids.indexOf(focus.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, ids]);

  const select = (i: number) => {
    const at = Math.max(0, Math.min(rows.length - 1, i));
    setActiveId(ids[at] ?? null);
    (grid.current?.children[at] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  };

  /** How many cards sit side by side right now - read off the layout, so it
   *  follows the breakpoints without repeating them. */
  const perRow = () => {
    const cards = Array.from(grid.current?.children ?? []) as HTMLElement[];
    if (!cards.length) return 1;
    const top = cards[0].offsetTop;
    const n = cards.findIndex((c) => c.offsetTop !== top);
    return n < 0 ? cards.length : n;
  };

  useEffect(() => {
    if (!keysActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.altKey || !rows.length) return;
      const current = active >= 0 ? rows[active] : undefined;
      if (e.metaKey || e.ctrlKey) {
        const url = e.key === "Enter" && current ? href?.(current) : null;
        if (url) {
          e.preventDefault();
          window.open(url, "_blank", "noopener");
        }
        return;
      }
      const go = (i: number) => {
        e.preventDefault();
        select(i);
      };
      const at = Math.max(0, active);
      switch (e.key) {
        case "ArrowRight": case "l": case "Tab": return go(active < 0 ? 0 : at + (e.shiftKey && e.key === "Tab" ? -1 : 1));
        case "ArrowLeft": case "h": return go(at - 1);
        case "ArrowDown": case "j": return go(active < 0 ? 0 : at + perRow());
        case "ArrowUp": case "k": return go(at - perRow());
        case "g": return go(0);
        case "G": return go(rows.length - 1);
        case "Escape":
          if (activeId) { e.preventDefault(); setActiveId(null); }
          return;
      }
      if (!current) return;
      if (onRowKey?.(current, e)) {
        e.preventDefault();
        return;
      }
      if ((e.key === " " || e.key === "o" || e.key === "Enter") && onOpen) {
        e.preventDefault();
        onOpen(current);
      } else if ((e.key === "Backspace" || e.key === "Delete") && onDelete) {
        e.preventDefault();
        onDelete(current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!rows.length) return <div className="rounded-lg border border-n-100 bg-n-0">{empty}</div>;

  return (
    <div ref={grid} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r, i) => (
        <div
          key={ids[i]}
          role="button"
          tabIndex={-1}
          onMouseDown={() => setActiveId(ids[i])}
          onDoubleClick={() => onOpen?.(r)}
          className={clsx(
            "card relative cursor-default p-4 transition-shadow duration-[120ms]",
            i === active && "shadow-[inset_0_0_0_1.5px_var(--color-rust-400)]",
            dim?.(r) && "opacity-60",
          )}
        >
          {card(r)}
        </div>
      ))}
    </div>
  );
}
