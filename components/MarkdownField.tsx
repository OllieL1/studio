"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";

/**
 * A markdown text area with Write/Preview and autosave, for meeting agendas,
 * meeting notes and paper notes. `save` is a server action (usually bound to
 * the record's id). Preview uses the same renderer as lecture notes.
 */
export function MarkdownField({
  initial,
  save,
  placeholder,
  minHeight = 180,
  toolbar,
  value: controlled,
  onValueChange,
}: {
  initial: string;
  save: (markdown: string) => Promise<unknown>;
  placeholder?: string;
  minHeight?: number;
  /** Extra buttons beside Write/Preview (e.g. "Draft from recent work"). */
  toolbar?: (api: { setValue: (v: string) => void; value: string }) => React.ReactNode;
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  const router = useRouter();
  const [inner, setInner] = useState(initial);
  const value = controlled ?? inner;
  const setValue = (v: string) => { setInner(v); onValueChange?.(v); };
  const [tab, setTab] = useState<"write" | "preview">(initial.trim() ? "preview" : "write");
  const [html, setHtml] = useState("");
  const [saved, setSaved] = useState(true);
  const [pending, startTransition] = useTransition();
  const lastSaved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = (text: string) => {
    if (text === lastSaved.current) { setSaved(true); return; }
    startTransition(async () => {
      await save(text);
      lastSaved.current = text;
      setSaved(true);
      router.refresh();
    });
  };

  useEffect(() => {
    if (value === lastSaved.current) return;
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(value), 1200);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (tab !== "preview") return;
    let cancelled = false;
    fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown: value }) })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setHtml(d.html ?? ""); });
    return () => { cancelled = true; };
  }, [tab, value]);

  return (
    <div className="overflow-hidden rounded-md border border-n-200 bg-n-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-n-100 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-n-200 p-0.5">
            {(["write", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx(
                  "rounded-[5px] px-2 py-0.5 text-[11.5px] font-semibold capitalize transition-colors duration-[120ms]",
                  tab === t ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {toolbar?.({ setValue: (v) => { setValue(v); setTab("write"); }, value })}
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-n-400">
          <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", pending || !saved ? "bg-warn" : "bg-ok")} />
          {pending ? "Saving..." : saved ? "Saved" : "Unsaved"}
        </span>
      </div>

      {tab === "write" ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { if (timer.current) clearTimeout(timer.current); persist(value); }}
          placeholder={placeholder}
          spellCheck
          className="font-num block w-full resize-y bg-transparent px-3 py-2.5 text-[13px] leading-[21px] text-n-800 outline-none placeholder:text-n-400"
          style={{ minHeight }}
        />
      ) : value.trim() ? (
        <div className="prose-notes px-4 py-3 text-[14px]" style={{ minHeight: Math.min(minHeight, 120) }} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <button type="button" onClick={() => setTab("write")} className="block w-full px-4 py-6 text-left text-[13px] text-n-400 hover:bg-n-25">
          {placeholder ?? "Nothing yet - click to write."}
        </button>
      )}
    </div>
  );
}
