/** GitHub: repo names, response shaping, the activity feed, commit rhythm, issue → task sync, and the agenda section. */
import assert from "node:assert/strict";
import { parseRepo, issueUrl } from "../lib/repos";
import {
  describeEvent, repoWorkBetween, syncIssueLinks, toCommits, toIssues, toPulls, weeklyCommits,
  type Issue, type IssueLink, type RawEvent, type RawIssue,
} from "../lib/githubModel";
import { draftAgenda, AGENDA_COMMIT_LIMIT } from "../lib/project";
import { extractMentions, mentionHref, parseIssueRef, serializeMention, stripMentions, issueRef } from "../lib/mentions";
import { renderMarkdown } from "../lib/markdown";
import { parseInline } from "../lib/pdf/markdown";

const tests: [string, () => void | Promise<void>][] = [];
const test = (n: string, f: () => void | Promise<void>) => tests.push([n, f]);

const REPO = "uog-cose/MCR-5082P";

const rawIssue = (n: number, over: Partial<RawIssue> = {}): RawIssue => ({
  number: n, title: `Issue ${n}`, state: "open", html_url: issueUrl(REPO, n), user: { login: "ollie" },
  labels: [], comments: 0, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-02T10:00:00Z", closed_at: null,
  ...over,
});

const issue = (n: number, over: Partial<Issue> = {}): Issue => ({ ...toIssues([rawIssue(n)])[0], ...over });

/* ── Names ── */

test("a repo is recognised however it's pasted", () => {
  for (const s of [
    "https://github.com/uog-cose/MCR-5082P",
    "https://github.com/uog-cose/MCR-5082P/",
    "https://github.com/uog-cose/MCR-5082P.git",
    "github.com/uog-cose/MCR-5082P/issues/3",
    "https://www.github.com/uog-cose/MCR-5082P#readme",
    "git@github.com:uog-cose/MCR-5082P.git",
    "uog-cose/MCR-5082P",
    "  uog-cose/MCR-5082P  ",
  ]) assert.equal(parseRepo(s), REPO, s);
});

test("things that aren't repos are refused", () => {
  for (const s of ["", "MCR-5082P", "https://gitlab.com/a/b", "https://github.com/uog-cose", "a/b/c", "../x"]) {
    assert.equal(parseRepo(s), null, s);
  }
  assert.equal(parseRepo(null), null);
});

/* ── Shaping ── */

test("pull requests are filtered out of the issues list", () => {
  const out = toIssues([rawIssue(1), rawIssue(2, { pull_request: {} }), rawIssue(3)]);
  assert.deepEqual(out.map((i) => i.number), [1, 3]);
});

test("labels survive both shapes GitHub sends them in", () => {
  const [i] = toIssues([rawIssue(1, { labels: [{ name: "bug", color: "d73a4a" }, "plain", { name: "" }] })]);
  assert.deepEqual(i.labels, [{ name: "bug", colour: "#d73a4a" }, { name: "plain", colour: null }]);
});

test("a merged pull request reads as merged, not closed", () => {
  const base = {
    title: "t", html_url: "u", user: null, head: { ref: "feat" }, base: { ref: "main" },
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", closed_at: "2026-10-02T00:00:00Z",
  };
  const [merged, closed] = toPulls([
    { ...base, number: 1, state: "closed", merged_at: "2026-10-02T00:00:00Z" },
    { ...base, number: 2, state: "closed", merged_at: null },
  ]);
  assert.equal(merged.state, "merged");
  assert.equal(closed.state, "closed");
});

test("a commit keeps only its first line, and falls back to the git author", () => {
  const [c] = toCommits([{ sha: "abc", html_url: "u", author: null, commit: { message: "Add login\n\nLonger body", author: { name: "Ollie", date: "2026-10-03T09:00:00Z" } } }]);
  assert.equal(c.title, "Add login");
  assert.equal(c.author, "Ollie");
});

/* ── Activity ── */

const ev = (type: string, payload: Record<string, unknown>): RawEvent => ({
  id: "1", type, actor: { login: "OllieL1" }, created_at: "2026-10-05T12:00:00Z", payload,
});

test("the feed describes the events that matter", () => {
  assert.equal(describeEvent(ev("PushEvent", { ref: "refs/heads/main", size: 3, head: "abc" }), REPO)?.verb, "pushed 3 commits to");
  assert.equal(describeEvent(ev("PushEvent", { ref: "refs/heads/main", size: 1 }), REPO)?.verb, "pushed 1 commit to");
  assert.equal(describeEvent(ev("PullRequestEvent", { action: "closed", number: 4, pull_request: { merged: true, title: "Auth" } }), REPO)?.subject, "#4 Auth");
  assert.equal(describeEvent(ev("PullRequestEvent", { action: "closed", number: 4, pull_request: { merged: true } }), REPO)?.verb, "merged");
  assert.equal(describeEvent(ev("IssuesEvent", { action: "opened", issue: { number: 9, title: "Crash" } }), REPO)?.verb, "opened issue");
  assert.equal(describeEvent(ev("CreateEvent", { ref_type: "branch", ref: "feat/x" }), REPO)?.subject, "feat/x");
});

test("trimmed payloads still describe something, and noise is dropped", () => {
  // GitHub has been removing fields from event payloads; a push with no size
  // or a PR with no title should still read sensibly.
  assert.equal(describeEvent(ev("PushEvent", { ref: "refs/heads/main" }), REPO)?.verb, "pushed to");
  assert.equal(describeEvent(ev("PullRequestEvent", { action: "opened", number: 7, pull_request: {} }), REPO)?.subject, "#7");
  assert.equal(describeEvent(ev("WatchEvent", {}), REPO), null);
  assert.equal(describeEvent(ev("IssuesEvent", { action: "labeled", issue: { number: 1 } }), REPO), null);
  assert.equal(describeEvent(ev("CreateEvent", { ref_type: "repository" }), REPO), null);
});

/* ── Commit rhythm ── */

test("commits land in their Monday-start week, with empty weeks kept", () => {
  const from = new Date(2026, 8, 21); // Mon 21 Sep
  const now = new Date(2026, 9, 8, 12); // Thu 8 Oct
  const weeks = weeklyCommits(
    [
      { at: new Date(2026, 8, 21, 9).toISOString() }, // Mon, week 0
      { at: new Date(2026, 8, 27, 23).toISOString() }, // Sun, still week 0
      { at: new Date(2026, 9, 5, 10).toISOString() }, // week 2
      { at: new Date(2026, 8, 1).toISOString() }, // before the start - ignored
      { at: "not a date" },
    ],
    from,
    now,
  );
  assert.deepEqual(weeks.map((w) => w.count), [2, 0, 1]);
  assert.equal(weeks[2].weekStart.getDate(), 5);
});

/* ── Issues → tasks ── */

const link = (taskId: string, number: number, state: string, over: Partial<IssueLink> = {}): IssueLink => ({
  taskId, repo: REPO, number, title: `Issue ${number}`, state, taskDone: false, ...over,
});

test("a task ticks when its only issue closes", () => {
  const r = syncIssueLinks([link("t1", 1, "open")], REPO, [issue(1, { state: "closed", closedAt: "2026-10-05T00:00:00Z" })]);
  assert.deepEqual(r.complete, ["t1"]);
  assert.equal(r.updates[0].state, "closed");
});

test("a task with two issues waits for both", () => {
  const links = [link("t1", 1, "open"), link("t1", 2, "open")];
  const one = syncIssueLinks(links, REPO, [issue(1, { state: "closed" }), issue(2)]);
  assert.deepEqual(one.complete, []);
  const both = syncIssueLinks([link("t1", 1, "closed"), link("t1", 2, "open")], REPO, [issue(1, { state: "closed" }), issue(2, { state: "closed" })]);
  assert.deepEqual(both.complete, ["t1"]);
});

test("nothing ticks without a transition - linking a closed issue, or unticking by hand", () => {
  // Already closed when linked: stays as the person left it.
  assert.deepEqual(syncIssueLinks([link("t1", 1, "closed")], REPO, [issue(1, { state: "closed" })]).complete, []);
  // Already done: no work to do.
  assert.deepEqual(syncIssueLinks([link("t1", 1, "open", { taskDone: true })], REPO, [issue(1, { state: "closed" })]).complete, []);
});

test("a reopened issue updates the link but never unticks the task", () => {
  const r = syncIssueLinks([link("t1", 1, "closed", { taskDone: true })], REPO, [issue(1, { state: "open" })]);
  assert.deepEqual(r.complete, []);
  assert.equal(r.updates[0].state, "open");
});

test("issues GitHub didn't return, or from another repo, are left alone", () => {
  const r = syncIssueLinks([link("t1", 1, "open"), link("t1", 5, "open", { repo: "someone/else" })], REPO, [issue(2, { state: "closed" })]);
  assert.deepEqual(r, { updates: [], complete: [] });
});

test("a renamed issue updates its snapshot", () => {
  const r = syncIssueLinks([link("t1", 1, "open")], REPO, [issue(1, { title: "Better title" })]);
  assert.equal(r.updates[0].title, "Better title");
  assert.deepEqual(r.complete, []);
});

/* ── Mentions ── */

test("an issue mention round-trips and links to GitHub", () => {
  const token = serializeMention("issue", issueRef(REPO, 12), "Fix login");
  assert.equal(token, "@i[uog-cose/MCR-5082P#12|Fix login]");
  assert.deepEqual(extractMentions(token), [{ kind: "issue", id: `${REPO}#12`, label: "Fix login" }]);
  assert.deepEqual(parseIssueRef(`${REPO}#12`), { repo: REPO, number: 12 });
  assert.equal(parseIssueRef("nonsense"), null);
  assert.equal(mentionHref("issue", `${REPO}#12`), `https://github.com/${REPO}/issues/12`);
  assert.equal(stripMentions(`See ${token}.`), "See #12 Fix login.");
});

test("an issue chip renders with its number, opening on GitHub", async () => {
  const html = renderMarkdown(`Blocked on @i[${REPO}#12|Fix login].`);
  assert.match(html, /class="md-chip md-chip-issue"/);
  assert.match(html, /href="https:\/\/github\.com\/uog-cose\/MCR-5082P\/issues\/12"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /#12 <\/span>Fix login/);
});

test("the PDF prints an issue as its number and title, still clickable", () => {
  const parts = parseInline(`Blocked on @i[${REPO}#12|Fix login].`);
  const chip = parts.find((p) => p.text.startsWith("#12"));
  assert.ok(chip, "chip present");
  assert.equal(chip!.text, "#12 Fix login");
  assert.equal(chip!.link, `https://github.com/${REPO}/issues/12`);
});

/* ── Agenda ── */

const commit = (title: string, at: string) => ({ sha: title, title, url: "", author: "ollie", at });

test("repo work is windowed to between the meetings", () => {
  const from = new Date("2026-10-01T00:00:00Z");
  const to = new Date("2026-10-08T00:00:00Z");
  const w = repoWorkBetween(REPO, {
    commits: [commit("before", "2026-09-30T12:00:00Z"), commit("b", "2026-10-03T12:00:00Z"), commit("a", "2026-10-02T12:00:00Z"), commit("after", "2026-10-09T00:00:00Z")],
    pulls: [],
    issues: [
      issue(1, { state: "closed", closedAt: "2026-10-04T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" }),
      issue(2, { createdAt: "2026-10-05T00:00:00Z" }),
      issue(3, { state: "closed", closedAt: "2026-09-20T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" }),
    ],
  }, from, to);
  assert.deepEqual(w.commits.map((c) => c.title), ["a", "b"], "oldest first, out-of-window dropped");
  assert.deepEqual(w.issuesClosed.map((i) => i.number), [1]);
  assert.deepEqual(w.issuesOpened.map((i) => i.number), [2]);
});

const agendaBase = {
  meetingTitle: "Supervisor meeting", since: new Date(2026, 9, 1), minutesLogged: 0, sessions: 0,
  tasksDone: [], papersRead: [], papersAdded: 0, openActions: [], upcoming: [], prepOutstanding: [],
};

test("the agenda lists the repo's work, issues as chips", () => {
  const md = draftAgenda({
    ...agendaBase,
    github: {
      repo: REPO,
      commits: [commit("Add login", "2026-10-02T00:00:00Z")],
      pullsOpened: [], issuesOpened: [],
      pullsMerged: [{ ...toPulls([{ number: 4, title: "Auth [wip]", state: "closed", html_url: "https://github.com/x/pull/4", user: null, head: { ref: "a" }, base: { ref: "main" }, created_at: "", updated_at: "", merged_at: "2026-10-03T00:00:00Z", closed_at: null }])[0] }],
      issuesClosed: [issue(12, { title: "Fix login", state: "closed" })],
    },
  });
  assert.ok(md.includes("## On GitHub"));
  assert.ok(md.includes("**1 commit**"));
  assert.ok(md.includes("  - Add login"));
  assert.ok(md.includes("[#4 Auth wip](https://github.com/x/pull/4)"), "brackets can't break the link");
  assert.ok(md.includes(`@i[${REPO}#12|Fix login]`));
});

test("a long run of commits is summarised", () => {
  const commits = Array.from({ length: AGENDA_COMMIT_LIMIT + 3 }, (_, i) => commit(`c${i}`, "2026-10-02T00:00:00Z"));
  const md = draftAgenda({ ...agendaBase, github: { repo: REPO, commits, pullsOpened: [], pullsMerged: [], issuesOpened: [], issuesClosed: [] } });
  assert.ok(md.includes(`**${AGENDA_COMMIT_LIMIT + 3} commits**`));
  assert.ok(md.includes("_and 3 more_"));
  assert.ok(!md.includes(`c${AGENDA_COMMIT_LIMIT}\n`));
});

test("the agenda says when GitHub couldn't be reached, and says nothing when it isn't set up", () => {
  assert.ok(draftAgenda({ ...agendaBase, github: { error: "offline" } }).includes("Couldn't reach GitHub"));
  assert.ok(!draftAgenda({ ...agendaBase, github: null }).includes("GitHub"));
  assert.ok(!draftAgenda(agendaBase).includes("GitHub"));
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
    catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
  }
  console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
