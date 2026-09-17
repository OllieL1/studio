"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setNotebookLocation } from "@/app/actions";
import { NOTEBOOKS } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { Eyebrow } from "./ui";

/**
 * Where the handwritten notes physically are.
 *
 * The notebooks are identified by cover design — Space, Physics, Computing —
 * which is how you actually reach for one off the shelf.
 */
export function NotebookLocation({
  taskId,
  notebook,
  pages,
  compact = false,
}: {
  taskId: string;
  notebook: string | null;
  pages: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [nb, setNb] = useState(notebook ?? "");
  const [pp, setPp] = useState(pages ?? "");
  const [pending, startTransition] = useTransition();

  const save = (nextNb: string, nextPp: string) => {
    startTransition(async () => {
      await setNotebookLocation(taskId, nextNb || null, nextPp || null);
      router.refresh();
    });
  };

  return (
    <div className={clsx(compact ? "" : "rounded-sm border border-n-100 bg-n-25 p-3")}>
      {!compact && <Eyebrow className="mb-2">Handwritten notes</Eyebrow>}
      <div className="flex flex-wrap items-center gap-1.5">
        {NOTEBOOKS.map((n) => {
          const on = nb === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = on ? "" : n;
                setNb(next);
                save(next, pp);
              }}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-all duration-[180ms]",
                on
                  ? "border-transparent bg-n-800 text-white"
                  : "border-n-200 text-n-500 hover:border-n-300 hover:bg-n-50 hover:text-n-700",
              )}
            >
              {n}
            </button>
          );
        })}

        <div
          className={clsx(
            "flex items-baseline gap-1 rounded-sm border px-2 py-1 transition-opacity duration-[120ms]",
            nb ? "border-n-200 opacity-100" : "border-n-100 opacity-50",
          )}
        >
          <span className="text-[10.5px] text-n-400">pp.</span>
          <input
            value={pp}
            onChange={(e) => setPp(e.target.value)}
            onBlur={() => save(nb, pp)}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
            placeholder="12–18"
            disabled={!nb}
            aria-label="Notebook pages"
            className="font-num w-16 bg-transparent text-[12px] font-semibold text-n-800 outline-none placeholder:font-normal placeholder:text-n-400"
          />
        </div>

        {pending && <span className="text-[10.5px] text-n-400">saving…</span>}
      </div>
    </div>
  );
}
