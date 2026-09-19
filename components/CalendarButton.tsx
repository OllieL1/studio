"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pushToCalendar, removeFromCalendar } from "@/app/actions";
import { clsx } from "@/lib/clsx";

/**
 * Push a task to Google Calendar in one click.
 *
 * Once pushed, the task remembers its event, so pressing again updates that
 * event rather than creating a duplicate.
 */
export function CalendarButton({
  taskId,
  onCalendar,
  hasDate,
  compact = false,
}: {
  taskId: string;
  onCalendar: boolean;
  hasDate: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!hasDate) return null;

  const push = () =>
    startTransition(async () => {
      setError(null);
      const res = await pushToCalendar(taskId);
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      await removeFromCalendar(taskId);
      router.refresh();
    });

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={onCalendar ? remove : push}
        disabled={pending}
        title={
          onCalendar
            ? "On your Google Calendar - click to remove"
            : "Add to Google Calendar"
        }
        aria-label={onCalendar ? "Remove from Google Calendar" : "Add to Google Calendar"}
        className={clsx(
          "rounded-md transition-colors duration-[120ms] disabled:opacity-50",
          compact ? "p-1.5" : "px-2 py-1.5",
          onCalendar
            ? "text-ok hover:bg-danger-soft hover:text-danger"
            : "text-n-300 hover:bg-n-100 hover:text-n-600",
        )}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="1.8" y="3" width="12.4" height="11.2" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1.8 6.4h12.4M5.2 1.8v2.4M10.8 1.8v2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {onCalendar && (
            <path d="M5.4 10.2l1.7 1.7 3.5-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </button>

      {error && (
        <span className="animate-fade-in absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[11px] leading-4 text-danger shadow-[var(--shadow-pop)]">
          {error}
        </span>
      )}
    </span>
  );
}
