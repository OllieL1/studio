import { db } from "./db";
import { gh, ghAll, GitHubError, isGitHubConnected } from "./github";
import { parseRepo } from "./repos";
import { completeTask } from "./tasks";
import { PROJECT_TIMELINE_START } from "./project";
import {
  describeEvent, repoWorkBetween, syncIssueLinks, toCommits, toIssues, toPulls,
  type Activity, type Commit, type Issue, type Pull, type RawCommit, type RawEvent,
  type RawIssue, type RawPull, type RawRepo, type RepoWork,
} from "./githubModel";

/**
 * GitHub, the half that talks to the network and the database: the project
 * repo's overview, the Repos menu, issue search for `@i`, and keeping
 * task-issue links in step.
 */

/** The project's repo as "owner/name", from the link on the project page. */
export async function projectRepo(): Promise<string | null> {
  const course = await db.course.findFirst({ where: { isProject: true }, select: { repoUrl: true } });
  return parseRepo(course?.repoUrl);
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

const enc = (fullName: string) => fullName.split("/").map(encodeURIComponent).join("/");

/**
 * Every issue, open and closed, most recently updated first. One list serves
 * the tab, `@i` search and the task sync. Capped at 500 - far beyond a
 * project repo, and the cap only ever drops the stalest.
 */
export async function repoIssues(fullName: string, maxAge = 60) {
  const r = await ghAll<RawIssue>(`/repos/${enc(fullName)}/issues?state=all&sort=updated&direction=desc`, { maxAge, maxPages: 5 });
  const issues = toIssues(r.data);
  remember(fullName, issues);
  await applyIssueSync(fullName, issues);
  return { ...r, data: issues };
}

/** Recently updated pull requests, open and closed - one page is plenty. */
async function repoPulls(fullName: string, maxAge = 60) {
  const r = await gh<RawPull[]>(`/repos/${enc(fullName)}/pulls?state=all&sort=updated&direction=desc&per_page=100`, { maxAge });
  return { ...r, data: toPulls(r.data) };
}

/**
 * Default-branch commits since the project began. The `since` is fixed rather
 * than "the last N weeks", so the URL - and with it the ETag - stays put.
 */
async function repoCommits(fullName: string, maxAge = 60) {
  const since = PROJECT_TIMELINE_START.toISOString();
  const r = await ghAll<RawCommit>(`/repos/${enc(fullName)}/commits?since=${since}`, { maxAge, maxPages: 10 });
  return { ...r, data: toCommits(r.data) };
}

/* ── The project repo ────────────────────────────────────────────────────── */

export type RepoOverview = {
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  url: string;
  defaultBranch: string;
  pushedAt: string | null;
  issues: Issue[];
  pulls: Pull[];
  commits: Commit[];
  activity: Activity[];
  /** The oldest of the pieces - what "updated" honestly means. */
  fetchedAt: Date;
  stale: boolean;
};

/** Everything the GitHub tab shows. Throws GitHubError if the repo can't be read at all. */
export async function repoOverview(fullName: string, { maxAge = 60 }: { maxAge?: number } = {}): Promise<RepoOverview> {
  const [repo, issues, pulls, commits, events] = await Promise.all([
    gh<RawRepo>(`/repos/${enc(fullName)}`, { maxAge }),
    repoIssues(fullName, maxAge),
    repoPulls(fullName, maxAge),
    repoCommits(fullName, maxAge),
    // The feed is a nicety: if it fails alone, the tab still shows.
    gh<RawEvent[]>(`/repos/${enc(fullName)}/events?per_page=60`, { maxAge }).catch(() => null),
  ]);
  const pieces = [repo, issues, pulls, commits, ...(events ? [events] : [])];
  return {
    fullName: repo.data.full_name,
    description: repo.data.description,
    isPrivate: repo.data.private,
    url: repo.data.html_url,
    defaultBranch: repo.data.default_branch,
    pushedAt: repo.data.pushed_at,
    issues: issues.data,
    pulls: pulls.data,
    commits: commits.data,
    activity: (events?.data ?? []).map((e) => describeEvent(e, fullName)).filter((a): a is Activity => !!a),
    fetchedAt: new Date(Math.min(...pieces.map((p) => p.fetchedAt.getTime()))),
    stale: pieces.some((p) => p.stale),
  };
}

/* ── Issues for @i and the task linker ───────────────────────────────────── */

/**
 * Parsed issue lists, kept in memory for a few minutes. The `@i` menu
 * searches on every keystroke; re-reading and re-parsing the cached JSON from
 * a database on a USB stick each time would be the slow part.
 */
const memo = new Map<string, { at: number; issues: Issue[] }>();
const MEMO_MS = 3 * 60_000;

function remember(fullName: string, issues: Issue[]) {
  memo.set(fullName.toLowerCase(), { at: Date.now(), issues });
}

async function issuesFor(fullName: string): Promise<Issue[]> {
  const hit = memo.get(fullName.toLowerCase());
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.issues;
  return (await repoIssues(fullName, 300)).data;
}

/**
 * Issues matching what's been typed: `12` or `#12` finds that number, words
 * match the title. Open before closed, then most recently updated. Returns
 * nothing (rather than throwing) when GitHub isn't available, because a
 * mention menu that errors is worse than one that's quiet.
 */
export async function searchIssues(fullName: string, query: string, limit = 8): Promise<Issue[]> {
  let issues: Issue[];
  try {
    issues = await issuesFor(fullName);
  } catch {
    return [];
  }
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const ranked = issues
    .map((i) => {
      if (!q) return { i, score: 1 };
      if (/^\d+$/.test(q)) {
        const n = String(i.number);
        return { i, score: n === q ? 3 : n.startsWith(q) ? 2 : 0 };
      }
      const title = i.title.toLowerCase();
      const words = q.split(/\s+/);
      if (!words.every((w) => title.includes(w))) return { i, score: 0 };
      return { i, score: title.startsWith(q) ? 2 : 1 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      (a.i.state === b.i.state ? 0 : a.i.state === "open" ? -1 : 1) ||
      b.i.updatedAt.localeCompare(a.i.updatedAt),
    );
  return ranked.slice(0, limit).map((x) => x.i);
}

/** One issue by number - from the cached list, or a fresh one if it's newer than the cache. */
export async function findIssue(fullName: string, number: number): Promise<Issue | null> {
  const cached = (await issuesFor(fullName)).find((i) => i.number === number);
  if (cached) return cached;
  return (await repoIssues(fullName, 0)).data.find((i) => i.number === number) ?? null;
}

/* ── Keeping task links in step ──────────────────────────────────────────── */

/** Write a fresh issue list into the task links for that repo; tick tasks whose last issue closed. */
async function applyIssueSync(fullName: string, issues: Issue[]): Promise<{ changed: boolean }> {
  const links = await db.taskIssue.findMany({
    where: { repo: fullName },
    include: { task: { select: { doneAt: true } } },
  });
  if (links.length === 0) return { changed: false };
  // Every link of an affected task, from any repo, so "all closed" is judged across all of them.
  const taskIds = [...new Set(links.map((l) => l.taskId))];
  const all = await db.taskIssue.findMany({
    where: { taskId: { in: taskIds } },
    include: { task: { select: { doneAt: true } } },
  });
  const { updates, complete } = syncIssueLinks(
    all.map((l) => ({ taskId: l.taskId, repo: l.repo, number: l.number, title: l.title, state: l.state, taskDone: !!l.task.doneAt })),
    fullName,
    issues,
  );
  if (updates.length === 0 && complete.length === 0) return { changed: false };
  await db.$transaction(
    updates.map((u) =>
      db.taskIssue.update({
        where: { taskId_repo_number: { taskId: u.taskId, repo: u.repo, number: u.number } },
        data: { title: u.title, state: u.state, closedAt: u.closedAt ? new Date(u.closedAt) : null },
      }),
    ),
  );
  for (const taskId of complete) await completeTask(db, taskId);
  return { changed: true };
}

/**
 * Refresh every repo that has linked tasks. Run after a response (see
 * `after()` on the home and project pages), so it never slows a page down.
 */
export async function syncLinkedIssues({ maxAge = 300, repos }: { maxAge?: number; repos?: string[] } = {}): Promise<{ changed: boolean }> {
  if (!(await isGitHubConnected())) return { changed: false };
  const names = repos ?? (await db.taskIssue.findMany({ distinct: ["repo"], select: { repo: true } })).map((r) => r.repo);
  let changed = false;
  for (const name of names) {
    try {
      const before = await db.taskIssue.findMany({ where: { repo: name }, select: { state: true, title: true } });
      await repoIssues(name, maxAge);
      const after = await db.taskIssue.findMany({ where: { repo: name }, select: { state: true, title: true } });
      changed ||= JSON.stringify(before) !== JSON.stringify(after);
    } catch {
      // Offline or the repo's gone: the snapshot stands until next time.
    }
  }
  return { changed };
}

/* ── The Repos menu ──────────────────────────────────────────────────────── */

export type RepoMenuEntry = {
  fullName: string;
  label: string;
  isProject: boolean;
};

export async function repoMenu(): Promise<RepoMenuEntry[]> {
  const [project, repos] = await Promise.all([projectRepo(), db.repo.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] })]);
  const out: RepoMenuEntry[] = project ? [{ fullName: project, label: "Project", isProject: true }] : [];
  for (const r of repos) {
    if (project && r.fullName.toLowerCase() === project.toLowerCase()) continue;
    out.push({ fullName: r.fullName, label: r.label, isProject: false });
  }
  return out;
}

export type RepoPulse = { fullName: string; openIssues: number; openPulls: number; pushedAt: string | null } | { fullName: string; error: string };

/** Open issues, open PRs and last push for a repo - what the menu shows beside each link. */
export async function repoPulse(fullName: string): Promise<RepoPulse> {
  try {
    const [repo, pulls] = await Promise.all([
      gh<RawRepo>(`/repos/${enc(fullName)}`, { maxAge: 300 }),
      gh<RawPull[]>(`/repos/${enc(fullName)}/pulls?state=open&per_page=100`, { maxAge: 300 }),
    ]);
    // open_issues_count counts pull requests too.
    return {
      fullName,
      openPulls: pulls.data.length,
      openIssues: Math.max(0, repo.data.open_issues_count - pulls.data.length),
      pushedAt: repo.data.pushed_at,
    };
  } catch (e) {
    return { fullName, error: e instanceof GitHubError ? e.kind : "other" };
  }
}

/* ── The agenda ──────────────────────────────────────────────────────────── */

/**
 * What happened in the project repo between two meetings, for "Draft from
 * recent work". Null when GitHub isn't set up; `{ error }` when it is but
 * couldn't be reached, so the draft can say so rather than silently leave
 * the repo out.
 */
export async function projectRepoWork(from: Date, to: Date): Promise<RepoWork | { error: string } | null> {
  const repo = await projectRepo();
  if (!repo || !(await isGitHubConnected())) return null;
  try {
    const [issues, pulls, commits] = await Promise.all([repoIssues(repo), repoPulls(repo), repoCommits(repo)]);
    return repoWorkBetween(repo, { issues: issues.data, pulls: pulls.data, commits: commits.data }, from, to);
  } catch (e) {
    return { error: e instanceof GitHubError ? e.kind : "other" };
  }
}
