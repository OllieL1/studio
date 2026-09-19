import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDateLong, fmtHM, fmtRelative, toISODate } from "@/lib/dates";
import { isTaskDone } from "@/lib/progress";
import { isGoogleConfigured } from "@/lib/google";
import { Card, Eyebrow, Pill } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { MeetingButton } from "@/components/project/MeetingDialog";
import { AddAction, AgendaField, NotesField, PrepList } from "@/components/project/MeetingParts";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await db.meeting.findUnique({
    where: { id },
    include: {
      course: true,
      prep: { include: { task: { include: { items: true } } } },
      actions: { include: { items: true, course: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!m) notFound();

  const googleConnected =
    isGoogleConfigured() && !!(await db.googleAuth.findUnique({ where: { id: "singleton" }, select: { id: true } }));
  const past = m.endAt < new Date();
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <Link href={"/project?tab=meetings" as Route} className="text-[12px] font-medium text-n-500 hover:text-rust-600">← Meetings</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>{past ? "Past meeting" : fmtRelative(m.startAt)}</Eyebrow>
            <h1 className="font-display mt-1 text-[32px] leading-10 font-semibold tracking-tight text-n-900">{m.title}</h1>
            <p className="mt-1 text-[13px] text-n-600">
              {fmtDateLong(m.startAt)} · {fmtHM(m.startAt)}–{fmtHM(m.endAt)}
              {m.location && <span className="text-n-500"> · {m.location}</span>}
              {m.calendarEventId && <span className="text-n-400"> · on Google Calendar</span>}
            </p>
          </div>
          <MeetingButton
            label="Edit"
            variant="secondary"
            googleConnected={googleConnected}
            draft={{
              id: m.id, title: m.title, date: toISODate(m.startAt), startTime: hhmm(m.startAt), endTime: hhmm(m.endAt),
              location: m.location ?? "", syncToGoogle: !!m.calendarEventId,
            }}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <section>
            <Eyebrow className="mb-2">Agenda</Eyebrow>
            <AgendaField meetingId={m.id} initial={m.agenda ?? ""} />
          </section>
          <section>
            <Eyebrow className="mb-2">Notes</Eyebrow>
            <NotesField meetingId={m.id} initial={m.notes ?? ""} />
          </section>
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <Eyebrow>Actions</Eyebrow>
              <span className="text-[11px] text-n-400">Each becomes a project task</span>
            </div>
            <Card>
              {m.actions.length === 0 && <p className="px-4 py-4 text-[12.5px] text-n-400">No actions yet.</p>}
              {m.actions.map((t) => (
                <TaskRow key={t.id} task={{ ...t, course: t.course ? { id: t.course.id, shortName: t.course.shortName, colour: t.course.colour, name: t.course.name } : null }} showCourse={false} />
              ))}
              <AddAction meetingId={m.id} />
            </Card>
          </section>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <Eyebrow>Prep</Eyebrow>
              {m.prep.length > 0 && (
                <Pill tone={m.prep.every((p) => isTaskDone(p.task)) ? "ok" : "warn"}>
                  {m.prep.filter((p) => isTaskDone(p.task)).length}/{m.prep.length}
                </Pill>
              )}
            </div>
            <PrepList
              meetingId={m.id}
              courseId={m.courseId}
              prep={m.prep.map((p) => ({ id: p.task.id, title: p.task.title, done: isTaskDone(p.task) }))}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
