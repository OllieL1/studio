import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { renderMarkdown, extractToc, wordCount } from "@/lib/markdown";
import { fmtDateLong, fmtTime } from "@/lib/dates";
import { REVISION_ITEM_LABEL, courseHref } from "@/lib/types";
import { Card, Eyebrow } from "@/components/ui";
import { LectureWorkspace } from "@/components/editor/LectureWorkspace";
import { TaskTime } from "@/components/TaskTime";
import { splitBlocks } from "@/lib/editor/blocks";
import { cssColour } from "@/lib/palette";

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
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!lecture) notFound();

  const md = lecture.notesMd ?? "";
  const toc = extractToc(md);
  // The editor renders each block as HTML; the first pass happens here, so the
  // note is readable before any client JavaScript has run.
  const initialHtml = splitBlocks(md).map((b) => (b.text.trim() ? renderMarkdown(b.text) : ""));

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
                href={courseHref(lecture.course) as Route}
                className="font-medium hover:underline"
                style={{ color: cssColour(lecture.course.colour) }}
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

      <div className="space-y-4">
        <LectureWorkspace
          taskId={lecture.id}
          title={lecture.title}
          meta={[lecture.course?.name, lecture.dueAt ? fmtDateLong(lecture.dueAt) : "Unscheduled"].filter(Boolean).join(" · ")}
          initial={md}
          initialHtml={initialHtml}
          items={lecture.items.map((i) => ({
            id: i.id,
            label: i.label,
            done: !!i.doneAt,
            isRevision: i.label === REVISION_ITEM_LABEL,
          }))}
          notebook={lecture.notebook}
          notebookPages={lecture.notebookPages}
          files={lecture.attachments.map((a) => ({ id: a.id, filename: a.filename, size: a.size }))}
          time={
            <TaskTime
              taskId={lecture.id}
              showWeekday={false}
              emptyHint="Tag this lecture under “Tasks worked on” when you stop the timer - writing up, revising, re-watching - and the time shows up here."
            />
          }
        />

        {toc.length > 0 && (
          <Card className="p-3">
            <Eyebrow className="mb-2">Outline</Eyebrow>
            <nav className="flex flex-wrap gap-x-4 gap-y-1">
              {toc.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="truncate rounded px-1 py-0.5 text-[12px] text-n-600 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-900"
                  style={{ opacity: 1 - (t.depth - 1) * 0.18 }}
                >
                  {t.text}
                </a>
              ))}
            </nav>
          </Card>
        )}

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
    </div>
  );
}
