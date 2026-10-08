import type { Route } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { describeGitHubError, githubToken } from "@/lib/github";
import { repoOverview, type RepoOverview } from "@/lib/githubData";
import { weeklyCommits, type Activity } from "@/lib/githubModel";
import { PROJECT_TIMELINE_START } from "@/lib/project";
import { fmtAgo, startOfWeek } from "@/lib/dates";
import { isTaskDone } from "@/lib/progress";
import { Card, EmptyState, Eyebrow, Pill, Stat } from "@/components/ui";
import { Sparkbar } from "@/components/charts/Sparkbar";
import { clsx } from "@/lib/clsx";
import { IssueList, RefreshRepoButton, type IssueRow } from "./GitHubParts";

/**
 * The project repo, inside the project: open issues (each one a task in
 * waiting), pull requests, the commit rhythm, and what's happened lately.
 *
 * Streams in behind its own Suspense boundary (see app/project/page.tsx), so
 * the rest of the page never waits on GitHub. Almost always it doesn't have
 * to - answers are cached for a minute and conditional after that.
 */
export async function GitHubTab({ repo }: { repo: string | null }) {
  if (!repo) {
    return (
      <Card>
        <EmptyState
          title="No repo linked yet."
          body="Link the project's GitHub repo from the header above, and its issues, pull requests and commits will show up here."
        />
      </Card>
    );
  }
  if (!(await githubToken())) {
    return (
      <Card>
        <EmptyState
          title="Connect GitHub to see the repo."
          body={`${repo} is private, so Studio needs a token to read it. It takes a minute in Settings.`}
          action={
            <Link href={"/settings#github" as Route} className="rounded-md bg-rust-500 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-rust-400">
              Set up GitHub
            </Link>
          }
        />
      </Card>
    );
  }

  let o: RepoOverview;
  try {
    o = await repoOverview(repo);
  } catch (e) {
    return (
      <Card>
        <EmptyState title="Couldn't load the repo." body={describeGitHubError(e)} action={<RefreshRepoButton label="Try again" />} />
      </Card>
    );
  }

  const now = new Date();
  const links = await db.taskIssue.findMany({
    where: { repo },
    include: { task: { include: { items: { select: { doneAt: true } } } } },
  });
  const tasksByIssue = new Map<number, IssueRow["tasks"]>();
  for (const l of links) {
    const list = tasksByIssue.get(l.number) ?? [];
    list.push({ id: l.task.id, title: l.task.title, done: isTaskDone(l.task) });
    tasksByIssue.set(l.number, list);
  }

  const openIssues = o.issues.filter((i) => i.state === "open");
  const openPulls = o.pulls.filter((p) => p.state === "open");
  const recentlyMerged = o.pulls.filter((p) => p.state === "merged").slice(0, 5);
  const weeks = weeklyCommits(o.commits, PROJECT_TIMELINE_START, now);
  const thisWeek = weeks.at(-1)?.count ?? 0;
  const activeWeeks = weeks.filter((w) => w.count > 0).length;
  const sinceMonday = startOfWeek(now);
  const closedThisWeek = o.issues.filter((i) => i.closedAt && new Date(i.closedAt) >= sinceMonday).length;

  const issueRows: IssueRow[] = o.issues.map((i) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    reason: i.reason,
    url: i.url,
    author: i.author,
    labels: i.labels,
    assignees: i.assignees,
    comments: i.comments,
    ago: i.state === "closed" && i.closedAt ? `closed ${fmtAgo(new Date(i.closedAt), now)}` : `opened ${fmtAgo(new Date(i.createdAt), now)}`,
    tasks: tasksByIssue.get(i.number) ?? [],
  }));

  return (
    <div className="space-y-5">
      {/* ── Repo header ─────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 md:flex-nowrap">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <a href={o.url} target="_blank" rel="noreferrer" className="font-display text-[22px] font-semibold text-n-900 hover:text-rust-700">
                <span className="text-n-400">{o.fullName.split("/")[0]}/</span>{o.fullName.split("/")[1]}
              </a>
              {o.isPrivate && <Pill>Private</Pill>}
            </div>
            {o.description && <p className="mt-1 text-[13px] text-n-600">{o.description}</p>}
            <p className="mt-1 text-[12px] text-n-500">
              <span className="font-num">{o.defaultBranch}</span>
              {o.pushedAt && <> · last push {fmtAgo(new Date(o.pushedAt), now)}</>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={clsx("whitespace-nowrap text-[11.5px]", o.stale ? "font-medium text-warn" : "text-n-400")}>
              {o.stale ? `Offline - showing ${fmtAgo(o.fetchedAt, now)}` : `Updated ${fmtAgo(o.fetchedAt, now)}`}
            </span>
            <RefreshRepoButton />
            <a href={o.url} target="_blank" rel="noreferrer" className="rounded-md border border-n-200 bg-n-0 px-2.5 py-1 text-[12px] font-semibold text-n-600 hover:bg-n-50">
              Open on GitHub ↗
            </a>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Stat label="Open issues" value={String(openIssues.length)} sub={closedThisWeek ? `${closedThisWeek} closed this week` : "none closed this week"} />
          <Stat label="Open PRs" value={String(openPulls.length)} sub={openPulls.some((p) => p.draft) ? `${openPulls.filter((p) => p.draft).length} draft` : undefined} />
          <Stat label="Commits this week" value={String(thisWeek)} />
          <Stat label="Commits" value={String(o.commits.length)} sub={`${activeWeeks} of ${weeks.length} weeks active`} />
        </div>
        {weeks.length >= 3 && o.commits.length > 0 && (
          <div className="mt-4 border-t border-n-100 pt-3">
            <Eyebrow className="mb-2">Commits per week, on {o.defaultBranch}</Eyebrow>
            <Sparkbar data={weeks.map((w) => ({ label: w.weekStart.toISOString(), value: w.count }))} unit="commits" week />
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        {/* ── Issues + PRs ──────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <IssueList issues={issueRows} repo={o.fullName} />

          <Card>
            <div className="flex items-baseline justify-between border-b border-n-100 px-4 py-2.5">
              <Eyebrow>Pull requests</Eyebrow>
              <a href={`${o.url}/pulls`} target="_blank" rel="noreferrer" className="text-[11.5px] font-medium text-n-400 hover:text-n-700">All ↗</a>
            </div>
            {openPulls.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-n-400">No open pull requests.</p>
            ) : (
              openPulls.map((p) => (
                <a key={p.number} href={p.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 border-b border-n-100 px-4 py-2.5 last:border-b-0 hover:bg-n-25">
                  <PullIcon state={p.draft ? "draft" : "open"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-n-800">
                      {p.title} <span className="font-num text-[12px] font-normal text-n-400">#{p.number}</span>
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-n-500">
                      <span className="font-num">{p.head} → {p.base}</span>
                      {p.author && <> · {p.author}</>} · updated {fmtAgo(new Date(p.updatedAt), now)}
                      {p.reviewers.length > 0 && <> · waiting on {p.reviewers.join(", ")}</>}
                    </p>
                  </div>
                  {p.draft && <Pill>Draft</Pill>}
                </a>
              ))
            )}
            {recentlyMerged.length > 0 && (
              <details className="border-t border-n-100">
                <summary className="cursor-pointer select-none px-4 py-2 text-[12px] font-semibold text-n-500 hover:text-n-800">Recently merged</summary>
                {recentlyMerged.map((p) => (
                  <a key={p.number} href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2 hover:bg-n-25">
                    <PullIcon state="merged" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-n-700">{p.title}</span>
                    <span className="font-num shrink-0 text-[11px] text-n-400">{p.mergedAt && fmtAgo(new Date(p.mergedAt), now)}</span>
                  </a>
                ))}
              </details>
            )}
          </Card>
        </div>

        {/* ── Commits + activity ────────────────────────────────────────── */}
        <aside className="min-w-0 space-y-5">
          <Card>
            <div className="flex items-baseline justify-between border-b border-n-100 px-4 py-2.5">
              <Eyebrow>Recent commits</Eyebrow>
              <a href={`${o.url}/commits/${o.defaultBranch}`} target="_blank" rel="noreferrer" className="text-[11.5px] font-medium text-n-400 hover:text-n-700">All ↗</a>
            </div>
            {o.commits.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-n-400">No commits since the project started.</p>
            ) : (
              o.commits.slice(0, 8).map((c) => (
                <a key={c.sha} href={c.url} target="_blank" rel="noreferrer" className="block border-b border-n-100 px-4 py-2 last:border-b-0 hover:bg-n-25">
                  <p className="truncate text-[12.5px] font-medium text-n-800">{c.title}</p>
                  <p className="mt-0.5 text-[11px] text-n-400">
                    <span className="font-num text-n-500">{c.sha.slice(0, 7)}</span>
                    {c.author && <> · {c.author}</>}
                    {c.at && <> · {fmtAgo(new Date(c.at), now)}</>}
                  </p>
                </a>
              ))
            )}
          </Card>

          <Card>
            <div className="border-b border-n-100 px-4 py-2.5"><Eyebrow>Activity</Eyebrow></div>
            {o.activity.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-n-400">Nothing recent.</p>
            ) : (
              <ol className="px-4 py-2">
                {o.activity.slice(0, 14).map((a) => <ActivityItem key={a.id} a={a} now={now} />)}
              </ol>
            )}
          </Card>
        </aside>
      </div>
      <p className="px-1 text-[11.5px] text-n-400">
        Read-only - Studio never changes anything on GitHub. A task made from an issue ticks itself when the issue closes.
      </p>
    </div>
  );
}

const TONE: Record<Activity["tone"], string> = {
  commit: "var(--color-rust-400)",
  pull: "var(--color-info)",
  issue: "var(--color-ok)",
  comment: "var(--color-n-300)",
  branch: "var(--color-n-400)",
  other: "var(--color-n-300)",
};

function ActivityItem({ a, now }: { a: Activity; now: Date }) {
  const body = (
    <>
      <span className="font-medium text-n-700">{a.actor}</span> {a.verb}
      {a.subject && <> <span className="text-n-800">{a.subject}</span></>}
    </>
  );
  return (
    <li className="relative flex gap-3 py-1.5 pl-0.5">
      <span aria-hidden className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: TONE[a.tone] }} />
      <div className="min-w-0 flex-1 text-[12.5px] leading-5 text-n-500">
        {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">{body}</a> : body}
      </div>
      <span className="font-num shrink-0 pt-px text-[10.5px] text-n-400">{fmtAgo(new Date(a.at), now)}</span>
    </li>
  );
}

function PullIcon({ state }: { state: "open" | "draft" | "merged" }) {
  const colour = state === "merged" ? "var(--color-info)" : state === "draft" ? "var(--color-n-400)" : "var(--color-ok)";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-0.5 shrink-0" style={{ color: colour }}>
      <circle cx="4" cy="3.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 5.2v5.6" stroke="currentColor" strokeWidth="1.4" />
      {state === "merged" ? (
        <path d="M4 5.2c0 3 8 2 8 5.6" stroke="currentColor" strokeWidth="1.4" />
      ) : (
        <path d="M12 10.8V6.5c0-1.4-1-2.5-2.5-2.5H7.5m0 0L9 2.5M7.5 4L9 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** The tab's placeholder while GitHub answers - the same shape, so nothing jumps. */
export function GitHubTabSkeleton() {
  const bar = "rounded bg-n-100 animate-pulse";
  return (
    <div className="space-y-5" aria-busy>
      <Card className="p-5">
        <div className={clsx(bar, "h-6 w-56")} />
        <div className={clsx(bar, "mt-2 h-3.5 w-80")} />
        <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className={clsx(bar, "h-12")} />)}
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <Card className="space-y-3 p-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={clsx(bar, "h-9")} />)}</Card>
        <Card className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className={clsx(bar, "h-8")} />)}</Card>
      </div>
    </div>
  );
}
