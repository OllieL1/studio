"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTask } from "@/app/actions";

/** Tick a deadline off from the timeline. It leaves on the next render. */
export function TickButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await toggleTask(id);
          router.refresh();
        })
      }
      disabled={pending}
      aria-label={`Mark ${title} as done`}
      className="mt-[3px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border border-n-300 transition-colors duration-[180ms] hover:border-ok disabled:border-ok disabled:bg-ok"
    >
      {pending && (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
