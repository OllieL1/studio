"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleItem } from "@/app/actions";
import { clsx } from "@/lib/clsx";

/** The lecture's parts, ticked from the lecture page itself. */
export function LectureChecklist({
  items,
}: {
  items: { id: string; label: string; done: boolean; isRevision: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return <p className="px-1 py-2 text-[12px] text-n-400">No parts on this lecture.</p>;
  }

  return (
    <div className="space-y-0.5">
      {items.map((i) => (
        <button
          key={i.id}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await toggleItem(i.id);
              router.refresh();
            })
          }
          className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors duration-[120ms] hover:bg-n-50"
        >
          <span
            className={clsx(
              "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-[180ms]",
              i.done
                ? i.isRevision ? "border-rust-500 bg-rust-500" : "border-ok bg-ok"
                : i.isRevision ? "border-rust-400 border-dashed" : "border-n-300",
            )}
          >
            {i.done && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span
            className={clsx(
              "text-[12.5px]",
              i.done ? "text-n-400 line-through decoration-n-300" : "text-n-600",
              i.isRevision && !i.done && "font-semibold text-rust-700",
            )}
          >
            {i.label}
          </span>
        </button>
      ))}
    </div>
  );
}
