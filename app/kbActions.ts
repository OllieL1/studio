"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { describeGitHubError, gh } from "@/lib/github";
import { commitKb, kbBlob, kbRepo, type Kb } from "@/lib/kbData";
import { normalizeDocPath, starterBody } from "@/lib/kb";
import { parseRepo } from "@/lib/repos";

/**
 * The Claude knowledge base: which repo it is, and every edit - each one a
 * commit to that repo (lib/kbData.ts). Commit messages say "Studio:" so a
 * `git log` tells Studio's edits from a Claude session's.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean };

function refresh() {
  revalidatePath("/project");
}

async function kbOrError(): Promise<{ kb: Kb } | { ok: false; error: string }> {
  const kb = await kbRepo();
  return kb ? { kb } : { ok: false, error: "No knowledge-base repo set - add one on the Claude tab." };
}

/**
 * Point the Claude tab at a repo, with a token of its own or none (the main
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

/**
 * Save a doc's body. `sha` is the version it was opened at; the new one comes
 * back. `overwrite` is "keep mine" after a conflict - it skips the check.
 */
export async function saveKbDoc(path: string, body: string, sha: string, overwrite = false): Promise<Result<{ sha: string }>> {
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  const res = await commitKb(r.kb, [{ path, content: body }], `Studio: edit ${path}`, overwrite ? {} : { [path]: sha });
  if (!res.ok) return { ok: false, error: res.error, conflict: !!res.conflict };
  refresh();
  return { ok: true, sha: res.shas[path] };
}

export async function createKbDoc(input: string): Promise<Result<{ path: string }>> {
  const p = normalizeDocPath(input);
  if (!p.ok) return p;
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  const res = await commitKb(r.kb, [{ path: p.path, content: starterBody(p.path) }], `Studio: add ${p.path}`, { [p.path]: null });
  if (!res.ok) return { ok: false, error: res.error, conflict: !!res.conflict };
  refresh();
  return { ok: true, path: p.path };
}

/** Rename or move into a folder - one commit, so history follows it. */
export async function moveKbDoc(from: string, input: string, sha: string): Promise<Result<{ path: string; sha: string }>> {
  const p = normalizeDocPath(input);
  if (!p.ok) return p;
  if (p.path === from) return { ok: true, path: from, sha };
  const r = await kbOrError();
  if (!("kb" in r)) return r;
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
  if (!res.ok) return { ok: false, error: res.error, conflict: !!res.conflict };
  refresh();
  return { ok: true, path: p.path, sha: res.shas[p.path] };
}

export async function deleteKbDoc(path: string, sha: string): Promise<Result> {
  const r = await kbOrError();
  if (!("kb" in r)) return r;
  const res = await commitKb(r.kb, [{ path, delete: true }], `Studio: delete ${path}`, { [path]: sha });
  if (!res.ok) return { ok: false, error: res.error, conflict: !!res.conflict };
  refresh();
  return { ok: true };
}
