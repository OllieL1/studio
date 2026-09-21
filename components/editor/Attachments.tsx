"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAttachment } from "@/app/actions";
import { fmtBytes } from "@/lib/format";
import { clsx } from "@/lib/clsx";

export type AttachedFile = { id: string; filename: string; size: number };

/**
 * PDFs attached to a lecture - the slides, a handout.
 *
 * The file goes to disk beside the database, so this only uploads and lists.
 * Drag-and-drop as well as a picker, because slides usually arrive as a
 * download that's already sitting in a folder.
 */
export function Attachments({ taskId, files }: { taskId: string; files: AttachedFile[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    for (const file of Array.from(list)) {
      const form = new FormData();
      form.set("taskId", taskId);
      form.set("file", file);
      try {
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        if (!res.ok) setError((await res.json()).error ?? "That upload failed.");
      } catch {
        setError("That upload failed.");
      }
    }
    setBusy(false);
    router.refresh();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload(e.dataTransfer.files);
      }}
      className={clsx("rounded-md transition-colors duration-[120ms]", over && "bg-rust-50 ring-1 ring-rust-300")}
    >
      <div className="space-y-1">
        {files.map((f) => (
          <div key={f.id} className="group flex items-center gap-2">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0 text-n-400">
              <path d="M3 1.5h4l2 2v7H3v-9Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              <path d="M7 1.5v2h2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
            <a
              href={`/api/uploads/${f.id}`}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-n-700 hover:text-rust-600"
              title={f.filename}
            >
              {f.filename}
            </a>
            <span className="font-num shrink-0 text-[11px] text-n-400">{fmtBytes(f.size)}</span>
            <button
              onClick={() => {
                if (!confirm(`Remove "${f.filename}"?`)) return;
                startTransition(async () => {
                  await deleteAttachment(f.id);
                  router.refresh();
                });
              }}
              aria-label={`Remove ${f.filename}`}
              className="shrink-0 rounded p-1 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <input
        ref={input}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className={clsx(
          "mt-1.5 w-full rounded-md border border-dashed border-n-200 py-1.5 text-[11.5px] font-medium text-n-500 transition-colors duration-[120ms] hover:border-n-300 hover:bg-n-25 hover:text-n-700 disabled:opacity-50",
          files.length === 0 && "mt-0",
        )}
      >
        {busy ? "Uploading…" : files.length === 0 ? "Attach the slides (PDF)" : "Attach another"}
      </button>
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
