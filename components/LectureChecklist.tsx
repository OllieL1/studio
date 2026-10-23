"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleItem } from "@/app/actions";
import { clsx } from "@/lib/clsx";
import { Tick, useShown } from "./Tick";

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
        <Part
          key={i.id}
          item={i}
          disabled={pending}
          onToggle={() =>
            startTransition(async () => {
              await toggleItem(i.id);
              router.refresh();
            })
          }
        />
      ))}
    </div>
  );
}

function Part({ item, disabled, onToggle }: {
  item: { id: string; label: string; done: boolean; isRevision: boolean };
  disabled: boolean;
  onToggle: () => void;
}) {
  const [shown, setShown] = useShown(item.done);
  const id = `part-${item.id}`;
  return (
    <div className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors duration-[120ms] hover:bg-n-50">
      <Tick
        id={id}
        size="sm"
        done={shown}
        tone={item.isRevision ? "rust" : "ok"}
        dashed={item.isRevision}
        disabled={disabled}
        label={shown ? `Untick ${item.label}` : `Tick ${item.label}`}
        onToggle={() => {
          setShown(!shown);
          onToggle();
        }}
      />
      <label
        htmlFor={id}
        data-done={shown}
        className={clsx("tick-text flex-1 cursor-pointer text-[12.5px] text-n-600", item.isRevision && !shown && "font-semibold text-rust-700")}
      >
        <span className="tick-words">{item.label}</span>
      </label>
    </div>
  );
}
