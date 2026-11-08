"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteKbDoc, moveKbDoc, saveKbDoc } from "@/app/kbActions";
import { docHref } from "@/lib/kb";
import { isModeToggle, MODE_SHORTCUT } from "@/lib/editor/shortcuts";
import { LiveEditor } from "../editor/LiveEditor";
import { clsx } from "@/lib/clsx";

/** Quiet time after the last keystroke before it's committed. Long enough
 *  that a paragraph is one commit, not forty. */
const COMMIT_AFTER_MS = 5000;

type Status = "saved" | "unsaved" | "committing" | { error: string; conflict: boolean };

/**
 * One knowledge-base doc: the lectures' editor, minus the @ mentions (Claude
 * reads plain markdown), committing to the repo instead of saving to the
 * database.
 *
 * The editor reports every change at once (`eager`) into a buffer; the buffer
 * is committed after a few quiet seconds, on ⌘S, and on the way out. If the
 * doc changed on GitHub meanwhile - Claude edited it in a session - nothing is
 * overwritten: a banner offers GitHub's version or keeping this one.
 */
export function KbEditor({
  doc,
  initialHtml,
  repo,
  branch,
}: {
  doc: { path: string; sha: string; body: string };
  initialHtml: string[];
  repo: string;
  branch: string;
}) {
  const router = useRouter();
  const sha = useRef(doc.sha);
  const pending = useRef<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatusState] = useState<Status>("saved");
  const statusRef = useRef<Status>("saved");
  const setStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);
  const [raw, setRaw] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(doc.path);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  /** Bumped to remount the editor on GitHub's version, after a conflict. */
  const [generation, setGeneration] = useState(0);
  const reloading = useRef(false);

  const commit = useCallback(async (overwrite = false): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    // One commit at a time: each needs the sha the last one left behind.
    while (inflight.current) await inflight.current;
    const body = pending.current;
    if (body == null) return;
    pending.current = null;
    setStatus("committing");
    const run = (async () => {
      const res = await saveKbDoc(doc.path, body, sha.current, overwrite).catch(() => ({ ok: false as const, error: "Couldn't reach Studio's server.", conflict: false }));
      if (res.ok) {
        sha.current = res.sha;
        setStatus(pending.current == null ? "saved" : "unsaved");
      } else {
        // Keep the text, so trying again (or keeping it over GitHub's) loses nothing.
        pending.current ??= body;
        setStatus({ error: res.error, conflict: !!res.conflict });
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
  }, [doc.path, setStatus]);

  const onChange = useCallback((body: string) => {
    pending.current = body;
    // After a failure, wait to be asked - don't retry into the same wall.
    if (typeof statusRef.current === "object") return;
    if (statusRef.current === "saved") setStatus("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(), COMMIT_AFTER_MS);
  }, [commit, setStatus]);

  // ⌘S commits now; ⌥M flips Live / Markdown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void commit();
      }
      if (isModeToggle(e)) {
        e.preventDefault();
        setRaw((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [commit]);

  // Leaving with something uncommitted: commit it on the way out of the page
  // (a server action still runs after this unmounts), and ask before the tab closes.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current != null || inflight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      if (pending.current != null) void commit();
    };
  }, [commit]);

  // After "Use GitHub's version", the refreshed page brings the new sha and body.
  useEffect(() => {
    if (!reloading.current) return;
    reloading.current = false;
    sha.current = doc.sha;
    pending.current = null;
    setStatus("saved");
    setGeneration((g) => g + 1);
  }, [doc.sha, doc.body, setStatus]);

  const useTheirs = () => {
    reloading.current = true;
    pending.current = null;
    router.refresh();
  };

  const rename = () =>
    startTransition(async () => {
      setRenameError(null);
      await commit();
      const res = await moveKbDoc(doc.path, name, sha.current);
      if (!res.ok) return setRenameError(res.error);
      setRenaming(false);
      router.replace(docHref(res.path) as Route);
    });

  const remove = () => {
    if (!confirm(`Delete ${doc.path} from ${repo}? It stays in the repo's history.`)) return;
    startTransition(async () => {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      const res = await deleteKbDoc(doc.path, sha.current);
      if (!res.ok) return setStatus({ error: res.error, conflict: false });
      router.push("/project?tab=claude" as Route);
    });
  };

  const failed = typeof status === "object" ? status : null;
  const btn = "flex h-8 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <form onSubmit={(e) => { e.preventDefault(); rename(); }} className="flex min-w-0 flex-1 items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setName(doc.path); setRenaming(false); } }}
              aria-label="Path"
              className="font-num h-9 min-w-0 flex-1 rounded-md border border-n-200 bg-n-0 px-2 text-[15px] text-n-900 outline-none focus:border-rust-400"
            />
            <button type="submit" disabled={busy} className={btn}>{busy ? "Moving…" : "Move"}</button>
          </form>
        ) : (
          <>
            <h1 onDoubleClick={() => setRenaming(true)} className="font-num min-w-0 flex-1 truncate text-[18px] leading-9 font-semibold text-n-900" title={doc.path}>
              {doc.path}
            </h1>
            <button onClick={() => setRenaming(true)} className={btn} title="Rename, or move into a folder with a /">Rename</button>
          </>
        )}
        <span className="flex items-center gap-1.5 text-[11px] text-n-400" title={`Commits to ${repo} · ${branch}. ⌘S commits now.`}>
          <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", status === "saved" ? "bg-ok" : failed ? "bg-danger" : "bg-warn")} />
          {status === "saved" ? "Committed" : status === "committing" ? "Committing…" : failed ? "Not committed" : "Unsaved · ⌘S"}
        </span>
        <div className="flex h-8 items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5" role="group" aria-label="Editing mode">
          {([["Live", false], ["Markdown", true]] as const).map(([label, mode]) => (
            <button
              key={label}
              onClick={() => setRaw(mode)}
              aria-pressed={raw === mode}
              title={`${label} (${MODE_SHORTCUT})`}
              className={clsx(
                "flex h-full items-center rounded-[5px] px-2 text-[11px] font-semibold transition-colors duration-[120ms]",
                raw === mode ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50 hover:text-n-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <a
          href={`https://github.com/${repo}/blob/${branch}/${doc.path.split("/").map(encodeURIComponent).join("/")}`}
          target="_blank"
          rel="noreferrer"
          className={btn}
          title="Open on GitHub - history, blame"
        >
          GitHub ↗
        </a>
        <button onClick={remove} disabled={busy} className={clsx(btn, "text-n-500 hover:bg-danger-soft hover:text-danger")}>Delete</button>
      </div>
      {renameError && <p className="text-[12px] text-danger">{renameError}</p>}

      {failed && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          <span className="min-w-0 flex-1">{failed.error}{failed.conflict ? " Your edits are still here." : ""}</span>
          {failed.conflict ? (
            <>
              <button onClick={useTheirs} className={btn}>Use GitHub&apos;s version</button>
              <button onClick={() => void commit(true)} className={btn}>Keep mine</button>
            </>
          ) : (
            <button onClick={() => void commit()} className={btn}>Try again</button>
          )}
        </div>
      )}

      <div className="card px-3 py-3 sm:px-5">
        <LiveEditor
          key={generation}
          initial={doc.body}
          initialHtml={generation === 0 ? initialHtml : undefined}
          onSave={onChange}
          eager
          mentions={false}
          raw={raw}
          onRawChange={setRaw}
          placeholder="Write in markdown. [ inserts blocks. Claude reads this exactly as written."
        />
      </div>
    </div>
  );
}
