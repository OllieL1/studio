"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Portal } from "@/lib/hooks/useModal";
import { clsx } from "@/lib/clsx";

/**
 * The shell behind the `[` and `@` menus.
 *
 * It renders into <body> rather than inside the editor: a markdown field
 * clips its own box (rounded corners, scrolling), and a menu positioned
 * inside it got cut off. Fixed coordinates taken from the textarea keep it
 * above everything and let it flip up when it would fall off the screen.
 *
 * The textarea keeps focus throughout - typing filters, arrows move, Enter
 * chooses - so the key handling lives on the window in the capture phase,
 * where it can stop the editor seeing the same keys.
 */
export function CaretMenu<T>({
  anchor,
  items,
  itemKey,
  renderItem,
  onChoose,
  onClose,
  emptyLabel = "Nothing matches - Esc to keep typing",
  width = 280,
}: {
  /** Usually the textarea being typed in. */
  anchor: HTMLElement | null;
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T, active: boolean) => React.ReactNode;
  onChoose: (item: T) => void;
  onClose: () => void;
  emptyLabel?: string;
  width?: number;
}) {
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; flipped: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A shorter list can leave the cursor past the end.
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  // Place it under the block being typed in, or above when there's no room.
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const height = Math.min(280, Math.max(60, items.length * 34 + 12));
      const below = window.innerHeight - rect.bottom;
      const flipped = below < height + 16 && rect.top > height + 16;
      setPos({
        left: Math.min(Math.max(8, rect.left + 8), window.innerWidth - width - 8),
        top: flipped ? rect.top - height - 6 : rect.bottom + 6,
        flipped,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, items.length, width]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const own = ["Escape", "ArrowDown", "ArrowUp", "Enter", "Tab"];
      if (!own.includes(e.key)) return;
      if (e.key !== "Escape" && items.length === 0) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") setIndex((i) => (i + 1) % items.length);
      else if (e.key === "ArrowUp") setIndex((i) => (i - 1 + items.length) % items.length);
      else onChoose(items[index]);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [items, index, onChoose, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!pos) return null;

  return (
    <Portal>
      <div
        ref={listRef}
        role="listbox"
        className={clsx(
          "animate-scale-in fixed z-[90] max-h-[280px] overflow-y-auto rounded-lg border border-n-200 bg-n-0 p-1 shadow-[var(--shadow-pop)]",
          items.length === 0 && "p-0",
        )}
        style={{ left: pos.left, top: pos.top, width }}
      >
        {items.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-n-400">{emptyLabel}</p>
        ) : (
          items.map((item, i) => (
            <button
              key={itemKey(item)}
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
              {renderItem(item, i === index)}
            </button>
          ))
        )}
      </div>
    </Portal>
  );
}
