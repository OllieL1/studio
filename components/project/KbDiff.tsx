"use client";

import { useDeferredValue, useMemo } from "react";
import { diffLines, diffStats, toHunks, type DiffLine, type Segment } from "@/lib/diff";
import { clsx } from "@/lib/clsx";

/** The diff, worked out while typing - deferred, so a keystroke never waits on it. */
export function useDiff(before: string, after: string) {
  const deferred = useDeferredValue(after);
  return useMemo(() => {
    const lines = diffLines(before, deferred);
    return { hunks: toHunks(lines), stats: diffStats(lines) };
  }, [before, deferred]);
}

/** "+12 −3", GitHub's colours. */
export function DiffStatsLabel({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="font-num text-[11.5px] font-semibold">
      <span className="text-ok-ink">+{added}</span> <span className="text-danger-ink">−{removed}</span>
    </span>
  );
}

function Text({ line }: { line: DiffLine }) {
  if (!line.segments) return <>{line.text || " "}</>;
  return (
    <>
      {line.segments.map((s: Segment, i) => (
        <span key={i} className={clsx(s.changed && (line.op === "add" ? "rounded-[2px] bg-ok/30" : "rounded-[2px] bg-danger/30"))}>
          {s.text}
        </span>
      ))}
    </>
  );
}

/**
 * A unified diff the way GitHub shows one: hunks headed `@@ -a,b +c,d @@`,
 * old and new line numbers, green additions, red removals, and the words
 * that changed inside an edited line marked darker.
 */
export function KbDiff({ hunks, className }: { hunks: ReturnType<typeof toHunks>; className?: string }) {
  if (hunks.length === 0) return <p className={clsx("px-3 py-2 text-[12px] text-n-400", className)}>No changes.</p>;
  return (
    <div className={clsx("overflow-x-auto font-mono text-[12px] leading-[19px]", className)} role="table" aria-label="Uncommitted changes">
      {hunks.map((h, hi) => (
        <div key={hi} role="rowgroup">
          <div className="sticky left-0 bg-info-soft px-3 py-0.5 text-info" role="row">
            @@ -{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
          </div>
          {h.lines.map((l, li) => (
            <div
              key={li}
              role="row"
              className={clsx("grid min-w-max grid-cols-[40px_40px_16px_1fr]", l.op === "add" ? "bg-ok-soft" : l.op === "del" ? "bg-danger-soft" : "")}
            >
              <span className="select-none pr-2 text-right text-n-400">{l.oldNo ?? ""}</span>
              <span className="select-none pr-2 text-right text-n-400">{l.newNo ?? ""}</span>
              <span className={clsx("select-none", l.op === "add" ? "text-ok-ink" : l.op === "del" ? "text-danger-ink" : "text-n-300")}>
                {l.op === "add" ? "+" : l.op === "del" ? "−" : " "}
              </span>
              <span className="whitespace-pre pr-4 text-n-800"><Text line={l} /></span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
