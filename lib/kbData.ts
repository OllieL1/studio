import { db } from "./db";
import { describeGitHubError, forgetCached, gh, ghSend, GitHubError, githubToken } from "./github";
import { blobSha } from "./blobSha";
import { isDocPath, type KbChange, type KbDoc } from "./kb";
import { diffLines, diffStats } from "./diff";

/**
 * The Claude knowledge base on GitHub (lib/kb.ts says what it is).
 *
 * Reads go through the GitHub cache, and nearly all of it is addressed by
 * sha - a commit, a tree, a blob never change - so it's cached for good and
 * only the branch head is ever asked again. A KB of fifty docs costs one
 * request per load once it's been seen, and still opens offline.
 *
 * Writes use the Git Data API rather than the contents endpoint, so a move
 * is one commit rather than an add and a delete. Studio writes only what it's
 * asked to - the repo's INDEX.md files are hand-written.
 */

const FOREVER = Number.POSITIVE_INFINITY;
/** How long the branch head is trusted - long enough for tab-hopping, short
 *  enough that a push from a Claude session shows up on the next visit. */
const HEAD_MAX_AGE = 20;

/** The repo, and its own token when it has one (else the main GitHub token). */
export type Kb = { repo: string; token?: string };

export async function kbRepo(): Promise<Kb | null> {
  const row = await db.preference.findUnique({ where: { id: "singleton" }, select: { kbRepo: true, kbToken: true } });
  return row?.kbRepo ? { repo: row.kbRepo, token: row.kbToken ?? undefined } : null;
}

/** Can anything authenticate to the knowledge base? */
export async function kbHasToken(kb: Kb): Promise<boolean> {
  return !!kb.token || !!(await githubToken());
}

type Head = { repo: string; branch: string; commit: string; tree: string; stale: boolean; fetchedAt: Date };

const refPath = (repo: string, branch: string) => `/repos/${repo}/git/ref/heads/${branch}`;

async function head({ repo, token }: Kb, fresh = false): Promise<Head> {
  const info = await gh<{ default_branch: string }>(`/repos/${repo}`, { maxAge: 3600, token });
  const branch = info.data.default_branch;
  const ref = fresh
    ? { data: await ghSend<{ object: { sha: string } }>("GET", refPath(repo, branch), undefined, token), stale: false, fetchedAt: new Date() }
    : await gh<{ object: { sha: string } }>(refPath(repo, branch), { maxAge: HEAD_MAX_AGE, token });
  const commit = await gh<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${ref.data.object.sha}`, { maxAge: FOREVER, token });
  return { repo, branch, commit: ref.data.object.sha, tree: commit.data.tree.sha, stale: ref.stale, fetchedAt: ref.fetchedAt };
}

/** Every file in the tree, path → blob sha. */
async function files({ repo, token }: Kb, tree: string): Promise<Map<string, string>> {
  const r = await gh<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(
    `/repos/${repo}/git/trees/${tree}?recursive=1`,
    { maxAge: FOREVER, token },
  );
  return new Map(r.data.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]));
}

async function blob({ repo, token }: Kb, sha: string): Promise<string> {
  const r = await gh<{ content: string; encoding: string }>(`/repos/${repo}/git/blobs/${sha}`, { maxAge: FOREVER, token });
  return r.data.encoding === "base64" ? Buffer.from(r.data.content, "base64").toString("utf8") : r.data.content;
}

/** The bodies of these files, a few requests at a time. */
async function bodies(kb: Kb, entries: [string, string][]): Promise<KbDoc[]> {
  const out: KbDoc[] = [];
  for (let i = 0; i < entries.length; i += 8) {
    const chunk = entries.slice(i, i + 8);
    out.push(...(await Promise.all(chunk.map(async ([path, sha]) => ({ path, sha, body: await blob(kb, sha) })))));
  }
  return out;
}

export type KbListing = { repo: string; branch: string; docs: KbDoc[]; stale: boolean; fetchedAt: Date };

/** Every doc, by path. Throws a GitHubError when there's nothing to show. */
export async function listKb(kb: Kb): Promise<KbListing> {
  const h = await head(kb);
  const all = await files(kb, h.tree);
  const docs = await bodies(kb, [...all].filter(([p]) => isDocPath(p)).sort(([a], [b]) => a.localeCompare(b)));
  return { repo: kb.repo, branch: h.branch, docs, stale: h.stale, fetchedAt: h.fetchedAt };
}

/** One doc, or null when the path isn't in the repo. `fresh` skips the cached branch head. */
export async function readKbDoc(kb: Kb, path: string, fresh = false): Promise<(KbDoc & { branch: string; stale: boolean }) | null> {
  const h = await head(kb, fresh);
  const sha = (await files(kb, h.tree)).get(path);
  if (!sha) return null;
  return { path, sha, body: await blob(kb, sha), branch: h.branch, stale: h.stale };
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

export type CommitResult =
  | { ok: true; shas: Record<string, string> }
  | { ok: false; error: string; conflicts?: string[] };

/** Why a write failed, in words that say what to do about it. */
function writeError(repo: string, e: unknown): string {
  if (e instanceof GitHubError && (e.kind === "forbidden" || e.kind === "not-found")) {
    return `GitHub won't let this token write to ${repo}. It needs Contents: read and write on this repo (fine-grained) or the repo scope (classic) - set one with "Change repo" on the Claude tab.`;
  }
  if (e instanceof GitHubError && e.status === 409) return `${repo} is empty - add a README on GitHub first, so there's a branch to commit to.`;
  return describeGitHubError(e);
}

/**
 * Commit `changes` as one commit on the default branch.
 *
 * `expect` is each touched path's blob sha as the caller last saw it (null:
 * it shouldn't exist). If the repo has moved on - Claude edited the doc in a
 * session, or another machine saved it - nothing is written and the result
 * names the path, rather than quietly overwriting the newer version.
 */
export async function commitKb(kb: Kb, changes: KbChange[], message: string, expect: Record<string, string | null>): Promise<CommitResult> {
  const { repo, token } = kb;
  for (let attempt = 0; ; attempt++) {
    try {
      const h = await head(kb, true);
      const all = await files(kb, h.tree);

      const conflicts: { path: string; why: string }[] = [];
      for (const [path, sha] of Object.entries(expect)) {
        const now = all.get(path) ?? null;
        const change = changes.find((c) => c.path === path);
        // Already exactly what we're about to write - another tab got there first.
        const same = change && !("delete" in change) && now === blobSha(change.content);
        if (now !== sha && !same) {
          conflicts.push({ path, why: sha === null ? "already exists" : now === null ? "isn't on GitHub any more" : "changed on GitHub since you started editing" });
        }
      }
      if (conflicts.length) {
        const error = conflicts.length === 1
          ? `${conflicts[0].path} ${conflicts[0].why}.`
          : `${conflicts.length} docs changed on GitHub since you started editing them.`;
        return { ok: false, error, conflicts: conflicts.map((c) => c.path) };
      }

      const real = changes.filter((c) => ("delete" in c ? all.has(c.path) : all.get(c.path) !== blobSha(c.content)));
      const shas = Object.fromEntries(changes.flatMap((c) => ("delete" in c ? [] : [[c.path, blobSha(c.content)]])));
      if (real.length === 0) return { ok: true, shas };

      const tree = await ghSend<{ sha: string }>("POST", `/repos/${repo}/git/trees`, {
        base_tree: h.tree,
        tree: real.map((c) =>
          "delete" in c
            ? { path: c.path, mode: "100644", type: "blob", sha: null }
            : { path: c.path, mode: "100644", type: "blob", content: c.content },
        ),
      }, token);
      const commit = await ghSend<{ sha: string }>("POST", `/repos/${repo}/git/commits`, {
        message,
        tree: tree.sha,
        parents: [h.commit],
      }, token);
      // Not forced: if the branch moved since `head`, this fails and we go round again.
      await ghSend("PATCH", `/repos/${repo}/git/refs/heads/${h.branch}`, { sha: commit.sha, force: false }, token);
      await forgetCached(refPath(repo, h.branch));
      return { ok: true, shas };
    } catch (e) {
      // 422 on the ref is "not a fast-forward" - a push landed mid-commit. Once more, from the new head.
      if (attempt === 0 && e instanceof GitHubError && e.status === 422) continue;
      return { ok: false, error: writeError(repo, e) };
    }
  }
}

/** A doc's current body, by the sha the caller holds - for a move. */
export const kbBlob = blob;

/* ── Drafts ──────────────────────────────────────────────────────────────── */

/**
 * Save an uncommitted edit. `base` is the version it started from (null: a
 * new doc). Typing back to exactly that version drops the draft - there's
 * nothing left to commit.
 */
export async function saveDraft(kb: Kb, path: string, base: string | null, body: string): Promise<void> {
  if (base && (await blob(kb, base).catch(() => null)) === body) {
    await db.kbDraft.deleteMany({ where: { repo: kb.repo, path } });
    return;
  }
  await db.kbDraft.upsert({
    where: { repo_path: { repo: kb.repo, path } },
    create: { repo: kb.repo, path, base, body },
    update: { body },
  });
}

export async function getDraft(kb: Kb, path: string) {
  return db.kbDraft.findUnique({ where: { repo_path: { repo: kb.repo, path } } });
}

/**
 * - modified: edited from the version on GitHub now
 * - added: a new doc, not on GitHub yet
 * - behind: GitHub has moved on since the edit started (Claude pushed) -
 *   committing will ask which to keep
 */
export type ChangeState = "modified" | "added" | "behind";

export type KbChangeSummary = {
  path: string;
  state: ChangeState;
  added: number;
  removed: number;
  /** What the edit started from ("" for a new doc), and what it is now. */
  before: string;
  after: string;
};

/**
 * Every uncommitted doc, with its diff stats - for the tree's markers, the
 * Uncommitted bar and the commit dialog. `files` is the repo as it stands
 * (path → sha), when the caller already has it.
 */
export async function listChanges(kb: Kb, files?: Map<string, string>): Promise<KbChangeSummary[]> {
  const drafts = await db.kbDraft.findMany({ where: { repo: kb.repo }, orderBy: { path: "asc" } });
  if (drafts.length === 0) return [];
  const now = files ?? (await filesAtHead(kb));
  const out: KbChangeSummary[] = [];
  for (const d of drafts) {
    const before = d.base ? await blob(kb, d.base).catch(() => null) : "";
    if (before == null) continue; // the base is unreadable - offline, first visit
    if (d.base && before === d.body) {
      await db.kbDraft.deleteMany({ where: { repo: kb.repo, path: d.path } });
      continue;
    }
    const current = now.get(d.path) ?? null;
    const state: ChangeState = d.base === null ? (current ? "behind" : "added") : current === d.base ? "modified" : "behind";
    const stats = diffStats(diffLines(before, d.body));
    out.push({ path: d.path, state, ...stats, before, after: d.body });
  }
  return out;
}

/** The branch commits go to - the repo's default. */
export async function kbBranch(kb: Kb): Promise<string> {
  return (await head(kb)).branch;
}

export async function filesAtHead(kb: Kb): Promise<Map<string, string>> {
  const h = await head(kb);
  return files(kb, h.tree);
}

/** The repo listing and the tree of files it came from, for the tab. */
export async function listKbWithFiles(kb: Kb): Promise<KbListing & { files: Map<string, string> }> {
  const h = await head(kb);
  const all = await files(kb, h.tree);
  const docs = await bodies(kb, [...all].filter(([p]) => isDocPath(p)).sort(([a], [b]) => a.localeCompare(b)));
  return { repo: kb.repo, branch: h.branch, docs, stale: h.stale, fetchedAt: h.fetchedAt, files: all };
}
