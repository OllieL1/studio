"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTask } from "@/app/actions";
import { afterTick, Tick } from "./Tick";

/** Tick a deadline off from the timeline. It leaves on the next render -
 *  once the tick has had its moment. */
export function TickButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Tick
      size="sm"
      done={false}
      disabled={pending}
      className="mt-[3px]"
      label={`Mark ${title} as done`}
      onToggle={() =>
        startTransition(async () => {
          await Promise.all([toggleTask(id), afterTick()]);
          router.refresh();
        })
      }
    />
  );
}
