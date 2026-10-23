"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import { Eyebrow } from "../ui";
import { Kbd } from "./Kbd";

export type FilterGroup = {
  key: string;
  label: string;
  options: { value: string; label: string; count: number }[];
};

type Item =
  | { kind: "option"; group: string; value: string; label: string; count: number }
  | { kind: "closed" };

/**
 * `:f`: what to keep, as ticks. Changes apply as they're made, so the table
 * behind shows the result straight away. ↑↓ move, Space or Enter ticks, Esc
 * closes. Ticking nothing in a group means "don't filter by it".
 */
export function FilterMenu({
  groups,
  filters,
  hideClosed,
  closedLabel,
  onChange,
  onClose,
}: {
  groups: FilterGroup[];
  filters: Record<string, string[]>;
  hideClosed: boolean;
  /** e.g. "Hide offered and rejected". Omitted when a page has no closed rows. */
  closedLabel?: string;
  onChange: (filters: Record<string, string[]>, hideClosed: boolean) => void;
  onClose: () => void;
}) {
  const items: Item[] = [
    ...groups.flatMap((g) => g.options.map((o) => ({ kind: "option" as const, group: g.key, ...o }))),
    ...(closedLabel ? [{ kind: "closed" as const }] : []),
  ];
  const [active, setActive] = useState(0);

  const isOn = (it: Item) => (it.kind === "closed" ? hideClosed : (filters[it.group] ?? []).includes(it.value));

  const toggle = (it: Item) => {
    if (it.kind === "closed") return onChange(filters, !hideClosed);
    const current = filters[it.group] ?? [];
    const next = current.includes(it.value) ? current.filter((v) => v !== it.value) : [...current, it.value];
    onChange({ ...filters, [it.group]: next }, hideClosed);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (items[active]) toggle(items[active]);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      onChange({}, false);
    }
  };

  let index = -1;
  const row = (it: Item, label: string, count?: number) => {
    index += 1;
    const i = index;
    const on = isOn(it);
    return (
      <button
        key={it.kind === "closed" ? "closed" : `${it.group}:${it.value}`}
        type="button"
        onMouseEnter={() => setActive(i)}
        onClick={() => toggle(it)}
        className={clsx("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px]", i === active && "bg-n-50")}
      >
        <span
          aria-hidden
          className={clsx(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
            on ? "border-rust-500 bg-rust-500 text-white" : "border-n-300",
          )}
        >
          {on && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5.2l2 2L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className={clsx("flex-1", on ? "text-n-800" : "text-n-600")}>{label}</span>
        {count !== undefined && <span className="font-num text-[11px] text-n-400">{count}</span>}
      </button>
    );
  };

  return (
    <ModalLock onClose={onClose}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] px-4 pt-[14vh] backdrop-blur-[2px]"
          {...backdropProps(onClose)}
          role="dialog"
          aria-modal="true"
          aria-label="Filter"
        >
          {/* Focusable so the keys work the moment it opens. */}
          <div
            tabIndex={-1}
            ref={(el) => el?.focus({ preventScroll: true })}
            onKeyDown={onKey}
            className="animate-scale-in w-full max-w-[360px] rounded-lg border border-n-100 bg-n-0 p-2 shadow-[var(--shadow-modal)] outline-none"
          >
            {groups.map((g) => (
              <div key={g.key} className="mb-1">
                <Eyebrow className="px-2.5 pb-1 pt-2">{g.label}</Eyebrow>
                {g.options.map((o) => row({ kind: "option", group: g.key, ...o }, o.label, o.count))}
              </div>
            ))}
            {closedLabel && (
              <div className="mt-1 border-t border-n-100 pt-1">{row({ kind: "closed" }, closedLabel)}</div>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-n-100 px-2.5 pt-2 pb-1 text-[11px] text-n-400">
              <span><Kbd>space</Kbd> tick</span>
              <span><Kbd>⌫</Kbd> clear all</span>
              <span><Kbd>esc</Kbd> done</span>
            </p>
          </div>
        </div>
      </Portal>
    </ModalLock>
  );
}
