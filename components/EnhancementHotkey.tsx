"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addEnhancement } from "@/app/enhancementActions";
import { clsx } from "@/lib/clsx";
import { KIND_LABEL, KINDS, nextKind, prefixKind, type EnhancementKind } from "@/lib/enhancements";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";

/** Dispatched on window to open the composer from a button (Settings). */
export const OPEN_ENHANCEMENT_EVENT = "open-enhancement-composer";

const HOLD_MS = 2200;
const OUT_MS = 240;

const KIND_STYLE: Record<EnhancementKind, { on: string; dot: string }> = {
  bug: { on: "border-[#e6c6cf] bg-danger-soft text-danger-ink", dot: "bg-danger-ink" },
  feature: { on: "border-[#c6d5e2] bg-info-soft text-info-ink", dot: "bg-info-ink" },
  tweak: { on: "border-[#e6d5a6] bg-warn-soft text-warn-ink", dot: "bg-warn-ink" },
};

/**
 * ⌥Q (Alt-Q) notes a bug, feature or tweak from anywhere in Studio or Livio,
 * for Claude Code to work through later (`npm run queue`). Like ⌥S it fires
 * while typing; `code`, not `key`, because Option+Q types "œ" on a Mac. (⌥E
 * was the obvious letter, but on a Mac it's a dead key that starts an "é".)
 *
 * The page it was pressed on comes along, so "this button's misaligned"
 * needs no more explaining.
 */
export function EnhancementHotkey() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ number: number; kind: EnhancementKind; leaving: boolean } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyQ") return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_ENHANCEMENT_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_ENHANCEMENT_EVENT, onOpen);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const saved = (number: number, kind: EnhancementKind) => {
    setOpen(false);
    timers.current.forEach(clearTimeout);
    setNotice({ number, kind, leaving: false });
    timers.current = [
      window.setTimeout(() => setNotice((n) => n && { ...n, leaving: true }), HOLD_MS),
      window.setTimeout(() => setNotice(null), HOLD_MS + OUT_MS),
    ];
  };

  return (
    <>
      {open && <Composer onClose={() => setOpen(false)} onSaved={saved} />}
      {notice && (
        <Portal>
          <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[66] flex justify-center px-4" role="status" aria-live="polite">
            <div
              className={clsx(
                notice.leaving ? "animate-sink-out" : "animate-rise-in",
                "flex items-center gap-2.5 rounded-full border border-n-200 bg-n-0/95 py-2 pl-3.5 pr-4 backdrop-blur-md",
              )}
              style={{ boxShadow: "var(--shadow-pop)" }}
            >
              <span aria-hidden className={clsx("h-2 w-2 rounded-full", KIND_STYLE[notice.kind].dot)} />
              <span className="text-[13px] font-semibold text-n-800">Queued</span>
              <span className="font-num text-[13px] text-n-500 tabular-nums">#{notice.number}</span>
              <span className="text-[12px] text-n-400">{KIND_LABEL[notice.kind]}</span>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

function Composer({ onClose, onSaved }: { onClose: () => void; onSaved: (number: number, kind: EnhancementKind) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<EnhancementKind>("feature");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read once, when it opens: where you were when you pressed it.
  const [where] = useState(() => ({
    app: document.documentElement.dataset.app === "livio" ? "livio" : "studio",
    path: window.location.pathname + window.location.search,
  }));
  const [keepPath, setKeepPath] = useState(true);

  // A "bug:" typed up front moves the chip with it.
  const typed = prefixKind(text);
  const shown = typed ?? kind;

  const grow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  };

  const submit = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { number } = await addEnhancement({ text, kind, app: where.app, path: keepPath ? where.path : null });
      onSaved(number, shown);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      setKind(nextKind(shown, e.shiftKey));
      // A prefix would override the chip; drop it so Tab wins.
      if (typed) setText((t) => t.replace(/^\s*(bug|feat|feature|tweak)\s*:\s*/i, ""));
    }
  };

  return (
    <ModalLock onClose={onClose} initialFocus={inputRef}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] px-4 pt-[12vh] backdrop-blur-[2px]"
          {...backdropProps(onClose)}
          role="dialog"
          aria-modal="true"
          aria-label="New enhancement"
        >
          <div className="card animate-scale-in w-full max-w-[560px] p-0" style={{ boxShadow: "var(--shadow-pop)" }}>
            <div className="flex items-center gap-1.5 border-b border-n-100 px-4 py-2.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-n-400">Enhancement</span>
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setKind(k); inputRef.current?.focus(); }}
                  className={clsx(
                    "rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition-colors",
                    shown === k ? KIND_STYLE[k].on : "border-transparent text-n-500 hover:bg-n-50",
                  )}
                  aria-pressed={shown === k}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-n-400">Tab to switch</span>
            </div>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => { setText(e.target.value); grow(); }}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder={"What's wrong, or what would be better?\nFirst line is the title; Shift-Enter for detail."}
              className="block w-full resize-none bg-transparent px-4 py-3 text-[14px] leading-6 text-n-900 outline-none placeholder:text-n-400"
              aria-label="Enhancement"
            />
            <div className="flex items-center gap-2 border-t border-n-100 px-4 py-2">
              {keepPath ? (
                <span className="inline-flex max-w-[60%] items-center gap-1 rounded-full border border-n-200 bg-n-50 py-0.5 pl-2.5 pr-1 text-[11.5px] text-n-600">
                  <span className="truncate">
                    from {where.app === "livio" ? "Livio " : ""}
                    <span className="font-num">{where.path}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { setKeepPath(false); inputRef.current?.focus(); }}
                    className="rounded-full px-1 text-n-400 hover:bg-n-100 hover:text-n-700"
                    aria-label="Don't attach this page"
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span className="text-[11.5px] text-n-400">No page attached</span>
              )}
              {error && <span className="text-[12px] text-danger-ink">{error}</span>}
              <span className="ml-auto text-[11px] text-n-400">↵ queue · Esc close</span>
            </div>
          </div>
        </div>
      </Portal>
    </ModalLock>
  );
}
