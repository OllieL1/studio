"use client";

import { useEffect, useRef, useState } from "react";
import { lookupLinkTitle } from "@/app/actions";
import { isHttpUrl, linkFallbackLabel, serializeMention } from "@/lib/mentions";
import { Portal } from "@/lib/hooks/useModal";

/**
 * Paste a link, get a chip.
 *
 * The title is fetched once, when the link is added - after that it's stored
 * in the note like any other mention label, so the note reads the same
 * offline. A fetch that fails or times out falls back to the domain and path,
 * and the label is editable afterwards in markdown mode either way.
 */
export function LinkPrompt({
  anchor,
  onInsert,
  onClose,
}: {
  anchor: HTMLElement | null;
  onInsert: (token: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({
      left: Math.min(Math.max(8, rect.left + 8), window.innerWidth - 380),
      top: Math.min(rect.bottom + 6, window.innerHeight - 90),
    });
    input.current?.focus();
  }, [anchor]);

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) return onClose();
    if (!isHttpUrl(trimmed)) {
      onInsert(serializeMention("link", trimmed, linkFallbackLabel(trimmed)));
      return;
    }
    setBusy(true);
    const { title } = await lookupLinkTitle(trimmed);
    onInsert(serializeMention("link", trimmed, title ?? linkFallbackLabel(trimmed)));
  };

  if (!pos) return null;

  return (
    <Portal>
      <div
        className="animate-scale-in fixed z-[90] w-[370px] rounded-lg border border-n-200 bg-n-0 p-2 shadow-[var(--shadow-pop)]"
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="flex items-center gap-1.5">
          <input
            ref={input}
            value={url}
            autoFocus
            placeholder="Paste a link…"
            aria-label="Link address"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-sm border border-n-200 bg-n-0 px-2 text-[12.5px] text-n-800 outline-none focus:border-rust-400"
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              void submit();
            }}
            disabled={busy}
            className="h-8 shrink-0 rounded-md bg-rust-500 px-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Fetching…" : "Add"}
          </button>
        </div>
        <p className="px-1 pt-1 text-[10.5px] text-n-400">
          The page title is fetched once; offline it falls back to the address.
        </p>
      </div>
    </Portal>
  );
}
