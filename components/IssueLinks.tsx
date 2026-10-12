"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkIssue, refreshTaskIssues, unlinkIssue } from "@/app/githubActions";
import type { MentionOption } from "@/app/api/mentions/route";
import { parseIssueRef } from "@/lib/mentions";
import { issueUrl } from "@/lib/repos";
import { IssueIcon } from "./project/GitHubParts";
import { Card, Eyebrow } from "./ui";
import { clsx } from "@/lib/clsx";

type Linked = { repo: string; number: number; title: string; state: "open" | "closed" };

/**
 * The GitHub issues a task tracks. When the last open one closes, the task
 * ticks itself (lib/githubModel.ts → syncIssueLinks).
 *
 * The page renders from the stored snapshot so it never waits on GitHub,
 * then this checks for changes and refreshes only if there were any.
 */
export function IssueLinks({ taskId, issues, canLink }: { taskId: string; issues: Linked[]; canLink: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<MentionOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const linkedCount = issues.length;

  useEffect(() => {
    if (linkedCount === 0) return;
    let live = true;
    refreshTaskIssues(taskId).then((r) => live && r.changed && router.refresh()).catch(() => {});
    return () => { live = false; };
  }, [taskId, linkedCount, router]);

  useEffect(() => {
    if (!adding) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/mentions?${new URLSearchParams({ kind: "issue", q })}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d: { options: MentionOption[] }) => setOptions(d.options ?? []))
        .catch(() => {});
    }, 90);
    return () => { clearTimeout(t); controller.abort(); };
  }, [adding, q]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | { ok: true }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? null : ("error" in res ? res.error ?? null : null));
      router.refresh();
    });

  const taken = new Set(issues.map((i) => `${i.repo}#${i.number}`));
  const choices = options.filter((o) => !taken.has(o.id));
  const open = issues.filter((i) => i.state === "open").length;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <Eyebrow>GitHub issues</Eyebrow>
        {issues.length > 0 && (
          <span className="font-num text-[11.5px] text-n-500">{issues.length - open}/{issues.length} closed</span>
        )}
      </div>

      {issues.length === 0 && !adding && (
        <p className="mb-2 text-[12px] leading-5 text-n-400">
          Link an issue and this task ticks itself when it closes.
        </p>
      )}

      <div className="space-y-0.5">
        {issues.map((i) => (
          <div key={`${i.repo}#${i.number}`} className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-n-50">
            <IssueIcon state={i.state} />
            <a
              href={issueUrl(i.repo, i.number)}
              target="_blank"
              rel="noreferrer"
              className={clsx("min-w-0 flex-1 text-[12.5px] leading-5 hover:underline", i.state === "closed" ? "text-n-400" : "text-n-700")}
            >
              <span className="font-num text-n-400">#{i.number}</span> {i.title}
            </a>
            <button
              onClick={() => run(() => unlinkIssue(taskId, i.repo, i.number))}
              disabled={pending}
              aria-label={`Unlink issue #${i.number}`}
              className="mt-0.5 shrink-0 rounded p-1 text-n-300 opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {canLink &&
        (adding ? (
          <div className="animate-fade-in mt-2 rounded-sm border border-n-200">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setAdding(false); setQ(""); }
                if (e.key === "Enter" && choices[0]) pick(choices[0]);
              }}
              placeholder="Issue title or #number…"
              className="h-8 w-full border-b border-n-100 bg-transparent px-2.5 text-[12.5px] outline-none placeholder:text-n-400"
            />
            <div className="max-h-52 overflow-y-auto p-1">
              {choices.length === 0 ? (
                <p className="px-2 py-2 text-[11.5px] text-n-400">No matching issues.</p>
              ) : (
                choices.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => pick(o)}
                    disabled={pending}
                    className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-n-700 hover:bg-rust-50"
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    <span className="font-num shrink-0 text-[10.5px] text-n-400">{o.hint}</span>
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end border-t border-n-100 px-2 py-1.5">
              <button onClick={() => { setAdding(false); setQ(""); }} className="text-[11px] font-semibold text-n-500 hover:text-n-800">
                Done
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-n-200 py-1.5 text-[12px] font-medium text-n-500 transition-colors duration-[120ms] hover:border-n-300 hover:bg-n-25 hover:text-n-700"
          >
            + Link issue
          </button>
        ))}
      {error && <p className="mt-2 text-[11.5px] text-danger">{error}</p>}
    </Card>
  );

  function pick(o: MentionOption) {
    const ref = parseIssueRef(o.id);
    if (!ref) return;
    setQ("");
    run(() => linkIssue(taskId, ref.number));
  }
}
