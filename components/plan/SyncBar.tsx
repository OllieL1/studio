"use client";

import Link from "next/link";
import { clsx } from "@/lib/clsx";

/**
 * The foot of the schedule: what's waiting to go to Google, and the button
 * that sends it. Says plainly when there's nothing to do or why it can't.
 */
export function SyncBar({
  googleConnected,
  googleError,
  calendar,
  pending,
  syncing,
  result,
  onSync,
}: {
  googleConnected: boolean;
  googleError: string | null;
  calendar: { id: string; name: string | null } | null;
  pending: { new: number; changed: number; removed: number };
  syncing: boolean;
  result: { ok: boolean; text: string } | null;
  onSync: () => void;
}) {
  const count = pending.new + pending.changed + pending.removed;
  const name = calendar?.name ?? "your plan calendar";

  let status: React.ReactNode;
  if (!googleConnected) {
    status = <>Connect Google Calendar in <SettingsLink /> to put this plan on your phone and iPad.</>;
  } else if (!calendar) {
    status = <>No calendar called “Studio” found. Pick one for the plan in <SettingsLink />.</>;
  } else if (count === 0) {
    status = <span className="flex items-center gap-1.5"><Tick /> Everything here is on <b className="font-semibold text-n-700">{name}</b>.</span>;
  } else {
    const parts = [
      pending.new && `${pending.new} new`,
      pending.changed && `${pending.changed} changed`,
      pending.removed && `${pending.removed} removed`,
    ].filter(Boolean);
    status = <><b className="font-semibold text-n-800">{parts.join(" · ")}</b> <span className="text-n-500">- not on {name} yet</span></>;
  }

  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
      <div className="min-w-0 flex-1 text-[13px] text-n-600">
        {status}
        {result && (
          <p className={clsx("mt-0.5 text-[12px] font-medium", result.ok ? "text-ok" : "text-danger")}>{result.text}</p>
        )}
        {googleError && !result && <p className="mt-0.5 text-[12px] font-medium text-warn">{googleError}</p>}
      </div>
      <button
        onClick={onSync}
        disabled={!googleConnected || !calendar || syncing || count === 0}
        className={clsx(
          "flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-4 text-[13px] font-semibold transition-colors duration-[120ms] disabled:cursor-default",
          count > 0 && calendar
            ? "bg-rust-500 text-white hover:bg-rust-600 disabled:opacity-60"
            : "border border-n-200 bg-n-0 text-n-500",
        )}
      >
        <SyncIcon spinning={syncing} />
        {syncing ? "Syncing…" : count === 0 && googleConnected && calendar ? "Synced" : "Sync to Calendar"}
      </button>
    </div>
  );
}

function SettingsLink() {
  return <Link href="/settings" className="font-semibold text-rust-600 hover:text-rust-700">Settings</Link>;
}

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden className="text-ok">
      <path d="M2 5.2 4 7.2 8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden className={clsx(spinning && "animate-spin")}>
      <path d="M12 7a5 5 0 0 1-8.6 3.5M2 7a5 5 0 0 1 8.6-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10.8 1.5v2.2H8.6M3.2 12.5v-2.2h2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
