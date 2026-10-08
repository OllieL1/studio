import { addDays, startOfWeek } from "./dates";

/**
 * GitHub, the pure half: what Studio keeps of each API response, the
 * activity feed's wording, weekly commit counts, and the rule for when a
 * closed issue completes a task. No network and no database, so all of it
 * is tested directly (test/github.test.ts).
 */

/* ── Raw shapes (only the fields Studio reads) ───────────────────────────── */

export type RawUser = { login: string } | null;

export type RawIssue = {
  number: number;
  title: string;
  state: "open" | "closed";
  state_reason?: string | null;
  html_url: string;
  user: RawUser;
  labels: ({ name?: string; color?: string } | string)[];
  assignees?: { login: string }[] | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  /** Present when the "issue" is really a pull request. */
  pull_request?: unknown;
};

export type RawPull = {
  number: number;
  title: string;
  state: "open" | "closed";
  draft?: boolean;
  html_url: string;
  user: RawUser;
  head: { ref: string };
  base: { ref: string };
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  requested_reviewers?: { login: string }[] | null;
};

export type RawCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string; date?: string } | null; committer?: { date?: string } | null };
  author: RawUser;
};

export type RawEvent = {
  id: string;
  type: string;
  actor: { login: string; display_login?: string };
  created_at: string;
  // Event payloads vary by type, and GitHub has been trimming them; every
  // field is read defensively.
  payload: Record<string, unknown>;
};

export type RawRepo = {
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  pushed_at: string | null;
  open_issues_count: number;
};

/* ── What Studio keeps ───────────────────────────────────────────────────── */

export type Issue = {
  number: number;
  title: string;
  state: "open" | "closed";
  /** "completed" | "not_planned" | … for closed issues. */
  reason: string | null;
  url: string;
  author: string | null;
  labels: { name: string; colour: string | null }[];
  assignees: string[];
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type Pull = {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  url: string;
  author: string | null;
  head: string;
  base: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  reviewers: string[];
};

export type Commit = {
  sha: string;
  /** First line of the message. */
  title: string;
  url: string;
  author: string | null;
  at: string;
};

/** The issues endpoint also returns pull requests; these are only the issues. */
export function toIssues(raw: RawIssue[]): Issue[] {
  return raw
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      reason: i.state_reason ?? null,
      url: i.html_url,
      author: i.user?.login ?? null,
      labels: i.labels
        .map((l) => (typeof l === "string" ? { name: l, colour: null } : { name: l.name ?? "", colour: l.color ? `#${l.color}` : null }))
        .filter((l) => l.name),
      assignees: (i.assignees ?? []).map((a) => a.login),
      comments: i.comments,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      closedAt: i.closed_at,
    }));
}

export function toPulls(raw: RawPull[]): Pull[] {
  return raw.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.merged_at ? "merged" : p.state,
    draft: !!p.draft,
    url: p.html_url,
    author: p.user?.login ?? null,
    head: p.head.ref,
    base: p.base.ref,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    mergedAt: p.merged_at,
    closedAt: p.closed_at,
    reviewers: (p.requested_reviewers ?? []).map((r) => r.login),
  }));
}

export function toCommits(raw: RawCommit[]): Commit[] {
  return raw.map((c) => ({
    sha: c.sha,
    title: c.commit.message.split("\n")[0].trim(),
    url: c.html_url,
    author: c.author?.login ?? c.commit.author?.name ?? null,
    at: c.commit.author?.date ?? c.commit.committer?.date ?? "",
  }));
}

/* ── Activity ────────────────────────────────────────────────────────────── */

export type Activity = {
  id: string;
  at: string;
  actor: string;
  /** What happened, e.g. "merged" or "opened issue". */
  verb: string;
  /** What it happened to, e.g. "#12 Fix the login" or "main". */
  subject: string | null;
  url: string | null;
  tone: "commit" | "issue" | "pull" | "comment" | "branch" | "other";
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** "#12 Title", or just "#12" when the payload no longer carries the title. */
function numbered(n: number | null, title: string | null): string | null {
  if (n == null) return title;
  return title ? `#${n} ${title}` : `#${n}`;
}

/**
 * One line of the activity feed per event. Event types Studio doesn't
 * describe are dropped rather than shown as noise ("WatchEvent").
 */
export function describeEvent(e: RawEvent, fullName: string): Activity | null {
  const p = e.payload;
  const base = { id: e.id, at: e.created_at, actor: e.actor.display_login ?? e.actor.login };
  const repo = `https://github.com/${fullName}`;

  switch (e.type) {
    case "PushEvent": {
      const branch = str(p.ref)?.replace(/^refs\/heads\//, "") ?? null;
      const size = num(p.distinct_size) ?? num(p.size);
      const verb = size != null ? `pushed ${size} commit${size === 1 ? "" : "s"} to` : "pushed to";
      const head = str(p.head);
      return { ...base, verb, subject: branch, url: head ? `${repo}/commit/${head}` : branch ? `${repo}/tree/${branch}` : null, tone: "commit" };
    }
    case "PullRequestEvent": {
      const pr = obj(p.pull_request);
      const n = num(p.number) ?? num(pr.number);
      const action = str(p.action);
      const merged = action === "closed" && (pr.merged === true || !!str(pr.merged_at));
      const verb =
        merged ? "merged" : action === "opened" ? "opened PR" : action === "closed" ? "closed PR"
        : action === "reopened" ? "reopened PR" : action === "ready_for_review" ? "marked ready" : null;
      if (!verb) return null;
      return { ...base, verb, subject: numbered(n, str(pr.title)), url: n != null ? `${repo}/pull/${n}` : null, tone: "pull" };
    }
    case "IssuesEvent": {
      const issue = obj(p.issue);
      const n = num(issue.number);
      const action = str(p.action);
      const verb = action === "opened" ? "opened issue" : action === "closed" ? "closed issue" : action === "reopened" ? "reopened issue" : null;
      if (!verb) return null;
      return { ...base, verb, subject: numbered(n, str(issue.title)), url: str(issue.html_url) ?? (n != null ? `${repo}/issues/${n}` : null), tone: "issue" };
    }
    case "IssueCommentEvent": {
      const issue = obj(p.issue);
      const n = num(issue.number);
      const comment = obj(p.comment);
      return { ...base, verb: "commented on", subject: numbered(n, str(issue.title)), url: str(comment.html_url) ?? str(issue.html_url), tone: "comment" };
    }
    case "PullRequestReviewEvent": {
      const pr = obj(p.pull_request);
      const n = num(pr.number);
      const state = str(obj(p.review).state);
      const verb = state === "approved" ? "approved" : state === "changes_requested" ? "requested changes on" : "reviewed";
      return { ...base, verb, subject: numbered(n, str(pr.title)), url: n != null ? `${repo}/pull/${n}` : null, tone: "pull" };
    }
    case "CreateEvent":
    case "DeleteEvent": {
      const kind = str(p.ref_type);
      if (kind !== "branch" && kind !== "tag") return null;
      const ref = str(p.ref);
      const created = e.type === "CreateEvent";
      return {
        ...base,
        verb: `${created ? "created" : "deleted"} ${kind}`,
        subject: ref,
        url: created && ref ? `${repo}/tree/${ref}` : null,
        tone: "branch",
      };
    }
    case "ReleaseEvent": {
      const release = obj(p.release);
      return { ...base, verb: "released", subject: str(release.name) ?? str(release.tag_name), url: str(release.html_url), tone: "other" };
    }
    default:
      return null;
  }
}

/* ── Commit rhythm ───────────────────────────────────────────────────────── */

/** Commits per week (Monday start), from `from`'s week up to `now`'s, oldest first. */
export function weeklyCommits(commits: { at: string }[], from: Date, now: Date = new Date()): { weekStart: Date; count: number }[] {
  const first = startOfWeek(from);
  const last = startOfWeek(now);
  const weeks: { weekStart: Date; count: number }[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push({ weekStart: w, count: 0 });
  for (const c of commits) {
    const at = new Date(c.at);
    if (Number.isNaN(at.getTime()) || at < first) continue;
    const i = Math.floor((startOfWeek(at).getTime() - first.getTime()) / (7 * 86_400_000) + 0.5);
    if (i >= 0 && i < weeks.length) weeks[i].count++;
  }
  return weeks;
}

/* ── Issues → tasks ──────────────────────────────────────────────────────── */

export type IssueLink = {
  taskId: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  taskDone: boolean;
};

export type IssueSync = {
  /** Links whose snapshot changed. */
  updates: { taskId: string; repo: string; number: number; title: string; state: "open" | "closed"; closedAt: string | null }[];
  /** Tasks to tick: every issue they track is now closed, and one just closed. */
  complete: string[];
};

/**
 * Reconcile task-issue links with what GitHub says now.
 *
 * A task completes on the *transition*: when an issue that was open the last
 * time Studio looked is now closed, and it was the last open one on that
 * task. Linking an already-closed issue doesn't tick anything, and a task
 * you untick by hand stays unticked - Studio never fights you.
 *
 * Issues missing from `issues` (deleted, transferred, or beyond the pages
 * fetched) are left exactly as they were.
 */
export function syncIssueLinks(links: IssueLink[], repo: string, issues: Issue[]): IssueSync {
  const byNumber = new Map(issues.map((i) => [i.number, i]));
  const updates: IssueSync["updates"] = [];
  const justClosed = new Set<string>();
  const stateAfter = new Map<string, string>(); // key → state

  for (const l of links) {
    const key = `${l.taskId}|${l.repo}|${l.number}`;
    const now = l.repo === repo ? byNumber.get(l.number) : undefined;
    if (!now) {
      stateAfter.set(key, l.state);
      continue;
    }
    stateAfter.set(key, now.state);
    if (now.state !== l.state || now.title !== l.title) {
      updates.push({ taskId: l.taskId, repo: l.repo, number: l.number, title: now.title, state: now.state, closedAt: now.closedAt });
    }
    if (l.state === "open" && now.state === "closed") justClosed.add(l.taskId);
  }

  const complete: string[] = [];
  for (const taskId of justClosed) {
    const mine = links.filter((l) => l.taskId === taskId);
    if (mine[0]?.taskDone) continue;
    if (mine.every((l) => stateAfter.get(`${l.taskId}|${l.repo}|${l.number}`) === "closed")) complete.push(taskId);
  }
  return { updates, complete };
}

/* ── Agenda ──────────────────────────────────────────────────────────────── */

export type RepoWork = {
  repo: string;
  commits: Commit[];
  pullsOpened: Pull[];
  pullsMerged: Pull[];
  issuesOpened: Issue[];
  issuesClosed: Issue[];
};

/** What happened in a repo between two moments - the GitHub part of a drafted agenda. */
export function repoWorkBetween(
  repo: string,
  { commits, pulls, issues }: { commits: Commit[]; pulls: Pull[]; issues: Issue[] },
  from: Date,
  to: Date,
): RepoWork {
  const within = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t < to.getTime();
  };
  const oldestFirst = <T,>(xs: T[], at: (x: T) => string | null) =>
    [...xs].sort((a, b) => new Date(at(a) ?? 0).getTime() - new Date(at(b) ?? 0).getTime());
  return {
    repo,
    commits: oldestFirst(commits.filter((c) => within(c.at)), (c) => c.at),
    pullsOpened: oldestFirst(pulls.filter((p) => within(p.createdAt)), (p) => p.createdAt),
    pullsMerged: oldestFirst(pulls.filter((p) => within(p.mergedAt)), (p) => p.mergedAt),
    issuesOpened: oldestFirst(issues.filter((i) => within(i.createdAt)), (i) => i.createdAt),
    issuesClosed: oldestFirst(issues.filter((i) => i.state === "closed" && within(i.closedAt)), (i) => i.closedAt),
  };
}
