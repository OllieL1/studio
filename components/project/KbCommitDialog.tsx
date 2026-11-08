"use client";

import { useRef, useState } from "react";
import { commitKbDrafts, takeGitHubVersion } from "@/app/kbActions";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import { clsx } from "@/lib/clsx";
import { DiffStatsLabel } from "./KbDiff";

export type CommitFile = { path: string; state: "modified" | "added" | "behind"; added: number; removed: number };

/**
 * The one commit dialog: every uncommitted doc with a tick, and a message.
 * From a doc only that doc is ticked; from the tab, all of them. Whatever's
 * ticked goes in one commit.
 *
 * If any of them changed on GitHub since its edit started, nothing is
 * committed: each is listed with "Use GitHub's" (drop the edit) or "Keep
 * mine" (commit over it), and then it's tried again.
 */
export function KbCommitDialog({
  files: initialFiles,
  ticked,
  repo,
  branch,
  beforeCommit,
  onCommitted,
  onTookTheirs,
  onClose,
}: {
  files: CommitFile[];
  /** Ticked when it opens. */
  ticked: string[];
  repo: string;
  branch: string;
  /** Run first - the open doc saves what was typed in the last moment. */
  beforeCommit?: () => Promise<void>;
  onCommitted: (paths: string[], shas: Record<string, string>) => void;
  /** A doc's edit was dropped for GitHub's version. */
  onTookTheirs?: (path: string, doc: { sha: string | null; body: string }) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initialFiles);
  const [checked, setChecked] = useState(() => new Set(ticked.filter((p) => initialFiles.some((f) => f.path === p))));
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set());

  const toggle = (path: string) =>
    setChecked((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const commit = async () => {
    if (committing || checked.size === 0) return;
    setCommitting(true);
    setError(null);
    try {
      await beforeCommit?.();
      const paths = files.map((f) => f.path).filter((p) => checked.has(p));
      const res = await commitKbDrafts(paths, message, [...overwrite]);
      if (!res.ok) {
        setError(res.error);
        setConflicts(res.conflicts ?? []);
        return;
      }
      onCommitted(paths, res.shas);
    } catch {
      setError("Couldn't reach Studio's server.");
    } finally {
      setCommitting(false);
    }
  };

  const takeTheirs = async (path: string) => {
    const res = await takeGitHubVersion(path);
    if (!res.ok) return setError(res.error);
    setFiles((fs) => fs.filter((f) => f.path !== path));
    setChecked((c) => { const n = new Set(c); n.delete(path); return n; });
    setConflicts((cs) => cs.filter((c) => c !== path));
    onTookTheirs?.(path, { sha: res.sha, body: res.body });
  };

  const keepMine = (path: string) => {
    setOverwrite((o) => new Set(o).add(path));
    setConflicts((cs) => cs.filter((c) => c !== path));
  };

  const btn = "flex h-7 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50";
  const total = files.filter((f) => checked.has(f.path)).reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 });

  return (
    <ModalLock onClose={onClose} initialFocus={inputRef}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] px-4 pt-[12vh] backdrop-blur-[2px]"
          {...backdropProps(onClose)}
          role="dialog"
          aria-modal="true"
          aria-label="Commit"
        >
          <form
            onSubmit={(e) => { e.preventDefault(); void commit(); }}
            className="card animate-scale-in w-full max-w-[560px] p-0"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <div className="flex items-baseline gap-2 border-b border-n-100 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-400">Commit</span>
              <span className="font-num min-w-0 flex-1 truncate text-[12px] text-n-500">{repo} · {branch}</span>
              {checked.size > 0 && <DiffStatsLabel {...total} />}
            </div>

            <ul className="max-h-[40vh] overflow-y-auto border-b border-n-100 py-1">
              {files.length === 0 && <li className="px-4 py-2 text-[12.5px] text-n-400">Nothing left to commit.</li>}
              {files.map((f) => {
                const conflicted = conflicts.includes(f.path);
                return (
                  <li key={f.path} className={clsx("flex items-center gap-2 px-4 py-1.5", conflicted && "bg-danger-soft")}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={checked.has(f.path)} onChange={() => toggle(f.path)} className="shrink-0" />
                      <span className="font-num min-w-0 truncate text-[12.5px] text-n-800" title={f.path}>{f.path}</span>
                      {f.state === "added" && <span className="shrink-0 text-[10.5px] font-semibold text-ok-ink">new</span>}
                      {f.state === "behind" && !overwrite.has(f.path) && <span className="shrink-0 text-[10.5px] font-semibold text-danger-ink">behind GitHub</span>}
                      {overwrite.has(f.path) && <span className="shrink-0 text-[10.5px] font-semibold text-warn">keeping mine</span>}
                    </label>
                    {conflicted ? (
                      <>
                        <button type="button" onClick={() => void takeTheirs(f.path)} className={btn}>Use GitHub&apos;s</button>
                        <button type="button" onClick={() => keepMine(f.path)} className={btn}>Keep mine</button>
                      </>
                    ) : (
                      <DiffStatsLabel added={f.added} removed={f.removed} />
                    )}
                  </li>
                );
              })}
            </ul>

            <input
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={checked.size === 1 ? `Edit ${[...checked][0]}` : `Edit ${checked.size} docs`}
              aria-label="Commit message"
              className="block w-full bg-transparent px-4 py-3 text-[14px] leading-6 text-n-900 outline-none placeholder:text-n-400"
            />
            {error && (
              <p className="border-t border-n-100 bg-danger-soft px-4 py-2 text-[12.5px] text-danger-ink">
                {error}
                {conflicts.length > 0 && " Choose for each, then commit again."}
              </p>
            )}
            <div className="flex items-center gap-2 border-t border-n-100 px-4 py-2">
              <span className="text-[11px] text-n-400">{checked.size} of {files.length} ticked · ↵ commit · Esc close</span>
              <button type="button" onClick={onClose} className={clsx(btn, "ml-auto h-8 px-2.5")}>Cancel</button>
              <button
                type="submit"
                disabled={committing || checked.size === 0 || conflicts.some((c) => checked.has(c))}
                className="flex h-8 shrink-0 items-center rounded-md bg-rust-500 px-3 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50"
              >
                {committing ? "Committing…" : checked.size > 1 ? `Commit ${checked.size} docs` : "Commit"}
              </button>
            </div>
          </form>
        </div>
      </Portal>
    </ModalLock>
  );
}
