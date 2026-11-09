"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createKbDoc, discardKbDraft, setKbRepo } from "@/app/kbActions";
import { docHref, foldersOf } from "@/lib/kb";
import { repoUrl } from "@/lib/repos";
import type { NoteItem } from "@/lib/noteTree";
import type { ChangeState } from "@/lib/kbData";
import { NotesBrowser, useStoredView } from "./NotesBrowser";
import { DiffStatsLabel, KbDiff, useDiff } from "./KbDiff";
import { KbCommitDialog } from "./KbCommitDialog";
import { FolderPathInput } from "./FolderPathInput";
import { clsx } from "@/lib/clsx";

/** An uncommitted doc, with both sides of its diff. */
export type KbChangeRow = { path: string; state: ChangeState; added: number; removed: number; before: string; after: string };

export type KbCard = Omit<NoteItem, "kind">;

const input =
  "h-8 min-w-0 flex-1 rounded-md border border-n-200 bg-n-0 px-2.5 text-[12.5px] outline-none focus:border-rust-400";
const button =
  "flex h-8 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50";

/**
 * The knowledge base as a gallery or a tree - Nexus's browser, with the
 * repo's real folders where Nexus has tags. Every doc's id is its path.
 *
 * Uncommitted docs are marked in both views (+added −removed) and listed in
 * a bar above, each opening to its diff. ⌘S here commits them all at once.
 */
export function KbBrowser({
  repo,
  branch,
  stale,
  docs,
  changes,
  hasToken,
}: {
  repo: string;
  branch: string;
  stale: string | null;
  docs: KbCard[];
  changes: KbChangeRow[];
  /** Whether the repo has its own token, rather than the main GitHub one. */
  hasToken: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useStoredView("studio.view.claude", "tree");
  const [naming, setNaming] = useState(false);
  const [changingRepo, setChangingRepo] = useState(false);
  const items = useMemo(() => docs.map((d) => ({ ...d, kind: "note" as const })), [docs]);
  /** Every folder, ancestors included - for completing a new doc's path. */
  const folders = useMemo(() => foldersOf(docs.map((d) => d.id)), [docs]);
  /** The chips are the top-level folders; each takes in its subfolders. */
  const chips = useMemo(() => [...new Set(folders.map((f) => f.split("/")[0]))], [folders]);
  const [committing, setCommitting] = useState(false);

  // ⌘S anywhere on the tab: commit everything uncommitted, together.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (changes.length) setCommitting(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [changes.length]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-n-500">
        <a href={repoUrl(repo)} target="_blank" rel="noreferrer" className="font-num font-medium text-n-700 hover:text-rust-600">
          {repo} ↗
        </a>
        <span className="font-num text-n-400">{branch}</span>
        <span>Edits stay uncommitted until ⌘S.</span>
        {stale && <span className="text-warn">Offline - showing what GitHub said {stale}.</span>}
        <button onClick={() => setChangingRepo((c) => !c)} className="ml-auto font-medium text-n-500 hover:text-rust-600">
          {changingRepo ? "Cancel" : "Change repo"}
        </button>
      </div>
      {changingRepo && <div className="max-w-[460px]"><KbRepoForm current={repo} hasToken={hasToken} onDone={() => setChangingRepo(false)} /></div>}
      {changes.length > 0 && <UncommittedBar changes={changes} onCommit={() => setCommitting(true)} />}
      {committing && (
        <KbCommitDialog
          files={changes}
          ticked={changes.map((c) => c.path)}
          repo={repo}
          branch={branch}
          onCommitted={() => { setCommitting(false); router.refresh(); }}
          onTookTheirs={() => router.refresh()}
          onClose={() => setCommitting(false)}
        />
      )}
      {naming && <NewDocForm folders={folders} onCancel={() => setNaming(false)} onCreated={(path) => router.push(docHref(path) as Route)} />}

      <NotesBrowser
        items={items}
        tags={chips}
        noteHref={docHref}
        view={view}
        onViewChange={setView}
        // Named from when this was the Claude tab - kept so the remembered view and folder survive.
        storageKey="studio.view.claude"
        onNew={() => setNaming(true)}
        creating={false}
        newLabel="+ New doc"
        folders="paths"
        pdf={false}
        rememberFilter
        empty={{
          title: "The knowledge base is empty.",
          body: "Add a doc for anything Claude should know before it starts - how you like to work, what a project is, decisions already made. Folders are just slashes in the name. Nothing is committed until ⌘S.",
        }}
      />

      <details className="text-[12px] text-n-500">
        <summary className="cursor-pointer select-none font-medium text-n-600 hover:text-n-800">How Claude reads this</summary>
        <div className="mt-2 space-y-1.5 leading-[18px]">
          <p>
            Clone it once on each machine - <code className="font-num text-n-700">git clone git@github.com:{repo}.git ~/kb</code> - and a
            SessionStart hook in <code className="font-num text-n-700">~/.claude/settings.json</code> pulls it and hands Claude{" "}
            <code className="font-num text-n-700">INDEX.md</code> at the start of every session. Claude opens the docs it needs from there.
          </p>
          <p>The README has the hook. Claude can edit and push the docs too; Studio shows that the next time this tab opens. Studio never writes a file you didn&apos;t edit - your INDEX.md files are yours.</p>
        </div>
      </details>
    </div>
  );
}

/**
 * Every uncommitted doc, like the top of a GitHub PR's "Files changed": a
 * row each with its +/−, opening to the diff.
 */
function UncommittedBar({ changes, onCommit }: { changes: KbChangeRow[]; onCommit: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const total = changes.reduce((t, c) => ({ added: t.added + c.added, removed: t.removed + c.removed }), { added: 0, removed: 0 });
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-n-100 px-3 py-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
        <span className="text-[12.5px] font-semibold text-n-800">
          Uncommitted · {changes.length} {changes.length === 1 ? "doc" : "docs"}
        </span>
        <DiffStatsLabel {...total} />
        <button
          onClick={onCommit}
          className="ml-auto flex h-7 shrink-0 items-center rounded-md bg-rust-500 px-2.5 text-[11.5px] font-semibold text-white hover:bg-rust-600"
        >
          Commit all · ⌘S
        </button>
      </div>
      <ul>
        {changes.map((c) => (
          <ChangeRow key={c.path} change={c} open={open === c.path} onToggle={() => setOpen((o) => (o === c.path ? null : c.path))} />
        ))}
      </ul>
    </div>
  );
}

function ChangeRow({ change, open, onToggle }: { change: KbChangeRow; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { hunks } = useDiff(change.before, open ? change.after : change.before);
  const discard = () => {
    if (!confirm(change.state === "added" ? `Discard ${change.path}? It was never committed, so it goes entirely.` : `Discard your uncommitted changes to ${change.path}?`)) return;
    startTransition(async () => {
      await discardKbDraft(change.path);
      router.refresh();
    });
  };
  return (
    <li className="border-b border-n-100 last:border-b-0">
      <div className="group flex h-8 items-center gap-2 px-3 text-[12.5px] hover:bg-n-25">
        <button onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span aria-hidden className={clsx("w-2.5 shrink-0 text-[9px] text-n-400 transition-transform duration-[120ms]", open && "rotate-90")}>▶</span>
          <span className="font-num min-w-0 truncate text-n-800" title={change.path}>{change.path}</span>
          {change.state === "added" && <span className="shrink-0 text-[10.5px] font-semibold text-ok-ink">new</span>}
          {change.state === "behind" && <span className="shrink-0 text-[10.5px] font-semibold text-danger-ink" title="Changed on GitHub since you started - committing will ask which to keep">behind GitHub</span>}
        </button>
        <DiffStatsLabel added={change.added} removed={change.removed} />
        <Link href={docHref(change.path) as Route} className="shrink-0 text-[11.5px] font-medium text-n-500 hover:text-rust-600">Open</Link>
        <button onClick={discard} disabled={pending} className="shrink-0 text-[11.5px] font-medium text-n-400 hover:text-danger">Discard</button>
      </div>
      {open && <KbDiff hunks={hunks} className="max-h-[50vh] overflow-y-auto border-t border-n-100 py-1" />}
    </li>
  );
}

/** "Name or path" → a new doc, uncommitted until its first ⌘S, and opened. */
function NewDocForm({ folders, onCancel, onCreated }: { folders: string[]; onCancel: () => void; onCreated: (path: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      setError(null);
      const res = await createKbDoc(name);
      if (res.ok) onCreated(res.path);
      else setError(res.error);
    });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="card flex flex-wrap items-center gap-2 p-3"
    >
      <FolderPathInput
        autoFocus
        value={name}
        onChange={setName}
        folders={folders}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        placeholder={folders[0] ? `Name, or ${folders[0]}/name - Tab completes folders` : "Name, or folder/name"}
        aria-label="New doc's name"
        wrapperClassName="min-w-0 flex-1"
        className={input}
      />
      <button type="submit" disabled={pending || !name.trim()} className="flex h-8 shrink-0 items-center rounded-md bg-rust-500 px-3 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50">
        {pending ? "Creating…" : "Create"}
      </button>
      <button type="button" onClick={onCancel} className={button}>Cancel</button>
      {error && <p className="w-full text-[12px] text-danger">{error}</p>}
    </form>
  );
}

/**
 * Which repo the knowledge base is, and optionally a token for it alone -
 * Studio's main GitHub token is fine-grained to the uni org and can't see a
 * personal repo. Checked against GitHub before it's saved.
 */
export function KbRepoForm({ current, hasToken, onDone }: { current: string | null; hasToken: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const res = await setKbRepo(value, token, clearToken);
          if (!res.ok) return setError(res.error);
          onDone?.();
          router.refresh();
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="owner/name, or the repo's link"
        aria-label="Knowledge-base repo"
        className={input}
      />
      <input
        value={token}
        onChange={(e) => { setToken(e.target.value); setClearToken(false); }}
        type="password"
        autoComplete="off"
        placeholder={hasToken ? "Token saved - paste to replace" : "Token for this repo (optional)"}
        aria-label="Token for the knowledge-base repo"
        className={`${input} basis-full sm:basis-auto`}
      />
      <button type="submit" disabled={pending} className={button}>{pending ? "Checking…" : "Save"}</button>
      <p className="w-full text-[11.5px] leading-[17px] text-n-400">
        A fine-grained token with this repo&apos;s owner as resource owner, only this repo selected, and Contents: Read and write.
        Leave it blank to use the main GitHub token.
        {hasToken && (
          <label className="ml-2 inline-flex items-center gap-1 text-n-500">
            <input type="checkbox" checked={clearToken} onChange={(e) => setClearToken(e.target.checked)} /> Forget the saved token
          </label>
        )}
      </p>
      {error && <p className="w-full text-[12px] text-danger">{error}</p>}
    </form>
  );
}
