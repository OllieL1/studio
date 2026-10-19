import type { Route } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { addDays, daysUntil, fmtHM, fmtTime, isSameDay, startOfDay, startOfWeek } from "@/lib/dates";
import { TASK_KIND_LABEL } from "@/lib/types";
import { cssColour } from "@/lib/palette";
import { clsx } from "@/lib/clsx";
import { Eyebrow, Pill } from "./ui";
import { TickButton } from "./ComingUpTick";

type Task = {
  id: string;
  title: string;
  kind: string;
  dueAt: Date | null;
  startMin: number | null;
  gradeWeight: number | null;
  priority: number;
  items: { doneAt: Date | null }[];
  course: { shortName: string; colour: string } | null;
};
type Meeting = { id: string; title: string; startAt: Date; location: string | null };

type Entry =
  | { type: "task"; at: Date; task: Task }
  | { type: "meeting"; at: Date; meeting: Meeting };

type Day = { date: Date; entries: Entry[] };

/**
 * The next two weeks as a vertical timeline: one node per day with
 * something on it, sized by the heaviest grade weight that day, with
 * quiet stretches and week breaks drawn on the rail so the shape of the
 * fortnight reads at a glance.
 */
export function ComingUp({
  tasks,
  meetings,
  days,
  today,
  now = new Date(),
}: {
  tasks: Task[];
  meetings: Meeting[];
  days: number;
  /** One line about today, for the anchor at the top of the rail. */
  today: string;
  now?: Date;
}) {
  const entries: Entry[] = [
    ...tasks.filter((t) => t.dueAt).map((t) => ({ type: "task" as const, at: t.dueAt!, task: t })),
    ...meetings.map((m) => ({ type: "meeting" as const, at: m.startAt, meeting: m })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const grouped: Day[] = [];
  for (const e of entries) {
    const last = grouped[grouped.length - 1];
    if (last && isSameDay(last.date, e.at)) last.entries.push(e);
    else grouped.push({ date: startOfDay(e.at), entries: [e] });
  }

  const deadlines = tasks.length;
  const weighted = tasks.filter((t) => t.gradeWeight != null).length;
  const summary = [
    deadlines ? `${deadlines} due` : null,
    weighted ? `${weighted} graded` : null,
    meetings.length ? `${meetings.length} meeting${meetings.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  const thisWeek = startOfWeek(now).getTime();
  const end = addDays(startOfDay(now), days);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-n-100 px-4 py-2.5">
        <Eyebrow>Next 2 weeks</Eyebrow>
        {summary && <span className="font-num text-[11px] text-n-400">{summary}</span>}
      </div>

      <div className="px-4 pb-4 pt-3">
        <Row
          label={<span className="text-rust-600">Today</span>}
          node={<span className="h-[9px] w-[9px] rounded-full bg-rust-500 ring-[3px] ring-rust-100" />}
          rail="below"
        >
          <p className="pt-px text-[12px] text-n-500">{today}</p>
        </Row>

        {grouped.length === 0 ? (
          <Row label={null} node={<span className="h-[7px] w-[7px] rounded-full border border-n-300 bg-n-0" />} rail="above" dashed>
            <p className="font-display pt-4 text-[15px] text-n-700">A clear fortnight.</p>
            <p className="mt-0.5 pb-1 text-[12px] text-n-500">Nothing due and no meetings until {fmtShort(end)}.</p>
          </Row>
        ) : (
          grouped.map((day, i) => {
            const prev = i === 0 ? startOfDay(now) : grouped[i - 1].date;
            const quiet = Math.round((day.date.getTime() - prev.getTime()) / 86_400_000) - 1;
            const week = startOfWeek(day.date).getTime();
            const newWeek = week !== startOfWeek(prev).getTime();
            const last = i === grouped.length - 1;
            return (
              <Fragment key={day.date.toISOString()}>
                {newWeek && (
                  <Row label={null} node={null} rail="through" dashed={quiet > 0}>
                    <p className="flex items-center gap-2 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-n-400">
                      {weekLabel(week, thisWeek)}
                      <span className="h-px flex-1 bg-n-100" />
                    </p>
                  </Row>
                )}
                {!newWeek && quiet >= 2 && (
                  <Row label={null} node={null} rail="through" dashed>
                    <p className="py-1.5 text-[11px] italic text-n-400">{quiet} quiet days</p>
                  </Row>
                )}
                <DayRow day={day} now={now} last={last} />
              </Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}

function DayRow({ day, now, last }: { day: Day; now: Date; last: boolean }) {
  const n = daysUntil(day.date, now);
  const tasks = day.entries.flatMap((e) => (e.type === "task" ? [e.task] : []));
  const heaviest = tasks.reduce<Task | null>(
    (best, t) => (t.gradeWeight != null && (best?.gradeWeight ?? -1) < t.gradeWeight ? t : best),
    null,
  );

  // The node carries the day's stakes: hollow for ungraded work, a filled
  // dot in the course colour that grows with the heaviest grade weight.
  let node: React.ReactNode;
  if (heaviest?.course) {
    // Most graded work is worth well under half a course, so the scale tops
    // out at 40% - beyond that it's all equally "big".
    const size = 9 + Math.round(Math.min(heaviest.gradeWeight!, 40) / 40 * 7);
    node = (
      <span
        className="rounded-full ring-[3px] ring-n-0"
        style={{ width: size, height: size, background: cssColour(heaviest.course.colour) }}
      />
    );
  } else if (tasks.length === 0) {
    node = <span className="h-[8px] w-[8px] rotate-45 rounded-[2px] bg-n-500 ring-[3px] ring-n-0" />;
  } else {
    node = <span className="h-[9px] w-[9px] rounded-full border-[1.5px] border-n-400 bg-n-0 ring-[3px] ring-n-0" />;
  }

  return (
    <Row
      label={
        <span className={clsx(n <= 3 ? "text-warn" : "text-n-500")}>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.08em]">
            {n === 1 ? "Tmrw" : DAY[(day.date.getDay() + 6) % 7]}
          </span>
          <span className="font-num block text-[17px] font-semibold leading-5 text-n-800">{day.date.getDate()}</span>
        </span>
      }
      node={node}
      rail={last ? "above" : "through"}
      align="top"
    >
      <div className="space-y-1 pb-3">
        {day.entries.map((e) =>
          e.type === "task" ? <TaskEntry key={e.task.id} task={e.task} /> : <MeetingEntry key={e.meeting.id} meeting={e.meeting} />,
        )}
      </div>
    </Row>
  );
}

function TaskEntry({ task }: { task: Task }) {
  const done = task.items.filter((i) => i.doneAt).length;
  const time = task.startMin != null ? fmtTime(task.startMin) : task.dueAt && !isEndOfDay(task.dueAt) ? fmtHM(task.dueAt) : null;
  const colour = task.course ? cssColour(task.course.colour) : "var(--color-n-400)";

  return (
    <div className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-[120ms] hover:bg-n-25">
      <TickButton id={task.id} title={task.title} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={`/tasks/${task.id}` as Route}
            className="min-w-0 truncate text-[13.5px] font-medium text-n-800 decoration-rust-300 underline-offset-2 hover:text-rust-700 hover:underline"
          >
            {task.title}
          </Link>
          {task.priority > 0 && <Pill tone="rust">Priority</Pill>}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] leading-4 text-n-500">
          {task.course && <span className="font-medium" style={{ color: colour }}>{task.course.shortName}</span>}
          <span className="text-n-400">{TASK_KIND_LABEL[task.kind] ?? task.kind}</span>
          {time && <span className="font-num">{time}</span>}
          {task.items.length > 0 && <span className="font-num text-n-400">{done}/{task.items.length}</span>}
        </p>
      </div>
      {task.gradeWeight != null && (
        <div className="shrink-0 pt-0.5 text-right" title={`${task.gradeWeight}% of the course grade`}>
          <span className="font-num block text-[12px] font-semibold leading-4 text-n-700">{fmtWeight(task.gradeWeight)}%</span>
          <span className="mt-1 block h-[3px] w-9 bg-n-100">
            <span className="block h-full" style={{ width: `${Math.min(task.gradeWeight, 100)}%`, background: colour }} />
          </span>
        </div>
      )}
    </div>
  );
}

function MeetingEntry({ meeting }: { meeting: Meeting }) {
  return (
    <Link
      href={`/project/meetings/${meeting.id}` as Route}
      className="flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-[120ms] hover:bg-n-25"
    >
      <span aria-hidden className="mt-[5px] flex h-[15px] w-[15px] shrink-0 items-center justify-center">
        <span className="h-[7px] w-[7px] rotate-45 rounded-[1.5px] border-[1.5px] border-n-500" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-n-800">{meeting.title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-4 text-n-500">
          <span className="font-num">{fmtHM(meeting.startAt)}</span>
          {meeting.location && <span className="text-n-400"> · {meeting.location}</span>}
        </span>
      </span>
    </Link>
  );
}

/**
 * One line of the timeline: a date gutter, the rail with its node, and the
 * content. The rail is drawn per row so it runs unbroken down the list;
 * `rail` says which part of this row it covers.
 */
function Row({
  label, node, rail, dashed = false, align = "center", children,
}: {
  label: React.ReactNode;
  node: React.ReactNode;
  rail: "below" | "above" | "through";
  dashed?: boolean;
  align?: "center" | "top";
  children: React.ReactNode;
}) {
  const nodeTop = align === "top" ? "top-[14px]" : "top-[9px]";
  const line = clsx("absolute left-1/2 w-0 -translate-x-1/2 border-l", dashed ? "border-dashed border-n-200" : "border-n-200");
  return (
    <div className="grid grid-cols-[40px_22px_minmax(0,1fr)] gap-x-1.5">
      <div className={clsx("text-right", align === "top" ? "pt-1.5" : "pt-[3px] text-[11px] font-semibold uppercase tracking-[0.08em]")}>{label}</div>
      <div className="relative" aria-hidden>
        {rail === "below" && <span className={clsx(line, nodeTop, "bottom-0")} />}
        {rail === "above" && <span className={clsx(line, "top-0", node ? "h-[14px]" : "bottom-0")} />}
        {rail === "through" && <span className={clsx(line, "inset-y-0")} />}
        {node && (
          <span className={clsx("absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2", nodeTop)}>{node}</span>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function weekLabel(week: number, thisWeek: number): string {
  const n = Math.round((week - thisWeek) / (7 * 86_400_000));
  if (n === 1) return "Next week";
  const d = new Date(week);
  return `w/b ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function fmtShort(d: Date) {
  return `${DAY[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function fmtWeight(w: number) {
  return Number.isInteger(w) ? String(w) : w.toFixed(1);
}

/** Deadlines with no real time are stored at 23:59 (or midnight). */
function isEndOfDay(d: Date) {
  const m = d.getHours() * 60 + d.getMinutes();
  return m === 0 || m >= 23 * 60 + 59;
}
