"use client";

import type { Route } from "next";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMeeting, deleteMeeting, updateMeeting } from "@/app/projectActions";
import { backdropProps, Portal, useModal } from "@/lib/hooks/useModal";
import { clsx } from "@/lib/clsx";

export type MeetingDraft = {
  id: string | null;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  syncToGoogle: boolean;
};

/** "New meeting" button + dialog. Also used to edit an existing meeting. */
export function MeetingButton({
  draft,
  googleConnected,
  label,
  variant = "primary",
}: {
  draft: MeetingDraft;
  googleConnected: boolean;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={clsx(
          "rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-[120ms]",
          variant === "primary"
            ? "bg-rust-500 text-white hover:bg-rust-600"
            : "border border-n-200 bg-n-0 text-n-600 hover:bg-n-50",
        )}
      >
        {label}
      </button>
      {open && <MeetingDialog draft={draft} googleConnected={googleConnected} onClose={() => setOpen(false)} />}
    </>
  );
}

function MeetingDialog({
  draft: initial,
  googleConnected,
  onClose,
}: {
  draft: MeetingDraft;
  googleConnected: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  useModal({ onClose, initialFocus: titleRef });
  const editing = initial.id !== null;
  const set = <K extends keyof MeetingDraft>(k: K, v: MeetingDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const setStart = (v: string) =>
    setD((x) => {
      if (!v || x.endTime > v) return { ...x, startTime: v };
      const [h, m] = v.split(":").map(Number);
      const e = Math.min(h * 60 + m + 30, 23 * 60 + 59);
      return { ...x, startTime: v, endTime: `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}` };
    });

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const payload = { title: d.title, date: d.date, startTime: d.startTime, endTime: d.endTime, location: d.location || null, syncToGoogle: googleConnected && d.syncToGoogle };
      const res = editing ? await updateMeeting(initial.id!, payload) : await createMeeting(payload);
      if (!res.ok) { setError(res.error); return; }
      onClose();
      if (!editing && "id" in res) router.push(`/project/meetings/${res.id}` as Route);
      else router.refresh();
    });
  };

  return (
    <Portal>
      <div
        className="animate-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px] sm:items-center"
        {...backdropProps(onClose)}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Edit meeting" : "New meeting"}
      >
        <div className="animate-scale-in w-full max-w-[440px] overflow-hidden rounded-lg border border-n-200 bg-n-0" style={{ boxShadow: "var(--shadow-modal)" }}>
          <div className="space-y-4 px-5 pb-4 pt-5">
            <input
              ref={titleRef}
              value={d.title}
              onChange={(e) => set("title", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Supervisor meeting"
              aria-label="Title"
              className="font-display w-full bg-transparent text-[21px] font-semibold text-n-900 outline-none placeholder:text-n-300"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={d.date} onChange={(e) => set("date", e.target.value)} aria-label="Date" className={clsx(input, "font-num w-[150px]")} />
              <input type="time" value={d.startTime} onChange={(e) => setStart(e.target.value)} aria-label="Start" className={clsx(input, "font-num w-[100px]")} />
              <span className="text-[12px] text-n-400">-</span>
              <input type="time" value={d.endTime} onChange={(e) => set("endTime", e.target.value)} aria-label="End" className={clsx(input, "font-num w-[100px]")} />
            </div>
            <input value={d.location} onChange={(e) => set("location", e.target.value)} placeholder="Where - office, room or Teams link" aria-label="Location" className={input} />

            <label className={clsx("flex items-center justify-between gap-3 rounded-sm border border-n-100 bg-n-25 px-3 py-2.5 text-[12.5px]", !googleConnected && "opacity-60")}>
              <span className="text-n-700">
                Sync to Google Calendar
                {!googleConnected && <span className="block text-[10.5px] text-n-400">Connect Google in Settings first.</span>}
              </span>
              <input type="checkbox" disabled={!googleConnected} checked={googleConnected && d.syncToGoogle} onChange={(e) => set("syncToGoogle", e.target.checked)} className="h-4 w-4 accent-[var(--color-rust-500)]" />
            </label>
            {error && <p className="text-[12.5px] font-medium text-danger">{error}</p>}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-n-100 bg-n-25 px-5 py-3">
            {editing ? (
              <button
                onClick={() => {
                  if (!confirm("Delete this meeting? Its action items are kept as tasks.")) return;
                  startTransition(async () => { await deleteMeeting(initial.id!); onClose(); router.push("/project?tab=meetings" as Route); });
                }}
                className="rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-n-400 hover:bg-danger-soft hover:text-danger"
              >
                Delete
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-2 text-[12.5px] font-semibold text-n-600 hover:bg-n-100">Cancel</button>
              <button onClick={submit} disabled={pending} className="rounded-md bg-rust-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50">
                {pending ? "Saving..." : editing ? "Save" : "Create meeting"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

const input =
  "h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[13px] text-n-800 outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400";
