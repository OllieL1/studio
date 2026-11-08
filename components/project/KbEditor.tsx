"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteKbDoc, fetchKbDoc, moveKbDoc, saveKbDoc } from "@/app/kbActions";
import { docHref } from "@/lib/kb";
import { isModeToggle, MODE_SHORTCUT } from "@/lib/editor/shortcuts";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import { LiveEditor } from "../editor/LiveEditor";
import { clsx } from "@/lib/clsx";

/** Read and write browser storage without ever throwing. */
const draftStore = {
  get(key: string): { base: string; body: string } | null {
    try {
      const v = JSON.parse(window.localStorage.getItem(key) ?? "null");
      return v && typeof v.base === "string" && typeof v.body === "string" ? v : null;
    } catch { return null; }
  },
  set(key: string, v: { base: string; body: string }) {
    try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* not kept, still works */ }
  },
  clear(key: string) {
    try { window.localStorage.removeItem(key); } catch { /* nothing to clear */ }
  },
};

type Dialog = { then: string | null };
type Failure = { error: string; conflict: boolean };

/**
 * One knowledge-base doc: the lectures' editor, minus the @ mentions (Claude
 * reads plain markdown), committing to the repo instead of saving to the
 * database.
 *
 * Nothing is committed until asked: ⌘S opens a dialog for the commit
 * message, and so does following a link away with edits outstanding. Until
 * then the edits sit in this browser's storage, so a reload, the back button
 * or a crash loses nothing - they're back the next time the doc opens.
 *
 * If the doc changed on GitHub meanwhile - Claude edited it in a session -
 * nothing is overwritten: the dialog offers GitHub's version or keeping this one.
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
  const draftKey = `studio.kb.draft:${repo}:${doc.path}`;
  /** The version the edits are based on - a restored draft's may be older. */
  const sha = useRef(doc.sha);
  /** The newest version this page knows is on GitHub, and what it says. */
  const committedSha = useRef(doc.sha);
  const committed = useRef(doc.body);
  /** What's in the editor now. */
  const body = useRef(doc.body);
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = (d: boolean) => { dirtyRef.current = d; setDirtyState(d); };

  const [raw, setRaw] = useState(false);
  /** Bumped to remount the editor on other text - a restored draft, a discard, GitHub's version. */
  const [generation, setGeneration] = useState(0);
  const [editorText, setEditorText] = useState(doc.body);
  const [restored, setRestored] = useState<null | "same" | "older">(null);
  const [nothing, setNothing] = useState(false);

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [committing, setCommitting] = useState(false);
  /** Set once we've decided to go - the link guard lets the navigation through. */
  const leaving = useRef(false);

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(doc.path);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const showText = (text: string) => {
    setEditorText(text);
    setGeneration((g) => g + 1);
  };

  // Edits left from last time come back - based on the version they were
  // made against, so if GitHub has moved on since, committing says so.
  useEffect(() => {
    const draft = draftStore.get(draftKey);
    if (!draft) return;
    if (draft.body === doc.body) return draftStore.clear(draftKey);
    sha.current = draft.base;
    body.current = draft.body;
    setDirty(true);
    setRestored(draft.base === doc.sha ? "same" : "older");
    showText(draft.body);
    // Once, on opening the doc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const onChange = useCallback((text: string) => {
    body.current = text;
    const d = text !== committed.current;
    setDirty(d);
    if (d) draftStore.set(draftKey, { base: sha.current, body: text });
    else draftStore.clear(draftKey);
  }, [draftKey]);

  const go = (href: string) => {
    leaving.current = true;
    router.push(href as Route);
  };

  const closeDialog = () => {
    setDialog(null);
    setFailure(null);
  };

  const commit = async (overwrite = false) => {
    if (committing) return;
    setCommitting(true);
    setFailure(null);
    const sent = body.current;
    const res = await saveKbDoc(doc.path, sent, sha.current, message, overwrite)
      .catch(() => ({ ok: false as const, error: "Couldn't reach Studio's server.", conflict: false }));
    setCommitting(false);
    if (!res.ok) return setFailure({ error: res.error, conflict: !!res.conflict });
    sha.current = res.sha;
    committedSha.current = res.sha;
    committed.current = sent;
    const still = body.current !== sent;
    setDirty(still);
    if (still) draftStore.set(draftKey, { base: res.sha, body: body.current });
    else draftStore.clear(draftKey);
    setRestored(null);
    setMessage("");
    const then = dialog?.then;
    closeDialog();
    if (then) go(then);
  };

  /** Throw the edits away: back to the committed text, or on to where we were going. */
  const discard = () => {
    draftStore.clear(draftKey);
    const then = dialog?.then;
    closeDialog();
    setRestored(null);
    if (then) return go(then);
    sha.current = committedSha.current;
    body.current = committed.current;
    setDirty(false);
    showText(committed.current);
  };

  /** After a conflict: drop the edits and load what GitHub has now. */
  const takeTheirs = async () => {
    const then = dialog?.then;
    if (then) {
      draftStore.clear(draftKey);
      closeDialog();
      return go(then);
    }
    setCommitting(true);
    const res = await fetchKbDoc(doc.path);
    setCommitting(false);
    if (!res.ok) return setFailure({ error: res.error, conflict: false });
    draftStore.clear(draftKey);
    closeDialog();
    setRestored(null);
    sha.current = committedSha.current = res.sha;
    committed.current = body.current = res.body;
    setDirty(false);
    showText(res.body);
  };

  const openCommit = useCallback(() => {
    if (!dirtyRef.current) {
      setNothing(true);
      setTimeout(() => setNothing(false), 1500);
      return;
    }
    setDialog((d) => d ?? { then: null });
  }, []);

  // ⌘S opens the commit dialog; ⌥M flips Live / Markdown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        openCommit();
      }
      if (!dialog && isModeToggle(e)) {
        e.preventDefault();
        setRaw((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openCommit, dialog]);

  // Leaving with edits outstanding. A link inside Studio opens the commit
  // dialog first - caught in the capture phase, before Next's <Link> sees the
  // click. Closing or reloading the tab gets the browser's own prompt; the
  // draft is kept either way.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || leaving.current) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setDialog({ then: url.pathname + url.search + url.hash });
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !leaving.current) e.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  const rename = () =>
    startTransition(async () => {
      setRenameError(null);
      const res = await moveKbDoc(doc.path, name, sha.current);
      if (!res.ok) return setRenameError(res.error);
      setRenaming(false);
      go(docHref(res.path));
    });

  const remove = () => {
    if (!confirm(`Delete ${doc.path} from ${repo}? It stays in the repo's history.`)) return;
    startTransition(async () => {
      const res = await deleteKbDoc(doc.path, sha.current);
      if (!res.ok) return setRenameError(res.error);
      draftStore.clear(draftKey);
      go("/project?tab=claude");
    });
  };

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
            <h1 className="font-num min-w-0 flex-1 truncate text-[18px] leading-9 font-semibold text-n-900" title={doc.path}>
              {doc.path}
            </h1>
            <button
              onClick={() => setRenaming(true)}
              disabled={dirty}
              className={btn}
              title={dirty ? "Commit or discard your edits first" : "Rename, or move into a folder with a /"}
            >
              Rename
            </button>
          </>
        )}
        <button
          onClick={openCommit}
          className={clsx(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-semibold transition-colors duration-[120ms]",
            dirty ? "bg-rust-500 text-white hover:bg-rust-600" : "border border-n-200 bg-n-0 text-n-400",
          )}
          title={`Commit to ${repo} · ${branch} (⌘S)`}
        >
          <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", dirty ? "bg-white" : "bg-ok")} />
          {nothing ? "Nothing to commit" : dirty ? "Commit · ⌘S" : "Committed"}
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

      {restored && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <span className="min-w-0 flex-1">
            {restored === "same"
              ? "Your uncommitted edits from last time are back."
              : "Your uncommitted edits from last time are back - but the doc has changed on GitHub since. Committing will ask which to keep."}
          </span>
          <button onClick={discard} className={btn}>Discard them</button>
        </div>
      )}

      <div className="card px-3 py-3 sm:px-5">
        <LiveEditor
          key={generation}
          initial={editorText}
          initialHtml={generation === 0 ? initialHtml : undefined}
          onSave={onChange}
          eager
          mentions={false}
          raw={raw}
          onRawChange={setRaw}
          placeholder="Write in markdown. [ inserts blocks. Claude reads this exactly as written. ⌘S to commit."
        />
      </div>

      {dialog && (
        <CommitDialog
          path={doc.path}
          repo={repo}
          branch={branch}
          leaving={dialog.then != null}
          message={message}
          onMessage={setMessage}
          committing={committing}
          failure={failure}
          onCommit={() => void commit()}
          onKeepMine={() => void commit(true)}
          onUseTheirs={() => void takeTheirs()}
          onDiscard={discard}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

function CommitDialog({
  path, repo, branch, leaving, message, onMessage, committing, failure, onCommit, onKeepMine, onUseTheirs, onDiscard, onClose,
}: {
  path: string;
  repo: string;
  branch: string;
  /** Opened by following a link - the choices are commit or discard, then go. */
  leaving: boolean;
  message: string;
  onMessage: (m: string) => void;
  committing: boolean;
  failure: Failure | null;
  onCommit: () => void;
  onKeepMine: () => void;
  onUseTheirs: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const btn = "flex h-8 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50";

  return (
    <ModalLock onClose={onClose} initialFocus={inputRef}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] px-4 pt-[14vh] backdrop-blur-[2px]"
          {...backdropProps(onClose)}
          role="dialog"
          aria-modal="true"
          aria-label="Commit"
        >
          <form
            onSubmit={(e) => { e.preventDefault(); onCommit(); }}
            className="card animate-scale-in w-full max-w-[520px] p-0"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <div className="border-b border-n-100 px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-400">
                {leaving ? "Uncommitted changes" : "Commit"}
              </p>
              <p className="font-num mt-0.5 truncate text-[12.5px] text-n-600" title={path}>
                {path} <span className="text-n-400">→ {repo} · {branch}</span>
              </p>
            </div>
            <input
              ref={inputRef}
              value={message}
              onChange={(e) => onMessage(e.target.value)}
              placeholder={`Edit ${path}`}
              aria-label="Commit message"
              className="block w-full bg-transparent px-4 py-3 text-[14px] leading-6 text-n-900 outline-none placeholder:text-n-400"
            />
            {failure && (
              <div className="flex flex-wrap items-center gap-2 border-t border-n-100 bg-danger-soft px-4 py-2 text-[12.5px] text-danger">
                <span className="min-w-0 flex-1">{failure.error}</span>
                {failure.conflict && (
                  <>
                    <button type="button" onClick={onUseTheirs} className={btn}>Use GitHub&apos;s version</button>
                    <button type="button" onClick={onKeepMine} className={btn}>Keep mine</button>
                  </>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-n-100 px-4 py-2">
              <button type="button" onClick={onDiscard} className={clsx(btn, "text-n-500 hover:bg-danger-soft hover:text-danger")}>
                {leaving ? "Discard and leave" : "Discard changes"}
              </button>
              <span className="ml-auto text-[11px] text-n-400">↵ commit · Esc {leaving ? "stay" : "close"}</span>
              <button type="button" onClick={onClose} className={btn}>{leaving ? "Stay" : "Cancel"}</button>
              <button
                type="submit"
                disabled={committing}
                className="flex h-8 shrink-0 items-center rounded-md bg-rust-500 px-3 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50"
              >
                {committing ? "Committing…" : leaving ? "Commit and leave" : "Commit"}
              </button>
            </div>
          </form>
        </div>
      </Portal>
    </ModalLock>
  );
}
