"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteKbDoc, moveKbDoc, saveKbDraft, takeGitHubVersion } from "@/app/kbActions";
import { docHref, titleOf } from "@/lib/kb";
import { pdfTab } from "@/lib/pdfTab";
import { isModeToggle, MODE_SHORTCUT } from "@/lib/editor/shortcuts";
import { LiveEditor } from "../editor/LiveEditor";
import { clsx } from "@/lib/clsx";
import { DiffStatsLabel, KbDiff, useDiff } from "./KbDiff";
import { KbCommitDialog, type CommitFile } from "./KbCommitDialog";
import { FolderPathInput } from "./FolderPathInput";

const DIFF_OPEN_KEY = "studio.kb.diffOpen";
const stored = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { window.localStorage.setItem(key, value); } catch { /* not remembered, still works */ }
  },
  remove(key: string) {
    try { window.localStorage.removeItem(key); } catch { /* nothing to remove */ }
  },
};

/**
 * One knowledge-base doc: the lectures' editor, minus the @ mentions (Claude
 * reads plain markdown).
 *
 * What's typed is a draft - saved to the stick's database as you go, exactly
 * like a note, so it survives leaving, reloading and switching machines. A
 * live diff at the top shows what's uncommitted, GitHub style. ⌘S opens the
 * commit dialog with this doc ticked (the other uncommitted docs listed, to
 * tick too if wanted); nothing reaches GitHub until then.
 */
export function KbEditor({
  path,
  repo,
  branch,
  committed,
  base: initialBase,
  baseBody,
  text: initialText,
  initialHtml,
  others,
  folders,
}: {
  path: string;
  repo: string;
  branch: string;
  /** What GitHub has now; null for a new doc not committed yet. */
  committed: { sha: string; body: string } | null;
  /** The version the draft started from (null: a new doc), and what it said. */
  base: string | null;
  baseBody: string;
  /** What's in the editor: the draft, else what GitHub has. */
  text: string;
  initialHtml: string[];
  /** The other uncommitted docs, for the commit dialog. */
  others: CommitFile[];
  /** Every folder in the KB, for completing a rename. */
  folders: string[];
}) {
  const router = useRouter();
  const base = useRef(initialBase);
  const [before, setBefore] = useState(baseBody);
  const [text, setText] = useState(initialText);
  const textRef = useRef(initialText);
  /** What was saved for the commit in flight - the new baseline once it lands. */
  const flushed = useRef(initialText);
  const [isNew, setIsNew] = useState(!committed);
  const [behind, setBehind] = useState(!!committed && initialBase !== committed.sha);

  /** Bumped to remount the editor on other text - GitHub's version, a migrated draft. */
  const [generation, setGeneration] = useState(0);
  const [editorText, setEditorText] = useState(initialText);
  const showText = (t: string) => {
    textRef.current = t;
    setText(t);
    setEditorText(t);
    setGeneration((g) => g + 1);
  };

  const [raw, setRaw] = useState(false);
  const [diffOpen, setDiffOpen] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [nothing, setNothing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(path);
  const [busy, startTransition] = useTransition();

  const { hunks, stats } = useDiff(before, text);
  const dirty = text !== before;

  useEffect(() => {
    if (stored.get(DIFF_OPEN_KEY) === "0") setDiffOpen(false);
  }, []);
  const toggleDiff = () => {
    setDiffOpen((o) => {
      stored.set(DIFF_OPEN_KEY, o ? "0" : "1");
      return !o;
    });
  };

  // Drafts used to live in the browser; one left from then moves to the
  // database the first time its doc opens, unless the database has one already.
  useEffect(() => {
    const key = `studio.kb.draft:${repo}:${path}`;
    try {
      const old = JSON.parse(stored.get(key) ?? "null");
      stored.remove(key);
      if (!old || typeof old.body !== "string" || typeof old.base !== "string") return;
      if (initialText !== (committed?.body ?? "") || old.body === initialText) return;
      base.current = old.base;
      void saveKbDraft(path, old.body, old.base).then(() => router.refresh());
      showText(old.body);
    } catch { /* nothing to move */ }
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (body: string) => {
    await saveKbDraft(path, body, base.current);
  }, [path]);

  const onChange = useCallback((body: string) => {
    textRef.current = body;
    setText(body);
  }, []);

  const go = (href: string) => router.push(href as Route);

  /** The PDF of what's on screen: the last keystrokes are saved first, so it
   *  matches. The tab opens straight away - a popup opened after a wait is
   *  blocked - and is pointed at the PDF once the save lands. */
  const exportPdf = async () => {
    const tab = window.open("", "_blank");
    try {
      await saveKbDraft(path, textRef.current, base.current);
    } catch { /* the PDF is of the last save */ }
    const href = pdfTab(`/api/project/kb/pdf?path=${encodeURIComponent(path)}`, titleOf(path, textRef.current));
    if (tab) tab.location.href = href;
    else window.open(href, "_blank");
  };

  const openCommit = useCallback(() => {
    if (textRef.current === before && others.length === 0) {
      setNothing(true);
      setTimeout(() => setNothing(false), 1500);
      return;
    }
    setDialog(true);
  }, [before, others.length]);

  // ⌘S: the commit dialog. ⌥M: Live / Markdown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!dialog) openCommit();
      }
      if (!dialog && isModeToggle(e)) {
        e.preventDefault();
        setRaw((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openCommit, dialog]);

  /** Take GitHub's version as the new starting point. */
  const adopt = (sha: string, body: string) => {
    base.current = sha;
    setBefore(body);
    setIsNew(false);
    setBehind(false);
    showText(body);
  };

  /** Back to what GitHub has - the draft (or, for a new doc, the doc) goes. */
  const discard = () => {
    if (!confirm(isNew ? `Discard ${path}? It was never committed, so it goes entirely.` : `Discard your uncommitted changes to ${path}?`)) return;
    startTransition(async () => {
      const res = await takeGitHubVersion(path);
      if (!res.ok) return setError(res.error);
      if (!res.sha) return go("/project?tab=kb");
      adopt(res.sha, res.body);
      router.refresh();
    });
  };

  const rename = () =>
    startTransition(async () => {
      setError(null);
      if (dirty) await save(textRef.current);
      const res = await moveKbDoc(path, name);
      if (!res.ok) return setError(res.error);
      setRenaming(false);
      go(docHref(res.path));
    });

  const remove = () => {
    if (!confirm(`Delete ${path}${isNew ? "" : ` from ${repo}? It stays in the repo's history`}${dirty && !isNew ? ", and your uncommitted changes go with it" : ""}.`)) return;
    startTransition(async () => {
      const res = await deleteKbDoc(path);
      if (!res.ok) return setError(res.error);
      go("/project?tab=kb");
    });
  };

  const self: CommitFile = { path, state: isNew ? "added" : behind ? "behind" : "modified", ...stats };
  const files = [...(dirty ? [self] : []), ...others.filter((o) => o.path !== path)];

  const btn = "flex h-8 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <form onSubmit={(e) => { e.preventDefault(); rename(); }} className="flex min-w-0 flex-1 items-center gap-2">
            <FolderPathInput
              autoFocus
              value={name}
              onChange={setName}
              folders={folders}
              onKeyDown={(e) => { if (e.key === "Escape") { setName(path); setRenaming(false); } }}
              aria-label="Path"
              wrapperClassName="min-w-0 flex-1"
              className="font-num h-9 min-w-0 rounded-md border border-n-200 bg-n-0 px-2 text-[15px] text-n-900 outline-none focus:border-rust-400"
            />
            <button type="submit" disabled={busy} className={btn}>{busy ? "Moving…" : "Move"}</button>
          </form>
        ) : (
          <>
            <h1 className="font-num min-w-0 flex-1 truncate text-[18px] leading-9 font-semibold text-n-900" title={path}>{path}</h1>
            <button onClick={() => setRenaming(true)} className={btn} title="Rename, or move into a folder with a /">Rename</button>
          </>
        )}
        <button
          onClick={openCommit}
          className={clsx(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-semibold transition-colors duration-[120ms]",
            dirty ? "bg-rust-500 text-white hover:bg-rust-600" : "border border-n-200 bg-n-0 text-n-500 hover:bg-n-50",
          )}
          title={`Commit to ${repo} · ${branch} (⌘S)`}
        >
          <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", dirty ? "bg-white" : "bg-ok")} />
          {nothing ? "Nothing to commit" : dirty ? "Commit · ⌘S" : others.length ? `Commit others · ${others.length}` : "Committed"}
        </button>
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
        {!isNew && (
          <a
            href={`https://github.com/${repo}/blob/${branch}/${path.split("/").map(encodeURIComponent).join("/")}`}
            target="_blank"
            rel="noreferrer"
            className={btn}
            title="Open on GitHub - history, blame"
          >
            GitHub ↗
          </a>
        )}
        <button onClick={() => void exportPdf()} className={btn} title="Export this doc to PDF - as it is in Studio, uncommitted changes included">PDF</button>
        <button onClick={remove} disabled={busy} className={clsx(btn, "text-n-500 hover:bg-danger-soft hover:text-danger")}>Delete</button>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}

      {dirty && (
        <div className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-n-100 px-3 py-1.5">
            <button onClick={toggleDiff} aria-expanded={diffOpen} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-left">
              <span aria-hidden className={clsx("w-2.5 shrink-0 text-[9px] text-n-400 transition-transform duration-[120ms]", diffOpen && "rotate-90")}>▶</span>
              <span className="text-[12px] font-semibold text-n-700">{isNew ? "New doc - not committed" : "Uncommitted changes"}</span>
              <DiffStatsLabel {...stats} />
              {behind && <span className="text-[11.5px] text-danger-ink">GitHub has changed since you started - committing will ask which to keep.</span>}
            </button>
            <button onClick={discard} disabled={busy} className={clsx(btn, "h-7 text-n-500 hover:bg-danger-soft hover:text-danger")}>Discard</button>
            <button onClick={openCommit} className={clsx(btn, "h-7")}>Commit · ⌘S</button>
          </div>
          {diffOpen && <KbDiff hunks={hunks} className="max-h-[38vh] overflow-y-auto py-1" />}
        </div>
      )}

      <div className="card px-3 py-3 sm:px-5">
        <LiveEditor
          key={generation}
          initial={editorText}
          initialHtml={generation === 0 ? initialHtml : undefined}
          onSave={save}
          onChange={onChange}
          mentions={false}
          raw={raw}
          onRawChange={setRaw}
          placeholder="Write in markdown. [ inserts blocks. Claude reads this exactly as written. ⌘S to commit."
        />
      </div>

      {dialog && (
        <KbCommitDialog
          files={files}
          ticked={dirty ? [path] : others.map((o) => o.path)}
          repo={repo}
          branch={branch}
          beforeCommit={dirty ? () => save((flushed.current = textRef.current)) : undefined}
          onCommitted={(paths, shas) => {
            if (paths.includes(path) && shas[path]) {
              base.current = shas[path];
              setBefore(flushed.current);
              setIsNew(false);
              setBehind(false);
            }
            setDialog(false);
            router.refresh();
          }}
          onTookTheirs={(p, doc) => {
            if (p !== path) return;
            if (!doc.sha) return go("/project?tab=kb");
            adopt(doc.sha, doc.body);
          }}
          onClose={() => setDialog(false)}
        />
      )}
    </div>
  );
}
