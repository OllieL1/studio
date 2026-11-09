"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { describeGitHubError, gh } from "@/lib/github";
import { commitKb, filesAtHead, getDraft, kbBlob, kbRepo, readKbDoc, saveDraft, type Kb } from "@/lib/kbData";
import { normalizeDocPath, starterBody } from "@/lib/kb";
import { parseRepo } from "@/lib/repos";

/**
 * The knowledge base (KB): which repo it is, its drafts, and its commits.
 *
 * Edits and new docs are drafts (KbDraft) until ⌘S commits the ticked ones
 * together, with the message typed in the commit dialog. Moves and deletes
 * of committed docs commit straight away and say "Studio:".
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; conflicts?: string[] };

function refresh() {
  revalidatePath("/project");
}

async function kbOrError(): Promise<{ kb: Kb } | { ok: false; error: string }> {
  const kb = await kbRepo();
  return kb ? { kb } : { ok: false, error: "No knowledge-base repo set - add one on the KB tab." };
}

/**
 * Point the KB tab at a repo, with a token of its own or none (the main
 * GitHub token). A blank token keeps the one already saved; `clearToken`
 * drops it. Checked against GitHub first, so a typo says so now. A blank
 * repo clears the lot.
 */
export async function setKbRepo(input: string, rawToken = "", clearToken = false): Promise<Result> {
  const fullName = input.trim() ? parseRepo(input) : null;
  if (input.trim() && !fullName) return { ok: false, error: "Paste a GitHub link, an SSH remote, or owner/name." };
  const typed = rawToken.trim();
  if (/\s/.test(typed)) return { ok: false, error: "That token has spaces in it - a token is one unbroken string." };
  const saved = (await kbRepo())?.token;
  const token = !fullName || clearToken ? undefined : typed || saved;
  if (fullName) {
    try {
      await gh(`/repos/${fullName}`, { maxAge: 0, token });
    } catch (e) {
      return { ok: false, error: describeGitHubError(e) };
    }
  }
  await db.preference.upsert({
    where: { id: "singleton" },
    update: { kbRepo: fullName, kbToken: token ?? null },
    create: { id: "singleton", kbRepo: fullName, kbToken: token ?? null },
  });
  refresh();
  return { ok: true };
}

/** A doc as GitHub has it right now - "Use GitHub's version" after a conflict. */
export async function fetchKbDoc(path: string): Promise<Result<{ sha: string; body: string }>> {
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  try {
    const doc = await readKbDoc(r.kb, path, true);
    return doc ? { ok: true, sha: doc.sha, body: doc.body } : { ok: false, error: `${path} isn't on GitHub any more.` };
  } catch (e) {
    return { ok: false, error: describeGitHubError(e) };
  }
}

/* ── Drafts ──────────────────────────────────────────────────────────────── */

/** Save what's typed - called by the editor like any note's save. */
export async function saveKbDraft(path: string, body: string, base: string | null): Promise<Result> {
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  await saveDraft(r.kb, path, base, body);
  return { ok: true };
}

/** Throw an uncommitted edit away - for a new doc, the doc itself. */
export async function discardKbDraft(path: string): Promise<Result> {
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  await db.kbDraft.deleteMany({ where: { repo: r.kb.repo, path } });
  refresh();
  return { ok: true };
}

/** "Use GitHub's version": drop the draft, and hand back what GitHub has. */
export async function takeGitHubVersion(path: string): Promise<Result<{ sha: string | null; body: string }>> {
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  await db.kbDraft.deleteMany({ where: { repo: r.kb.repo, path } });
  refresh();
  const doc = await fetchKbDoc(path);
  // Gone from GitHub (or a new doc someone else made first and then removed): nothing to show.
  return doc.ok ? doc : { ok: true, sha: null, body: "" };
}

const defaultMessage = (drafts: { path: string; base: string | null }[]) =>
  drafts.length === 1 ? `${drafts[0].base ? "Edit" : "Add"} ${drafts[0].path}` : `Edit ${drafts.length} docs`;

/**
 * Commit these drafts as one commit. Each is checked against the version it
 * started from, except those in `overwrite` ("keep mine"); if any changed on
 * GitHub, nothing is committed and `conflicts` names them.
 *
 * A draft typed into while the commit was in flight is kept, rebased onto
 * the new commit, so those last keystrokes are still uncommitted rather than lost.
 */
export async function commitKbDrafts(paths: string[], message: string, overwrite: string[] = []): Promise<Result<{ shas: Record<string, string> }>> {
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  const drafts = await db.kbDraft.findMany({ where: { repo: r.kb.repo, path: { in: paths } } });
  if (drafts.length === 0) return { ok: false, error: "Nothing to commit - those edits were already committed or discarded." };
  const res = await commitKb(
    r.kb,
    drafts.map((d) => ({ path: d.path, content: d.body })),
    message.trim() || defaultMessage(drafts),
    Object.fromEntries(drafts.filter((d) => !overwrite.includes(d.path)).map((d) => [d.path, d.base])),
  );
  if (!res.ok) return { ok: false, error: res.error, conflicts: res.conflicts };
  for (const d of drafts) {
    await db.kbDraft.deleteMany({ where: { repo: r.kb.repo, path: d.path, body: d.body } });
    await db.kbDraft.updateMany({ where: { repo: r.kb.repo, path: d.path }, data: { base: res.shas[d.path] } });
  }
  refresh();
  return { ok: true, shas: res.shas };
}

/* ── Docs ────────────────────────────────────────────────────────────────── */

/** A new doc - a draft, all green, until it's committed with its first content. */
export async function createKbDoc(input: string): Promise<Result<{ path: string }>> {
  const p = normalizeDocPath(input);
  if (!p.ok) return p;
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  let files: Map<string, string>;
  try {
    files = await filesAtHead(r.kb);
  } catch (e) {
    return { ok: false, error: describeGitHubError(e) };
  }
  const taken = (q: string) => [...files.keys()].some((f) => f.toLowerCase() === q.toLowerCase());
  if (taken(p.path) || (await getDraft(r.kb, p.path))) return { ok: false, error: `${p.path} already exists.` };
  await saveDraft(r.kb, p.path, null, starterBody(p.path));
  refresh();
  return { ok: true, path: p.path };
}

/**
 * Rename or move into a folder. A new doc's draft just moves; a committed
 * doc moves in one commit, so history follows it - and its draft goes with
 * it, still based on the same blob (a move doesn't change the content's sha).
 */
export async function moveKbDoc(from: string, input: string): Promise<Result<{ path: string }>> {
  const p = normalizeDocPath(input);
  if (!p.ok) return p;
  if (p.path === from) return { ok: true, path: from };
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  const { repo } = r.kb;
  if (await getDraft(r.kb, p.path)) return { ok: false, error: `${p.path} already exists.` };

  let files: Map<string, string>;
  try {
    files = await filesAtHead(r.kb);
  } catch (e) {
    return { ok: false, error: describeGitHubError(e) };
  }
  const sha = files.get(from);
  if (sha) {
    let body: string;
    try {
      body = await kbBlob(r.kb, sha);
    } catch (e) {
      return { ok: false, error: describeGitHubError(e) };
    }
    const res = await commitKb(
      r.kb,
      [{ path: from, delete: true }, { path: p.path, content: body }],
      `Studio: move ${from} → ${p.path}`,
      { [from]: sha, [p.path]: null },
    );
    if (!res.ok) return { ok: false, error: res.error, conflicts: res.conflicts };
  } else if (!(await getDraft(r.kb, from))) {
    return { ok: false, error: `${from} isn't on GitHub any more.` };
  }
  await db.kbDraft.updateMany({ where: { repo, path: from }, data: { path: p.path } });
  refresh();
  return { ok: true, path: p.path };
}

/** Delete a doc - committed straight away; a new doc that was never committed just goes. */
export async function deleteKbDoc(path: string): Promise<Result> {
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  let files: Map<string, string>;
  try {
    files = await filesAtHead(r.kb);
  } catch (e) {
    return { ok: false, error: describeGitHubError(e) };
  }
  const sha = files.get(path);
  if (sha) {
    const res = await commitKb(r.kb, [{ path, delete: true }], `Studio: delete ${path}`, { [path]: sha });
    if (!res.ok) return { ok: false, error: res.error, conflicts: res.conflicts };
  }
  await db.kbDraft.deleteMany({ where: { repo: r.kb.repo, path } });
  refresh();
  return { ok: true };
}
