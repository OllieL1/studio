"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseTagInput } from "@/lib/tags";
import { Portal } from "@/lib/hooks/useModal";
import { clsx } from "@/lib/clsx";

type Option = { name: string; create: boolean };

/**
 * Tags on a paper or a note.
 *
 * Typing filters the tags that already exist, so the same idea doesn't end up
 * spelled three ways; Enter takes the highlighted one. Creating is always
 * available as the last entry, so a genuinely new tag is one arrow key away
 * rather than a different gesture.
 *
 * The list is portalled because both places it's used sit inside a card that
 * clips its own box.
 */
export function TagPicker({
  selected,
  all,
  onChange,
  compact = false,
}: {
  selected: string[];
  all: string[];
  onChange: (tags: string[]) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const has = (name: string) => selected.some((t) => t.toLowerCase() === name.toLowerCase());
  const typed = draft.trim().replace(/^#/, "");

  const options = useMemo<Option[]>(() => {
    const q = typed.toLowerCase();
    const matches = all
      .filter((t) => !has(t))
      .filter((t) => (q ? t.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      })
      .slice(0, 6)
      .map((name) => ({ name, create: false }));

    // Only offer to create what isn't already on the list or on the record.
    const exists = all.some((t) => t.toLowerCase() === q) || has(typed);
    return typed && !exists ? [...matches, { name: typed, create: true }] : matches;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, typed, selected]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ left: Math.min(rect.left, window.innerWidth - 218), top: rect.bottom + 4 });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, options.length]);

  const add = (name: string) => {
    const [clean] = parseTagInput(name);
    setDraft("");
    setIndex(0);
    if (!clean || has(clean)) return;
    onChange([...selected, clean]);
    input.current?.focus();
  };

  const remove = (name: string) => onChange(selected.filter((t) => t !== name));

  return (
    <div className={clsx("flex flex-wrap items-center gap-1.5", compact ? "text-[11.5px]" : "text-[12px]")}>
      {selected.map((t) => (
        <span key={t} className="group/tag flex items-center gap-1 rounded-full bg-info-soft px-2 py-1 font-medium text-info">
          #{t}
          <button
            onClick={() => remove(t)}
            aria-label={`Remove ${t}`}
            className="rounded-full px-0.5 opacity-50 transition-opacity duration-[120ms] hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}

      <input
        ref={input}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          setIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          const pick = options[Math.min(index, options.length - 1)];
          if (e.key === "ArrowDown" && options.length) {
            e.preventDefault();
            setIndex((i) => (i + 1) % options.length);
          } else if (e.key === "ArrowUp" && options.length) {
            e.preventDefault();
            setIndex((i) => (i - 1 + options.length) % options.length);
          } else if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(pick?.name ?? typed);
          } else if (e.key === "Backspace" && !draft && selected.length) {
            remove(selected[selected.length - 1]);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        placeholder={selected.length ? "Add tag" : "Add a tag…"}
        aria-label="Add a tag"
        role="combobox"
        aria-expanded={open && options.length > 0}
        className="h-7 w-[120px] rounded-full border border-dashed border-n-200 bg-transparent px-2.5 outline-none focus:border-rust-400"
      />

      {open && options.length > 0 && pos && (
        <Portal>
          <div
            role="listbox"
            className="animate-scale-in fixed z-[90] w-[210px] rounded-lg border border-n-200 bg-n-0 p-1 shadow-[var(--shadow-pop)]"
            style={{ left: pos.left, top: pos.top }}
          >
            {options.map((o, i) => (
              <button
                key={`${o.create}:${o.name}`}
                role="option"
                aria-selected={i === index}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(o.name);
                }}
                onMouseEnter={() => setIndex(i)}
                className={clsx(
                  "block w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] transition-colors duration-[100ms]",
                  o.create && "font-medium text-rust-600",
                  i === index ? "bg-rust-50" : "hover:bg-n-50",
                  !o.create && (i === index ? "text-n-800" : "text-n-600"),
                )}
              >
                {o.create ? `Create #${o.name}` : `#${o.name}`}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </div>
  );
}
