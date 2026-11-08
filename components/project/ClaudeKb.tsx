"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createKbDoc, setKbRepo } from "@/app/kbActions";
import { docHref } from "@/lib/kb";
import { repoUrl } from "@/lib/repos";
import type { NoteItem } from "@/lib/noteTree";
import { NotesBrowser, useStoredView } from "./NotesBrowser";

export type KbCard = Omit<NoteItem, "kind">;

const input =
  "h-8 min-w-0 flex-1 rounded-md border border-n-200 bg-n-0 px-2.5 text-[12.5px] outline-none focus:border-rust-400";
const button =
  "flex h-8 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50";

/**
 * The knowledge base as a gallery or a tree - Nexus's browser, with the
 * repo's real folders where Nexus has tags. Every doc's id is its path.
 */
export function ClaudeKb({
  repo,
  branch,
  stale,
  docs,
  hasToken,
}: {
  repo: string;
  branch: string;
  stale: string | null;
  docs: KbCard[];
  /** Whether the repo has its own token, rather than the main GitHub one. */
  hasToken: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useStoredView("studio.view.claude", "tree");
  const [naming, setNaming] = useState(false);
  const [changingRepo, setChangingRepo] = useState(false);
  const items = useMemo(() => docs.map((d) => ({ ...d, kind: "note" as const })), [docs]);
  /** Every folder, for the new-doc suggestions. */
  const folders = useMemo(() => [...new Set(docs.flatMap((d) => d.tags))].sort(), [docs]);
  /** The chips are the top-level folders; each takes in its subfolders. */
  const chips = useMemo(() => [...new Set(folders.map((f) => f.split("/")[0]))], [folders]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-n-500">
        <a href={repoUrl(repo)} target="_blank" rel="noreferrer" className="font-num font-medium text-n-700 hover:text-rust-600">
          {repo} ↗
        </a>
        <span className="font-num text-n-400">{branch}</span>
        <span>⌘S in a doc commits it, with your message.</span>
        {stale && <span className="text-warn">Offline - showing what GitHub said {stale}.</span>}
        <button onClick={() => setChangingRepo((c) => !c)} className="ml-auto font-medium text-n-500 hover:text-rust-600">
          {changingRepo ? "Cancel" : "Change repo"}
        </button>
      </div>
      {changingRepo && <div className="max-w-[460px]"><KbRepoForm current={repo} hasToken={hasToken} onDone={() => setChangingRepo(false)} /></div>}
      {naming && <NewDocForm folders={folders} onCancel={() => setNaming(false)} onCreated={(path) => router.push(docHref(path) as Route)} />}

      <NotesBrowser
        items={items}
        tags={chips}
        noteHref={docHref}
        view={view}
        onViewChange={setView}
        storageKey="studio.view.claude"
        onNew={() => setNaming(true)}
        creating={false}
        newLabel="+ New doc"
        folders="paths"
        pdf={false}
        rememberFilter
        empty={{
          title: "The knowledge base is empty.",
          body: "Add a doc for anything Claude should know before it starts - how you like to work, what a project is, decisions already made. Folders are just slashes in the name.",
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

/** "Name or path" → a new doc, committed straight away and opened. */
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
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        placeholder={folders[0] ? `Name, or ${folders[0]}/name` : "Name, or folder/name"}
        aria-label="New doc's name"
        list="kb-folders"
        className={input}
      />
      <datalist id="kb-folders">{folders.map((f) => <option key={f} value={`${f}/`} />)}</datalist>
      <button type="submit" disabled={pending || !name.trim()} className="flex h-8 shrink-0 items-center rounded-md bg-rust-500 px-3 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50">
        {pending ? "Committing…" : "Create"}
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
