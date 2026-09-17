import Link from "next/link";
import { db } from "@/lib/db";
import { visibleCourseWhere, REVISION_ITEM_LABEL } from "@/lib/types";
import { wordCount } from "@/lib/markdown";
import { Eyebrow } from "@/components/ui";
import { LectureBrowser } from "@/components/LectureBrowser";

export const dynamic = "force-dynamic";

/**
 * Every lecture in one place, filterable by course — the home of typed notes
 * and the handwritten-notebook index.
 */
export default async function LecturesPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; filter?: string }>;
}) {
  const { course: courseParam, filter } = await searchParams;

  const courses = await db.course.findMany({
    where: visibleCourseWhere(),
    orderBy: { position: "asc" },
    select: { id: true, name: true, shortName: true, colour: true, code: true, revisionMode: true },
  });

  const lectures = await db.task.findMany({
    where: {
      kind: { in: ["LECTURE", "SEMINAR"] },
      cancelled: false,
      course: { is: visibleCourseWhere() },
      ...(courseParam ? { courseId: courseParam } : {}),
    },
    include: {
      items: { orderBy: { position: "asc" } },
      course: { select: { id: true, shortName: true, colour: true, name: true } },
    },
    orderBy: [{ dueAt: "asc" }, { title: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Notes</Eyebrow>
          <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">
            Lectures
          </h1>
        </div>
        <p className="font-num text-[13px] text-n-500">
          {lectures.length} lecture{lectures.length === 1 ? "" : "s"} ·{" "}
          {lectures.filter((l) => l.notesMd).length} with typed notes
        </p>
      </div>

      <LectureBrowser
        courses={courses}
        activeCourse={courseParam ?? null}
        activeFilter={filter ?? "all"}
        lectures={lectures.map((l) => ({
          id: l.id,
          title: l.title,
          kind: l.kind,
          dueAt: l.dueAt?.toISOString() ?? null,
          startMin: l.startMin,
          notebook: l.notebook,
          notebookPages: l.notebookPages,
          hasNotes: !!l.notesMd,
          words: l.notesMd ? wordCount(l.notesMd) : 0,
          course: l.course!,
          items: l.items.map((i) => ({
            id: i.id,
            label: i.label,
            done: !!i.doneAt,
            isRevision: i.label === REVISION_ITEM_LABEL,
          })),
        }))}
      />
    </div>
  );
}
