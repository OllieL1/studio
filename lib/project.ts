import { addDays, startOfDay, startOfWeek } from "./dates";
import type { StatSession } from "./stats";
import type { RepoWork } from "./githubModel";
import { issueRef, serializeMention } from "./mentions";

/**
 * Project maths: the 400-hour pace tracker, the week-by-week timeline, and
 * the auto-drafted meeting agenda. Pure functions - the pages feed them data.
 */

/** The project's final deadline, and the week the timeline starts from. */
export const PROJECT_DEADLINE = new Date(2027, 2, 26, 23, 59); // Fri 26 Mar 2027
export const PROJECT_TIMELINE_START = new Date(2026, 8, 21); // w/b Mon 21 Sep 2026

/* ── Pace ────────────────────────────────────────────────────────────────── */

export type Pace = {
  loggedHours: number;
  targetHours: number;
  /** 0–1 */
  share: number;
  weeksLeft: number;
  /** Hours per week needed from now to hit the target by the deadline. */
  neededPerWeek: number | null;
  /** Average hours per week over the last four weeks. */
  recentPerWeek: number;
  status: "done" | "on-track" | "behind" | "not-started" | "early";
};

/**
 * `weeklyMinutes` holds project minutes per week, oldest first, ending with
 * the current week. The current week is partial, so "recent pace" uses the
 * four complete weeks before it.
 */
export function projectPace({
  loggedMinutes,
  targetHours,
  weeklyMinutes,
  now = new Date(),
  deadline = PROJECT_DEADLINE,
}: {
  loggedMinutes: number;
  targetHours: number;
  weeklyMinutes: number[];
  now?: Date;
  deadline?: Date;
}): Pace {
  const loggedHours = loggedMinutes / 60;
  const weeksLeft = Math.max(0, (deadline.getTime() - now.getTime()) / (7 * 86_400_000));
  const remaining = Math.max(0, targetHours - loggedHours);
  const complete = weeklyMinutes.slice(0, -1).slice(-4);
  const recentPerWeek = complete.length ? complete.reduce((a, b) => a + b, 0) / complete.length / 60 : 0;
  const neededPerWeek = weeksLeft > 0 ? remaining / weeksLeft : null;

  let status: Pace["status"];
  if (loggedHours >= targetHours) status = "done";
  else if (loggedMinutes === 0) status = "not-started";
  // Under two full weeks of history, "behind" would just be noise.
  else if (weeklyMinutes.length - 1 < 2) status = "early";
  else if (neededPerWeek != null && recentPerWeek >= neededPerWeek) status = "on-track";
  else status = "behind";

  return {
    loggedHours,
    targetHours,
    share: targetHours > 0 ? Math.min(1, loggedHours / targetHours) : 0,
    weeksLeft,
    neededPerWeek,
    recentPerWeek,
    status,
  };
}

/* ── Timeline ────────────────────────────────────────────────────────────── */

export type TimelineWeek = { index: number; start: Date; monthLabel: string | null };

/** Monday-start weeks from `from` to the week containing `to`. */
export function timelineWeeks(from: Date, to: Date): TimelineWeek[] {
  const first = startOfWeek(from);
  const last = startOfWeek(to);
  const out: TimelineWeek[] = [];
  let prevMonth = -1;
  for (let d = first, i = 0; d <= last; d = addDays(d, 7), i++) {
    // Label the first week whose Monday falls in a new month, so the label
    // sits over dates that are actually in that month.
    const month = d.getMonth();
    const label = month !== prevMonth
      ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month]
      : null;
    prevMonth = month;
    out.push({ index: i, start: d, monthLabel: label });
    if (i > 200) break;
  }
  return out;
}

/**
 * Horizontal position of a date on the timeline as a fraction 0–1, where
 * each week gets an equal slice. Dates outside the range are clamped.
 */
export function timelinePosition(date: Date, weeks: TimelineWeek[]): number {
  if (weeks.length === 0) return 0;
  const start = weeks[0].start.getTime();
  const end = addDays(weeks[weeks.length - 1].start, 7).getTime();
  const t = Math.min(end, Math.max(start, date.getTime()));
  return (t - start) / (end - start);
}

/**
 * Stack bars so overlapping ones never share a row. Returns the row index
 * for each item, in input order. Greedy by start date, first free row.
 */
export function stackRows(items: { start: number; end: number }[]): number[] {
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.start - b.start || a.end - b.end);
  const rowEnds: number[] = [];
  const rows = new Array<number>(items.length);
  for (const it of order) {
    let r = rowEnds.findIndex((end) => end <= it.start);
    if (r === -1) { r = rowEnds.length; rowEnds.push(0); }
    rowEnds[r] = it.end;
    rows[it.i] = r;
  }
  return rows;
}

/* ── Agenda draft ────────────────────────────────────────────────────────── */

export type AgendaInput = {
  meetingTitle: string;
  since: Date | null; // previous meeting, or null for the first
  minutesLogged: number;
  sessions: number;
  tasksDone: { title: string }[];
  papersRead: { title: string; authors: string }[];
  papersAdded: number;
  openActions: { title: string; fromMeeting: string | null }[];
  upcoming: { title: string; due: Date }[];
  prepOutstanding: { title: string }[];
  /** The project repo over the same window; null when GitHub isn't set up. */
  github?: RepoWork | { error: string } | null;
};

/** How many commit messages to list before summarising the rest. */
export const AGENDA_COMMIT_LIMIT = 8;

const fmtDay = (d: Date) =>
  `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`;

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * A starting agenda built from what's happened since the last meeting. Meant
 * to be edited - it gathers the facts so the meeting can be about decisions.
 */
export function draftAgenda(a: AgendaInput): string {
  const lines: string[] = [];
  lines.push(`## Since ${a.since ? `last meeting (${fmtDay(a.since)})` : "the start"}`);
  lines.push("");
  lines.push(
    a.sessions > 0
      ? `- **${fmtHours(a.minutesLogged)}** on the project across ${a.sessions} session${a.sessions === 1 ? "" : "s"}`
      : "- No project time logged",
  );
  if (a.tasksDone.length) {
    lines.push(`- Done:`);
    for (const t of a.tasksDone) lines.push(`  - ${t.title}`);
  }
  if (a.papersRead.length) {
    lines.push(`- Read:`);
    for (const p of a.papersRead) lines.push(`  - ${p.title} (${p.authors})`);
  }
  if (a.papersAdded > 0) lines.push(`- ${a.papersAdded} paper${a.papersAdded === 1 ? "" : "s"} added to the reading list`);
  lines.push("");

  if (a.github) lines.push(...githubSection(a.github));

  if (a.openActions.length) {
    lines.push("## Open actions");
    lines.push("");
    for (const t of a.openActions) lines.push(`- ${t.title}${t.fromMeeting ? ` _(from ${t.fromMeeting})_` : ""}`);
    lines.push("");
  }

  if (a.prepOutstanding.length) {
    lines.push("## Prep not finished");
    lines.push("");
    for (const t of a.prepOutstanding) lines.push(`- ${t.title}`);
    lines.push("");
  }

  if (a.upcoming.length) {
    lines.push("## Coming up");
    lines.push("");
    for (const t of a.upcoming) lines.push(`- ${t.title} - ${fmtDay(t.due)}`);
    lines.push("");
  }

  lines.push("## Questions / blockers");
  lines.push("");
  lines.push("- ");
  return lines.join("\n");
}

/**
 * The repo's part of the agenda. Issues are written as `@i` mentions, so they
 * render as chips that open the issue; pull requests as plain links.
 */
function githubSection(g: RepoWork | { error: string }): string[] {
  if ("error" in g) return ["## On GitHub", "", "- _Couldn't reach GitHub, so the repo's activity is missing - draft again when online._", ""];
  const lines = ["## On GitHub", ""];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const issue = (i: { number: number; title: string }) => serializeMention("issue", issueRef(g.repo, i.number), i.title);
  const pull = (p: { number: number; title: string; url: string }) => `[#${p.number} ${p.title.replace(/[[\]]/g, "")}](${p.url})`;

  if (g.commits.length === 0) {
    lines.push("- No commits");
  } else {
    lines.push(`- **${plural(g.commits.length, "commit")}**:`);
    for (const c of g.commits.slice(0, AGENDA_COMMIT_LIMIT)) lines.push(`  - ${c.title}`);
    if (g.commits.length > AGENDA_COMMIT_LIMIT) lines.push(`  - _and ${g.commits.length - AGENDA_COMMIT_LIMIT} more_`);
  }
  const merged = new Set(g.pullsMerged.map((p) => p.number));
  const stillOpen = g.pullsOpened.filter((p) => !merged.has(p.number));
  const block = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`- ${title}:`);
    for (const it of items) lines.push(`  - ${it}`);
  };
  block("Merged", g.pullsMerged.map(pull));
  block("Opened PRs", stillOpen.map(pull));
  block("Closed issues", g.issuesClosed.map(issue));
  block("New issues", g.issuesOpened.filter((i) => i.state === "open").map(issue));
  lines.push("");
  return lines;
}

export function weekKey(d: Date): number {
  return startOfWeek(startOfDay(d)).getTime();
}

/* ── Time stats ──────────────────────────────────────────────────────────── */

/**
 * The project's share of each session, as sessions of their own. A session
 * split between the project and another course keeps only its project slice
 * (raw minutes scaled to match), so the usual stats functions report project
 * time and nothing else. Sessions with no project time are dropped.
 */
export function projectSessions(sessions: StatSession[], courseId: string): StatSession[] {
  const out: StatSession[] = [];
  for (const s of sessions) {
    const slice = s.courses.find((c) => c.courseId === courseId);
    if (!slice || slice.minutes <= 0) continue;
    const share = s.minutes > 0 ? slice.minutes / s.minutes : 1;
    out.push({
      ...s,
      minutes: slice.minutes,
      rawMinutes: s.rawMinutes * share,
      courses: [{ courseId, minutes: slice.minutes }],
    });
  }
  return out;
}
