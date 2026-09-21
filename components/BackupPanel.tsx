"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runBackup } from "@/app/actions";
import { Card, Eyebrow } from "./ui";

/** Local backup status, with a manual "Back up now". */
export function BackupPanel({
  live,
  dir,
  last,
}: {
  live: boolean;
  dir: string;
  last: { at: string; sessions: number; bytes: number; files?: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const when = last ? new Date(last.at) : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Local backup</Eyebrow>
          <p className="mt-1.5 flex items-center gap-2 text-[14px] font-semibold text-n-800">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: last ? "var(--color-ok)" : "var(--color-n-300)" }}
            />
            {when
              ? `Backed up ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`
              : "No backup on this computer yet"}
          </p>
          <p className="mt-0.5 text-[12px] text-n-500">
            {last
              ? [
                  `${last.sessions} session${last.sessions === 1 ? "" : "s"}`,
                  `${(last.bytes / 1024).toFixed(0)} KB`,
                  last.files ? `${last.files} attached file${last.files === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "One is written automatically each time you log a session."}
          </p>
          <p className="font-num mt-2 break-all text-[11px] text-n-400">{dir}</p>
        </div>

        {live && (
          <button
            onClick={() =>
              startTransition(async () => {
                const res = await runBackup();
                setMessage(
                  res.ok
                    ? { tone: "ok", text: "Backed up." }
                    : { tone: "bad", text: "skipped" in res && res.skipped ? res.reason : (res as { error: string }).error },
                );
                router.refresh();
              })
            }
            disabled={pending}
            className="shrink-0 rounded-md border border-n-200 px-3 py-2 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50"
          >
            {pending ? "Backing up..." : "Back up now"}
          </button>
        )}
      </div>

      {message && (
        <p className={`animate-fade-in mt-3 text-[12px] font-medium ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>
          {message.text}
        </p>
      )}

      <p className="mt-3 border-t border-n-100 pt-3 text-[11.5px] leading-5 text-n-500">
        {live
          ? "After every logged session, all your data is copied to this computer, replacing the previous backup. If the stick is lost, copy studio-backup.db onto a new stick as studio/data/studio.db."
          : "Backups only run from the live app on the USB stick - this development copy never overwrites them."}
      </p>
    </Card>
  );
}
