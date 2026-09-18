import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { renderMarkdown, extractToc, wordCount } from "@/lib/markdown";
import { fmtDateLong, fmtTime } from "@/lib/dates";
import { REVISION_ITEM_LABEL } from "@/lib/types";
import { Card, Eyebrow } from "@/components/ui";
import { NotesEditor } from "@/components/NotesEditor";
import { NotebookLocation } from "@/components/NotebookLocation";
import { LectureChecklist } from "@/components/LectureChecklist";
import { TaskTime } from "@/components/TaskTime";

export const dynamic = "force-dynamic";

/** One lecture: its checklist, its typed notes, and where the paper ones are. */
export default async function LecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const lecture = await db.task.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      course: true,
    },
  });
  if (!lecture) notFound();

  const md = lecture.notesMd ?? "";
  const toc = extractToc(md);

  // Neighbours, for stepping through a course lecture by lecture.
  const siblings = await db.task.findMany({
    where: {
      courseId: lecture.courseId,
      kind: { in: ["LECTURE", "SEMINAR"] },
      cancelled: false,
    },
    orderBy: [{ dueAt: "asc" }, { title: "asc" }],
    select: { id: true, title: true },
  });
  const idx = siblings.findIndex((s) => s.id === lecture.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Link href="/lectures" className="font-medium text-n-500 hover:text-rust-600">
            ← Lectures
          </Link>
          {lecture.course && (
            <>
              <span className="text-n-300">/</span>
              <Link
                href={`/courses/${lecture.course.id}`}
                className="font-medium hover:underline"
                style={{ color: lecture.course.colour }}
              >
                {lecture.course.name}
              </Link>
            </>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>
              {lecture.dueAt ? fmtDateLong(lecture.dueAt) : "Unscheduled"}
              {lecture.startMin != null && ` · ${fmtTime(lecture.startMin)}`}
            </Eyebrow>
            <h1 className="font-display mt-1 text-[32px] leading-10 font-semibold tracking-tight text-n-900">
              {lecture.title}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {md && (
              <>
                <span className="font-num text-[12px] text-n-400">
                  {wordCount(md)} words
                </span>

              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-4">
          <NotesEditor
            taskId={lecture.id}
            initial={md}
            renderedInitial={md ? renderMarkdown(md) : ""}
          />

          <TaskTime
            taskId={lecture.id}
            showWeekday={false}
            emptyHint="Tag this lecture under “Tasks worked on” when you stop the timer — writing up, revising, re-watching — and the time shows up here."
          />

          <div className="flex items-center justify-between gap-3">
            {prev ? (
              <Link
                href={`/lectures/${prev.id}`}
                className="min-w-0 truncate rounded-md border border-n-200 bg-n-0 px-3 py-2 text-[12.5px] font-medium text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
              >
                ← {prev.title}
              </Link>
            ) : <span />}
            {next && (
              <Link
                href={`/lectures/${next.id}`}
                className="min-w-0 truncate rounded-md border border-n-200 bg-n-0 px-3 py-2 text-[12.5px] font-medium text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
              >
                {next.title} →
              </Link>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <Card className="p-3">
            <Eyebrow className="mb-2">Completion</Eyebrow>
            <LectureChecklist
              items={lecture.items.map((i) => ({
                id: i.id,
                label: i.label,
                done: !!i.doneAt,
                isRevision: i.label === REVISION_ITEM_LABEL,
              }))}
            />
          </Card>

          <Card className="p-3">
            <Eyebrow className="mb-2">Handwritten notes</Eyebrow>
            <NotebookLocation
              taskId={lecture.id}
              notebook={lecture.notebook}
              pages={lecture.notebookPages}
              compact
            />
            <p className="mt-2 text-[10.5px] leading-4 text-n-400">
              Notebooks are named by cover design, not content.
            </p>
          </Card>

          {toc.length > 0 && (
            <Card className="p-3">
              <Eyebrow className="mb-2">Outline</Eyebrow>
              <nav className="space-y-0.5">
                {toc.map((t) => (
                  <a
                    key={t.id}
                    href={`#${t.id}`}
                    className="block truncate rounded px-1.5 py-1 text-[12px] text-n-600 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-900"
                    style={{ paddingLeft: 6 + (t.depth - 1) * 10 }}
                  >
                    {t.text}
                  </a>
                ))}
              </nav>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
