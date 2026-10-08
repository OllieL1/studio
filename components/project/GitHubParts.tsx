"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTaskFromIssue, linkIssue, refreshProjectRepo } from "@/app/githubActions";
import { Card, Eyebrow } from "@/components/ui";
import { clsx } from "@/lib/clsx";

export type IssueRow = {
  number: number;
  title: string;
  state: "open" | "closed";
  reason: string | null;
  url: string;
  author: string | null;
  labels: { name: string; colour: string | null }[];
  assignees: string[];
  comments: number;
  /** "opened 3d ago" / "closed 2h ago", worked out on the server so it can't disagree with it. */
  ago: string;
  tasks: { id: string; title: string; done: boolean }[];
};

/** Ask GitHub now instead of trusting the minute-old cache. */
export function RefreshRepoButton({ label }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() =>
          startTransition(async () => {
            const res = await refreshProjectRepo();
            setError(res.ok ? null : res.error);
            router.refresh();
          })
        }
        disabled={pending}
        aria-label="Refresh from GitHub"
        title="Refresh from GitHub"
        className={clsx(
          "flex items-center gap-1.5 rounded-md border border-n-200 bg-n-0 px-2 py-1 text-[12px] font-semibold text-n-600 hover:bg-n-50 disabled:opacity-60",
        )}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className={clsx(pending && "animate-spin")}>
          <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}

/**
 * Issues, open or closed, with instant search. Each one can become a project
 * task, or be linked to one that already exists; a task made this way ticks
 * itself when the issue closes on GitHub.
 */
export function IssueList({ issues, repo }: { issues: IssueRow[]; repo: string }) {
  const [state, setState] = useState<"open" | "closed">("open");
  const [q, setQ] = useState("");
  const counts = { open: issues.filter((i) => i.state === "open").length, closed: issues.filter((i) => i.state === "closed").length };

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().replace(/^#/, "").split(/\s+/).filter(Boolean);
    return issues.filter(
      (i) =>
        i.state === state &&
        words.every((w) => i.title.toLowerCase().includes(w) || String(i.number) === w || i.labels.some((l) => l.name.toLowerCase().includes(w))),
    );
  }, [issues, state, q]);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-n-100 px-4 py-2">
        <Eyebrow className="mr-1">Issues</Eyebrow>
        <div className="flex rounded-md bg-n-50 p-0.5">
          {(["open", "closed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={clsx(
                "rounded-[5px] px-2 py-0.5 text-[11.5px] font-semibold capitalize transition-colors duration-[120ms]",
                state === s ? "bg-n-0 text-n-800 shadow-[0_0_0_1px_var(--color-n-200)]" : "text-n-500 hover:text-n-800",
              )}
            >
              {s} <span className="font-num font-normal text-n-400">{counts[s]}</span>
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by title, #number or label"
          aria-label="Filter issues"
          className="ml-auto h-7 w-52 rounded-full bg-n-50 px-3 text-[12px] text-n-700 outline-none placeholder:text-n-400 focus:bg-n-100/70"
        />
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-n-400">
          {q ? "No issues match." : state === "open" ? "No open issues - nice." : "Nothing closed yet."}
        </p>
      ) : (
        <div className="max-h-[560px] overflow-y-auto">
          {shown.map((i) => <IssueItem key={i.number} issue={i} repo={repo} />)}
        </div>
      )}
    </Card>
  );
}

function IssueItem({ issue: i, repo }: { issue: IssueRow; repo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = () =>
    startTransition(async () => {
      const res = await createTaskFromIssue(i.number);
      setError(res.ok ? null : res.error);
      router.refresh();
    });

  return (
    <div className="group border-b border-n-100 px-4 py-2.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <IssueIcon state={i.state} reason={i.reason} />
        <div className="min-w-0 flex-1">
          <a href={i.url} target="_blank" rel="noreferrer" className="text-[13.5px] font-medium text-n-800 hover:text-rust-700">
            {i.title} <span className="font-num text-[12px] font-normal text-n-400">#{i.number}</span>
          </a>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-n-500">
            {i.labels.map((l) => (
              <span key={l.name} className="inline-flex items-center gap-1 rounded-full border border-n-200 px-1.5 text-[10.5px] font-medium text-n-600">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: l.colour ?? "var(--color-n-300)" }} />
                {l.name}
              </span>
            ))}
            <span>{i.ago}{i.author && ` by ${i.author}`}</span>
            {i.assignees.some((a) => a !== i.author) && <span>· assigned to {i.assignees.join(", ")}</span>}
            {i.comments > 0 && <span className="font-num">· {i.comments} comment{i.comments === 1 ? "" : "s"}</span>}
          </div>
          {i.tasks.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {i.tasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className={clsx(
                    "inline-flex max-w-[28ch] items-center gap-1 truncate rounded-full px-2 py-px text-[11px] font-semibold",
                    t.done ? "bg-ok-soft text-ok" : "bg-rust-50 text-rust-700",
                  )}
                >
                  {t.done ? "✓" : "Task"} · <span className="truncate">{t.title}</span>
                </Link>
              ))}
            </div>
          )}
          {error && <p className="mt-1 text-[11.5px] text-danger">{error}</p>}
        </div>
        {i.state === "open" && (
          <div className={clsx("flex shrink-0 items-center gap-1 transition-opacity", !linking && "opacity-0 focus-within:opacity-100 group-hover:opacity-100")}>
            {i.tasks.length === 0 && (
              <button onClick={make} disabled={pending} className="rounded-md bg-rust-500 px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-rust-400 disabled:opacity-60">
                Make task
              </button>
            )}
            <button
              onClick={() => setLinking((v) => !v)}
              className="rounded-md border border-n-200 bg-n-0 px-2 py-1 text-[11.5px] font-semibold text-n-600 hover:bg-n-50"
            >
              Link…
            </button>
          </div>
        )}
      </div>
      {linking && (
        <TaskPicker
          exclude={i.tasks.map((t) => t.id)}
          onPick={(taskId) =>
            startTransition(async () => {
              const res = await linkIssue(taskId, i.number);
              setError(res.ok ? null : res.error);
              setLinking(false);
              router.refresh();
            })
          }
          onClose={() => setLinking(false)}
          hint={`Tasks that close with ${repo.split("/")[1]}#${i.number}`}
        />
      )}
    </div>
  );
}

type TaskOption = { id: string; title: string; courseId: string | null; kind: string };

/** Find an open task to link an issue to. Project tasks first; everything is searchable. */
function TaskPicker({ exclude, onPick, onClose, hint }: { exclude: string[]; onPick: (id: string) => void; onClose: () => void; hint: string }) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<TaskOption[]>([]);
  const excluded = exclude.join(",");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ open: "1" });
    if (q.trim()) params.set("q", q.trim());
    const t = setTimeout(() => {
      fetch(`/api/tasks?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data: TaskOption[]) => setOptions(data.filter((o) => !excluded.split(",").includes(o.id) && o.kind !== "LECTURE" && o.kind !== "LAB").slice(0, 10)))
        .catch(() => {});
    }, 100);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, excluded]);

  return (
    <div className="animate-fade-in ml-[26px] mt-2 rounded-sm border border-n-200 bg-n-0">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && options[0]) onPick(options[0].id);
        }}
        placeholder="Find a task…"
        className="h-8 w-full border-b border-n-100 bg-transparent px-2.5 text-[12.5px] outline-none placeholder:text-n-400"
      />
      <div className="max-h-48 overflow-y-auto p-1">
        {options.length === 0 ? (
          <p className="px-2 py-2 text-[11.5px] text-n-400">No matching open tasks.</p>
        ) : (
          options.map((o) => (
            <button key={o.id} onClick={() => onPick(o.id)} className="block w-full truncate rounded px-2 py-1.5 text-left text-[12.5px] text-n-700 hover:bg-rust-50">
              {o.title}
            </button>
          ))
        )}
      </div>
      <p className="border-t border-n-100 px-2.5 py-1.5 text-[10.5px] text-n-400">{hint}</p>
    </div>
  );
}

export function IssueIcon({ state, reason }: { state: "open" | "closed"; reason?: string | null }) {
  const colour = state === "open" ? "var(--color-ok)" : reason === "not_planned" ? "var(--color-n-400)" : "var(--color-info)";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-label={state === "open" ? "Open" : "Closed"} className="mt-0.5 shrink-0" style={{ color: colour }}>
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
      {state === "open" ? (
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      ) : reason === "not_planned" ? (
        <path d="M5 11L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M5.4 8.2l1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
