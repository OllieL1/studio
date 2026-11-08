/**
 * Committing to the Claude knowledge base, against the real database with
 * GitHub replaced by a small in-memory git server - refs, commits, trees and
 * blobs, enough of the Git Data API for lib/kbData.ts. Uses a repo name
 * GitHub could never have and removes its cache rows; your token and data are
 * never touched.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { db } from "../lib/db";
import { commitKb, listKb, readKbDoc, type Kb } from "../lib/kbData";
import { blobSha } from "../lib/blobSha";

const REPO = "__studio-test__/kb";
const KB: Kb = { repo: REPO, token: "test-token" };

/* ── A tiny GitHub ───────────────────────────────────────────────────────── */

const blobs = new Map<string, string>();
const trees = new Map<string, Map<string, string>>(); // tree sha → path → blob sha
const commits = new Map<string, { tree: string; parents: string[] }>();
let ref = "";
let commitCount = 0;
/** Runs just before a ref update - a push landing mid-commit. */
let beforeRefUpdate: (() => void) | null = null;
/** Make writes fail with this status. */
let refuseWrites: number | null = null;

const hash = (s: string) => createHash("sha1").update(s).digest("hex");
const putTree = (files: Map<string, string>) => {
  const sha = hash(JSON.stringify([...files].sort()));
  trees.set(sha, files);
  return sha;
};
const putCommit = (tree: string, parents: string[]) => {
  const sha = hash(`${tree}:${parents.join()}:${commitCount++}`);
  commits.set(sha, { tree, parents });
  return sha;
};
const filesAt = (commit = ref) => trees.get(commits.get(commit)!.tree)!;
const content = (path: string) => {
  const sha = filesAt().get(path);
  return sha ? blobs.get(sha)! : null;
};

function reset(files: Record<string, string>) {
  blobs.clear(); trees.clear(); commits.clear();
  const map = new Map<string, string>();
  for (const [p, c] of Object.entries(files)) {
    blobs.set(blobSha(c), c);
    map.set(p, blobSha(c));
  }
  ref = putCommit(putTree(map), []);
  commitCount = 0;
  beforeRefUpdate = null;
  refuseWrites = null;
}

/** A commit made elsewhere - Claude pushing from a session. */
function pushElsewhere(path: string, body: string) {
  const files = new Map(filesAt());
  blobs.set(blobSha(body), body);
  files.set(path, blobSha(body));
  ref = putCommit(putTree(files), [ref]);
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const p = url.pathname.replace(`/repos/${REPO}`, "");
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (method !== "GET" && refuseWrites) return json({ message: "Resource not accessible by personal access token" }, refuseWrites);

  if (method === "GET" && p === "") return json({ default_branch: "main" });
  if (method === "GET" && p === "/git/ref/heads/main") return json({ object: { sha: ref } });
  let m;
  if (method === "GET" && (m = /^\/git\/commits\/(\w+)$/.exec(p))) return json({ tree: { sha: commits.get(m[1])!.tree } });
  if (method === "GET" && (m = /^\/git\/trees\/(\w+)$/.exec(p))) {
    return json({ tree: [...trees.get(m[1])!].map(([path, sha]) => ({ path, type: "blob", sha })), truncated: false });
  }
  if (method === "GET" && (m = /^\/git\/blobs\/(\w+)$/.exec(p))) {
    return json({ content: Buffer.from(blobs.get(m[1])!).toString("base64"), encoding: "base64" });
  }
  if (method === "POST" && p === "/git/trees") {
    const files = new Map(trees.get(body.base_tree)!);
    for (const e of body.tree) {
      if (e.sha === null) files.delete(e.path);
      else {
        blobs.set(blobSha(e.content), e.content);
        files.set(e.path, blobSha(e.content));
      }
    }
    return json({ sha: putTree(files) }, 201);
  }
  if (method === "POST" && p === "/git/commits") return json({ sha: putCommit(body.tree, body.parents) }, 201);
  if (method === "PATCH" && p === "/git/refs/heads/main") {
    beforeRefUpdate?.();
    beforeRefUpdate = null;
    if (!body.force && !commits.get(body.sha)!.parents.includes(ref)) return json({ message: "Update is not a fast forward" }, 422);
    ref = body.sha;
    return json({ object: { sha: ref } });
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
}) as typeof fetch;

/* ── Tests ───────────────────────────────────────────────────────────────── */

const tests: [string, () => Promise<void>][] = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);
const clearCache = () => db.gitHubCache.deleteMany({ where: { key: { startsWith: `/repos/${REPO}` } } });

test("a new doc lands with a rebuilt INDEX.md, in one commit", async () => {
  reset({ "README.md": "# KB\n\nWhat this is." });
  const r = await commitKb(KB, [{ path: "work/how.md", content: "# How I work\n\nSmall commits." }], "add", { "work/how.md": null });
  assert.ok(r.ok);
  assert.equal(r.shas["work/how.md"], blobSha("# How I work\n\nSmall commits."));
  assert.equal(commitCount, 1);
  assert.equal(content("work/how.md"), "# How I work\n\nSmall commits.");
  assert.match(content("INDEX.md")!, /- \[How I work\]\(work\/how\.md\) - Small commits\./);
  assert.match(content("INDEX.md")!, /- \[KB\]\(README\.md\)/);
});

test("the listing has every doc but the index, and reads one by path", async () => {
  const kb = await listKb(KB);
  assert.deepEqual(kb.docs.map((d) => d.path), ["README.md", "work/how.md"]);
  assert.equal(kb.branch, "main");
  const doc = await readKbDoc(KB, "work/how.md");
  assert.equal(doc?.body, "# How I work\n\nSmall commits.");
  assert.equal(await readKbDoc(KB, "nope.md"), null);
});

test("a doc that changed on GitHub isn't overwritten", async () => {
  const opened = blobSha("# How I work\n\nSmall commits.");
  pushElsewhere("work/how.md", "# How I work\n\nClaude's edit.");
  const before = ref;
  const r = await commitKb(KB, [{ path: "work/how.md", content: "mine" }], "edit", { "work/how.md": opened });
  assert.ok(!r.ok && r.conflict === "work/how.md");
  assert.equal(ref, before);
  assert.equal(content("work/how.md"), "# How I work\n\nClaude's edit.");
});

test("…unless asked to keep mine", async () => {
  const r = await commitKb(KB, [{ path: "work/how.md", content: "mine" }], "edit", {});
  assert.ok(r.ok);
  assert.equal(content("work/how.md"), "mine");
});

test("saving what's already there makes no commit", async () => {
  const before = ref;
  const r = await commitKb(KB, [{ path: "work/how.md", content: "mine" }], "edit", { "work/how.md": blobSha("mine") });
  assert.ok(r.ok);
  assert.equal(ref, before);
});

test("creating a path that exists is refused", async () => {
  const r = await commitKb(KB, [{ path: "README.md", content: "x" }], "add", { "README.md": null });
  assert.ok(!r.ok && /already exists/.test(r.error));
});

test("a push landing mid-commit is retried from the new head, keeping both", async () => {
  beforeRefUpdate = () => pushElsewhere("other.md", "# Other\n\nPushed meanwhile.");
  const r = await commitKb(KB, [{ path: "work/how.md", content: "mine, again" }], "edit", { "work/how.md": blobSha("mine") });
  assert.ok(r.ok);
  assert.equal(content("work/how.md"), "mine, again");
  assert.equal(content("other.md"), "# Other\n\nPushed meanwhile.");
  assert.match(content("INDEX.md")!, /\[Other\]\(other\.md\)/);
});

test("a move is one commit: old path gone, new one there, index follows", async () => {
  const before = commitCount;
  const sha = filesAt().get("other.md")!;
  const r = await commitKb(KB, [{ path: "other.md", delete: true }, { path: "notes/other.md", content: "# Other\n\nPushed meanwhile." }], "move", { "other.md": sha, "notes/other.md": null });
  assert.ok(r.ok);
  assert.equal(commitCount, before + 1);
  assert.equal(content("other.md"), null);
  assert.ok(content("notes/other.md"));
  assert.doesNotMatch(content("INDEX.md")!, /\(other\.md\)/);
  assert.match(content("INDEX.md")!, /## notes\//);
});

test("a token that can't write says what it needs", async () => {
  refuseWrites = 403;
  const r = await commitKb(KB, [{ path: "x.md", content: "x" }], "add", { "x.md": null });
  assert.ok(!r.ok && /Contents: read and write/.test(r.error));
  refuseWrites = null;
});

(async () => {
  await clearCache();
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
    catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
  }
  await clearCache();
  await db.$disconnect();
  console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
