"use client";

import { useEffect, useRef, useState } from "react";
import type { Insert } from "@/lib/editor/blocks";
import { clsx } from "@/lib/clsx";

/**
 * The `[` menu: pick a block instead of remembering its markdown.
 *
 * It sits under the caret's line and listens on the window, because the
 * textarea keeps focus the whole time - typing filters, arrows move,
 * Enter inserts, Escape closes and leaves the `[` alone.
 */
export function InsertMenu({
  items,
  onChoose,
  onClose,
}: {
  items: Insert[];
  onChoose: (insert: Insert) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // A shorter list can leave the cursor past the end.
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The menu owns these keys completely. Stopping propagation here matters:
      // this listener runs in the capture phase, and without it the same Enter
      // would go on to reach the editor and split the block underneath.
      const own = ["Escape", "ArrowDown", "ArrowUp", "Enter", "Tab"];
      if (!own.includes(e.key)) return;
      if (e.key !== "Escape" && items.length === 0) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        setIndex((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % items.length);
      } else {
        onChoose(items[index]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [items, index, onChoose, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (items.length === 0) {
    return (
      <div className="animate-scale-in absolute left-2 top-full z-30 mt-1 rounded-lg border border-n-200 bg-n-0 px-3 py-2 text-[12px] text-n-400 shadow-[var(--shadow-pop)]">
        Nothing matches - Esc to keep typing
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Insert"
      className="animate-scale-in absolute left-2 top-full z-30 mt-1 max-h-[260px] w-[260px] overflow-y-auto rounded-lg border border-n-200 bg-n-0 p-1 shadow-[var(--shadow-pop)]"
    >
      {items.map((item, i) => (
        <button
          key={item.key}
          role="option"
          aria-selected={i === index}
          data-active={i === index}
          // mousedown, not click: click would blur the textarea first.
          onMouseDown={(e) => {
            e.preventDefault();
            onChoose(item);
          }}
          onMouseEnter={() => setIndex(i)}
          className={clsx(
            "flex w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors duration-[100ms]",
            i === index ? "bg-rust-50" : "hover:bg-n-50",
          )}
        >
          <span className="text-[13px] font-medium text-n-800">{item.label}</span>
          <span className="font-num ml-auto truncate text-[11px] text-n-400">{item.hint}</span>
        </button>
      ))}
    </div>
  );
}
