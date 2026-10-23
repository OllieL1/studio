"use client";

import { useEffect, useRef } from "react";
import { isTypingTarget } from "@/lib/livio/keys";
import { Kbd } from "./Kbd";

/**
 * "Deleted Google · Undo". Deleting never asks first - it tells you after, and
 * gives you a few seconds (and the `u` key) to take it back.
 */
export function UndoToast({ message, onUndo, onDone, ms = 6000 }: {
  message: string;
  onUndo: () => void;
  onDone: () => void;
  ms?: number;
}) {
  // Held in refs so the countdown runs once per message, not once per render.
  const actions = useRef({ onUndo, onDone });
  actions.current = { onUndo, onDone };

  useEffect(() => {
    const t = setTimeout(() => actions.current.onDone(), ms);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "u" && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        actions.current.onUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [message, ms]);

  return (
    <div role="status" className="animate-fade-up fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-n-100 bg-n-0 py-1.5 pl-4 pr-1.5 text-[12.5px] text-n-700 shadow-[var(--shadow-pop)]">
        <span>{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-rust-600 transition-colors hover:bg-rust-50"
        >
          Undo <Kbd>u</Kbd>
        </button>
      </div>
    </div>
  );
}
