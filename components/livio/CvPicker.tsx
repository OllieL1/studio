"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import { NO_AUTOFILL } from "@/lib/livio/keys";
import { Kbd } from "./Kbd";

type Choice = { kind: "new" } | { kind: "version"; id: string } | { kind: "none" };

/**
 * `:cv` on a careers entry: tailor a new CV for it, pick one already made,
 * or untie the one it has. Type to narrow, ↑↓ and ↵ to choose.
 */
export function CvPicker({ company, role, versions, current, onChoose, onClose }: {
  company: string;
  role: string | null;
  versions: { id: string; name: string }[];
  current: string | null;
  onChoose: (c: Choice) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const proposed = [company || "Untitled", role].filter(Boolean).join(" – ");
  const options: { choice: Choice; label: string; note?: string }[] = [
    { choice: { kind: "new" }, label: `New: ${proposed}`, note: "tailor one from the master" },
    ...versions
      .filter((v) => v.name.toLowerCase().includes(q.toLowerCase()))
      .map((v) => ({ choice: { kind: "version" as const, id: v.id }, label: v.name, note: v.id === current ? "linked now" : undefined })),
    ...(current ? [{ choice: { kind: "none" as const }, label: "No CV", note: "untie this one" }] : []),
  ];

  return (
    <ModalLock onClose={onClose}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] px-4 pt-[16vh] backdrop-blur-[2px]"
          {...backdropProps(onClose)}
          role="dialog"
          aria-modal="true"
          aria-label="CV for this entry"
        >
          <div className="animate-scale-in w-full max-w-[440px] overflow-hidden rounded-lg border border-n-100 bg-n-0 shadow-[var(--shadow-modal)]">
            <div className="border-b border-n-100 px-4 pb-2 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-n-400">CV for {company || "this entry"}</p>
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  const next = e.target.value;
                  setQ(next);
                  // Typing is looking for a version: land on the first match, not on "New".
                  const matches = versions.some((v) => v.name.toLowerCase().includes(next.toLowerCase()));
                  setActive(next && matches ? 1 : 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
                  else if (e.key === "Enter") { e.preventDefault(); if (options[active]) onChoose(options[active].choice); }
                }}
                placeholder="Find a version…"
                {...NO_AUTOFILL}
                className="mt-1 h-8 w-full bg-transparent text-[14px] text-n-800 outline-none placeholder:text-n-400"
              />
            </div>
            <ul className="max-h-[320px] overflow-y-auto p-1">
              {options.map((o, i) => (
                <li key={o.choice.kind === "version" ? o.choice.id : o.choice.kind}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => onChoose(o.choice)}
                    className={clsx(
                      "flex w-full items-baseline gap-2 rounded-md px-3 py-2 text-left text-[13px]",
                      i === active ? "bg-rust-50 text-rust-700" : "text-n-700",
                      o.choice.kind === "new" && "font-semibold",
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.note && <span className="ml-auto shrink-0 text-[11.5px] font-normal text-n-400">{o.note}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <p className="flex gap-3 border-t border-n-100 px-4 py-2 text-[11px] text-n-400">
              <span><Kbd>↵</Kbd> choose</span>
              <span><Kbd>esc</Kbd> cancel</span>
            </p>
          </div>
        </div>
      </Portal>
    </ModalLock>
  );
}
