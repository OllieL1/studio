/**
 * The GitHub cache and the issue → task sync, against the real database with
 * GitHub itself stubbed out. Uses a repo name GitHub could never have and a
 * throwaway course, and removes both - your data and your token are never
 * touched.
 */
import assert from "node:assert/strict";
process.env.GITHUB_TOKEN ||= "test-token";

import { db } from "../lib/db";
import { gh, GitHubError } from "../lib/github";
import { syncLinkedIssues, searchIssues, repoIssues } from "../lib/githubData";

const REPO = "__studio-test__/scratch";
const SCRATCH = "__TEST_GITHUB__";

type Reply = { status: number; body?: unknown; etag?: string } | "offline";
let replies: Reply[] = [];
let seen: { url: string; ifNoneMatch: string | null }[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const headers = new Headers(init?.headers);
  seen.push({ url, ifNoneMatch: headers.get("if-none-match") });
  const r = replies.shift();
  if (!r) throw new Error(`Unexpected request: ${url}`);
  if (r === "offline") throw new TypeError("fetch failed");
  return new Response(r.status === 304 ? null : JSON.stringify(r.body ?? {}), {
    status: r.status,
    headers: r.etag ? { etag: r.etag } : {},
  });
}) as typeof fetch;

const issue = (n: number, state: "open" | "closed", title = `Issue ${n}`) => ({
  number: n, title, state, html_url: `https://github.com/${REPO}/issues/${n}`, user: { login: "x" }, labels: [],
  comments: 0, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z",
  closed_at: state === "closed" ? "2026-10-05T00:00:00Z" : null,
});

const tests: [string, () => Promise<void>][] = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);

async function clearCache() {
  await db.gitHubCache.deleteMany({ where: { key: { contains: "__studio-test__" } } });
}

/* ── The cache ── */

test("a fresh answer is served without asking GitHub again", async () => {
  await clearCache();
  replies = [{ status: 200, body: { n: 1 }, etag: '"v1"' }];
  seen = [];
  const a = await gh<{ n: number }>(`/repos/${REPO}`, { maxAge: 60 });
  const b = await gh<{ n: number }>(`/repos/${REPO}`, { maxAge: 60 });
  assert.equal(a.data.n, 1);
  assert.equal(b.data.n, 1);
  assert.equal(seen.length, 1, "second read came from the cache");
});

test("an old answer is re-checked with its ETag, and a 304 keeps it", async () => {
  replies = [{ status: 304 }];
  seen = [];
  const r = await gh<{ n: number }>(`/repos/${REPO}`, { maxAge: 0 });
  assert.equal(seen[0].ifNoneMatch, '"v1"');
  assert.equal(r.data.n, 1);
  assert.equal(r.stale, false);
});

test("offline, the last answer is served and marked stale", async () => {
  replies = ["offline"];
  const r = await gh<{ n: number }>(`/repos/${REPO}`, { maxAge: 0 });
  assert.equal(r.data.n, 1);
  assert.equal(r.stale, true);
});

test("offline with nothing cached is an error that says so", async () => {
  replies = ["offline"];
  await assert.rejects(gh(`/repos/${REPO}/nothing-cached`, { maxAge: 0 }), (e) => e instanceof GitHubError && e.kind === "offline");
});

test("a revoked token is reported, not papered over with the cache", async () => {
  replies = [{ status: 401 }];
  await assert.rejects(gh(`/repos/${REPO}`, { maxAge: 0 }), (e) => e instanceof GitHubError && e.kind === "unauthorized");
});

/* ── Issues → tasks ── */

test("when the last linked issue closes, the task and its checklist tick", async () => {
  const course = await db.course.create({ data: { code: SCRATCH, name: "Scratch", shortName: "S", colour: "#8A4430", position: 999 } });
  const task = await db.task.create({
    data: {
      courseId: course.id, title: "Ship login", kind: "COURSEWORK",
      items: { create: [{ label: "Write it", position: 0, doneAt: new Date() }, { label: "Test it", position: 1 }] },
      issues: { create: [{ repo: REPO, number: 1, title: "Login", state: "open" }, { repo: REPO, number: 2, title: "Tests", state: "open" }] },
    },
  });

  // One of two closes: nothing ticks, but the snapshot updates.
  await clearCache();
  replies = [{ status: 200, body: [issue(1, "closed", "Login flow"), issue(2, "open"), { ...issue(3, "open"), pull_request: {} }] }];
  await syncLinkedIssues({ repos: [REPO], maxAge: 0 });
  let t = await db.task.findUnique({ where: { id: task.id }, include: { items: true, issues: { orderBy: { number: "asc" } } } });
  assert.equal(t!.doneAt, null);
  assert.deepEqual(t!.issues.map((i) => [i.state, i.title]), [["closed", "Login flow"], ["open", "Issue 2"]]);

  // The second closes: the task ticks, every item with it.
  await clearCache();
  replies = [{ status: 200, body: [issue(1, "closed"), issue(2, "closed")] }];
  const res = await syncLinkedIssues({ repos: [REPO], maxAge: 0 });
  assert.equal(res.changed, true);
  t = await db.task.findUnique({ where: { id: task.id }, include: { items: true, issues: true } });
  assert.ok(t!.doneAt, "task done");
  assert.ok(t!.items.every((i) => i.doneAt), "every item ticked");

  // Untick by hand, sync again: Studio leaves it alone.
  await db.task.update({ where: { id: task.id }, data: { doneAt: null } });
  await db.taskItem.updateMany({ where: { taskId: task.id }, data: { doneAt: null } });
  await clearCache();
  replies = [{ status: 200, body: [issue(1, "closed"), issue(2, "closed")] }];
  await syncLinkedIssues({ repos: [REPO], maxAge: 0 });
  const after = await db.task.findUnique({ where: { id: task.id } });
  assert.equal(after!.doneAt, null, "an unticked task stays unticked");
});

test("issue search: numbers, words, open first, and quiet when GitHub is down", async () => {
  await clearCache();
  replies = [{ status: 200, body: [issue(12, "closed", "Fix login bug"), issue(3, "open", "Login page"), issue(120, "open", "Docs")] }];
  await repoIssues(REPO, 0);
  assert.deepEqual((await searchIssues(REPO, "12")).map((i) => i.number), [12, 120]);
  assert.deepEqual((await searchIssues(REPO, "#3")).map((i) => i.number), [3]);
  assert.deepEqual((await searchIssues(REPO, "login")).map((i) => i.number), [3, 12], "open before closed");
  assert.deepEqual(await searchIssues("__studio-test__/never-fetched", "x").catch(() => "threw"), [], "an unreachable repo gives no results, not an error");
});

(async () => {
  await db.course.deleteMany({ where: { code: SCRATCH } });
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
    catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
  }
  await db.course.deleteMany({ where: { code: SCRATCH } });
  await clearCache();
  await db.$disconnect();
  console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
