"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addRepo, checkRepoAccess, disconnectGitHub, moveRepo, removeRepo, renameRepo, saveGitHubToken,
} from "@/app/githubActions";
import { repoUrl } from "@/lib/repos";
import { Card, Eyebrow } from "./ui";
import { GitHubMark } from "./GitHubMark";
import { clsx } from "@/lib/clsx";

type RepoRow = { id: string; label: string; fullName: string };

/** A pre-filled "new classic token" page: `repo` scope, named Studio. */
const NEW_TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=Studio";

/**
 * GitHub: the token Studio reads with, and the repos in the nav's Repos menu.
 */
export function GitHubPanel({
  source,
  login,
  name,
  scopes,
  projectRepo,
  repos,
}: {
  source: "settings" | "env" | null;
  login: string | null;
  name: string | null;
  scopes: string | null;
  projectRepo: string | null;
  repos: RepoRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const connected = source !== null;
  const [replacing, setReplacing] = useState(!connected);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(!connected);

  // A classic token lists its scopes; without `repo` it can't read private
  // repos. Fine-grained tokens report none, so say nothing rather than guess.
  const scopeList = scopes?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
  const missingRepoScope = scopeList !== null && scopeList.length > 0 && !scopeList.includes("repo");

  const save = () =>
    startTransition(async () => {
      const res = await saveGitHubToken(token);
      if (!res.ok) { setError(res.error); return; }
      setError(null);
      setToken("");
      setReplacing(false);
      setShowSteps(false);
      router.refresh();
    });

  return (
    <Card className="p-5" id="github">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>GitHub</Eyebrow>
          <p className="mt-1.5 flex items-center gap-2 text-[14px] font-semibold text-n-800">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: connected ? "var(--color-ok)" : "var(--color-n-300)" }} />
            {connected ? "Connected" : "Not connected"}
          </p>
          <p className="mt-0.5 text-[12px] text-n-500">
            {source === "settings" && `As ${login}${name ? ` (${name})` : ""} · read-only - Studio never changes anything on GitHub`}
            {source === "env" && "Using GITHUB_TOKEN from .env. Save a token here to have it travel with the stick."}
            {source === null && "A token lets Studio read the project repo's issues, pull requests and commits."}
          </p>
          {missingRepoScope && (
            <p className="mt-1.5 text-[12px] font-medium text-warn">
              This token doesn&apos;t have the <code className="font-num">repo</code> scope, so private repos stay hidden. Make a new one with it ticked.
            </p>
          )}
        </div>
        {connected && (
          <div className="flex items-center gap-2">
            {!replacing && (
              <button
                onClick={() => setReplacing(true)}
                className="rounded-md border border-n-200 px-3 py-2 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
              >
                Replace token
              </button>
            )}
            {source === "settings" && (
              <button
                onClick={() => {
                  if (!confirm("Disconnect GitHub? Linked issues keep their last known state.")) return;
                  startTransition(async () => { await disconnectGitHub(); router.refresh(); });
                }}
                disabled={pending}
                className="rounded-md border border-n-200 px-3 py-2 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>
        )}
      </div>

      {replacing && (
        <div className="animate-fade-in mt-4 flex flex-wrap items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape" && connected) setReplacing(false); }}
            placeholder="ghp_… or github_pat_…"
            aria-label="GitHub token"
            className="font-num h-9 min-w-0 flex-1 rounded-sm border border-n-200 bg-n-0 px-2.5 text-[12.5px] outline-none focus:border-rust-400"
          />
          <button
            onClick={save}
            disabled={pending || !token.trim()}
            className="rounded-md bg-rust-500 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-50"
          >
            {pending ? "Checking…" : "Save token"}
          </button>
          {connected && (
            <button onClick={() => { setReplacing(false); setError(null); }} className="rounded-md px-2 py-2 text-[12.5px] font-semibold text-n-500 hover:bg-n-100">
              Cancel
            </button>
          )}
          {error && <p className="w-full text-[12px] text-danger">{error}</p>}
          <p className="w-full text-[11.5px] text-n-400">Checked with GitHub before it&apos;s saved. Stored in Studio&apos;s database, never sent anywhere but GitHub.</p>
        </div>
      )}

      <RepoList projectRepo={projectRepo} repos={repos} connected={connected} />

      <div className="mt-4 border-t border-n-100 pt-3">
        <button onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps} className="flex w-full items-center justify-between text-left">
          <span className="text-[12px] font-semibold text-n-600">Making a token {connected && "(done)"}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={clsx("text-n-400 transition-transform duration-[180ms]", showSteps && "rotate-180")}>
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {showSteps && (
          <ol className="animate-fade-in mt-3 space-y-2.5 text-[12.5px] leading-5 text-n-600">
            {[
              <>Open <ExtLink href={NEW_TOKEN_URL}>a new classic token</ExtLink> - it&apos;s already named <b>Studio</b> with the <b>repo</b> scope ticked. Nothing else is needed.</>,
              <>Pick an expiry. <b>Custom → 1 Apr 2027</b> outlasts the project submission; you&apos;ll be told here if it lapses.</>,
              <><b>Generate token</b>, copy it, and paste it above.</>,
              <>If the <b>uog-cose</b> repos still don&apos;t show, the org wants the token authorised: on <ExtLink href="https://github.com/settings/tokens">your tokens page</ExtLink>, <b>Configure SSO → Authorize</b> next to uog-cose.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="font-num mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-n-100 text-[10.5px] font-semibold text-n-600">{i + 1}</span>
                <span className="min-w-0 flex-1">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

/** The Repos menu, edited in place: rename, reorder, remove, add. */
function RepoList({ projectRepo, repos, connected }: { projectRepo: string | null; repos: RepoRow[]; connected: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<Record<string, true | string>>({});

  const all = [...(projectRepo ? [projectRepo] : []), ...repos.map((r) => r.fullName)];
  const key = all.join(",");

  // Whether the token can actually read each repo - the usual surprise with
  // org repos. Cached for five minutes server-side, so this is cheap.
  useEffect(() => {
    if (!connected) return;
    let live = true;
    for (const name of key.split(",").filter(Boolean)) {
      checkRepoAccess(name).then((r) => live && setAccess((a) => ({ ...a, [name]: r.ok ? true : r.error })));
    }
    return () => { live = false; };
  }, [connected, key]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { setError(res.error ?? "Something went wrong."); return; }
      setError(null);
      after?.();
      router.refresh();
    });

  const status = (name: string) => {
    if (!connected) return null;
    const a = access[name];
    if (a === undefined) return <span className="text-[10.5px] text-n-300">checking…</span>;
    if (a === true) return <span className="text-[10.5px] font-medium text-ok">readable</span>;
    return <span title={a} className="text-[10.5px] font-medium text-danger">no access</span>;
  };

  return (
    <div className="mt-4 border-t border-n-100 pt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <Eyebrow>Repos menu</Eyebrow>
        <span className="text-[11px] text-n-400">In the nav, beside Courses</span>
      </div>
      <div className="divide-y divide-n-100 rounded-md border border-n-100">
        {projectRepo && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span className="text-rust-500"><GitHubMark size={13} /></span>
            <span className="w-28 shrink-0 text-[13px] font-medium text-n-800">Project</span>
            <a href={repoUrl(projectRepo)} target="_blank" rel="noreferrer" className="font-num min-w-0 flex-1 truncate text-[11.5px] text-n-500 hover:text-n-800">{projectRepo}</a>
            {status(projectRepo)}
            <span className="text-[10.5px] text-n-400">set on the project page</span>
          </div>
        )}
        {repos.map((r, i) => (
          <div key={r.id} className="group flex items-center gap-2.5 px-3 py-1.5">
            <span className="text-n-400"><GitHubMark size={13} /></span>
            <input
              defaultValue={r.label}
              aria-label={`Menu name for ${r.fullName}`}
              onBlur={(e) => { if (e.target.value.trim() !== r.label) run(() => renameRepo(r.id, e.target.value)); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="w-28 shrink-0 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-n-800 outline-none hover:border-n-200 focus:border-rust-400"
            />
            <a href={repoUrl(r.fullName)} target="_blank" rel="noreferrer" className="font-num min-w-0 flex-1 truncate text-[11.5px] text-n-500 hover:text-n-800">{r.fullName}</a>
            {status(r.fullName)}
            <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <IconButton label="Move up" disabled={i === 0 || pending} onClick={() => run(() => moveRepo(r.id, -1))} d="M3 7.5L6 4.5l3 3" />
              <IconButton label="Move down" disabled={i === repos.length - 1 || pending} onClick={() => run(() => moveRepo(r.id, 1))} d="M3 4.5L6 7.5l3-3" />
              <IconButton label={`Remove ${r.label}`} danger disabled={pending} onClick={() => run(() => removeRepo(r.id))} d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
            </span>
          </div>
        ))}
        <form
          className="flex flex-wrap items-center gap-2 px-3 py-2"
          onSubmit={(e) => { e.preventDefault(); run(() => addRepo(url, label), () => { setUrl(""); setLabel(""); }); }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name"
            aria-label="Name in the menu"
            className="h-8 w-28 rounded-sm border border-n-200 bg-n-0 px-2 text-[12.5px] outline-none focus:border-rust-400"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="github.com/owner/repo"
            aria-label="Repo link or owner/name"
            className="font-num h-8 min-w-0 flex-1 rounded-sm border border-n-200 bg-n-0 px-2 text-[12px] outline-none focus:border-rust-400"
          />
          <button type="submit" disabled={pending || !url.trim()} className="rounded-md border border-n-200 bg-n-0 px-3 py-1.5 text-[12px] font-semibold text-n-700 hover:bg-n-50 disabled:opacity-50">
            Add
          </button>
        </form>
      </div>
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function IconButton({ label, d, onClick, disabled, danger }: { label: string; d: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx("rounded p-1 text-n-400 disabled:opacity-30", danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-n-100 hover:text-n-700")}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d={d} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-rust-600 underline underline-offset-2 hover:text-rust-700">
      {children}
    </a>
  );
}
