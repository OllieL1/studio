import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildLecturesPdf, type PdfLecture } from "@/lib/pdf/lectures";
import { toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/**
 * Lecture notes as a PDF.
 *
 *   ?id=<task>           one lecture
 *   ?course=<course>     every lecture on the course, with a cover and contents
 *   ?ids=a,b,c           just those lectures, in the order given
 *   &empty=1             include lectures with no typed notes
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get("id");
  const courseId = q.get("course");
  const ids = q.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const includeEmpty = q.get("empty") === "1" || !!id;

  const where = id
    ? { id }
    : {
        kind: { in: ["LECTURE", "SEMINAR"] },
        cancelled: false,
        ...(courseId ? { courseId } : {}),
        ...(ids.length > 0 ? { id: { in: ids } } : {}),
        ...(includeEmpty ? {} : { notesMd: { not: null } }),
      };

  const tasks = await db.task.findMany({
    where,
    include: { course: true, items: { orderBy: { position: "asc" } } },
    orderBy: [{ dueAt: "asc" }, { title: "asc" }],
  });

  if (tasks.length === 0) return new Response("Nothing to export.", { status: 404 });

  // An explicit id list keeps the order it was given in.
  const ordered = ids.length > 0 ? ids.map((x) => tasks.find((t) => t.id === x)).filter(Boolean) as typeof tasks : tasks;

  const lectures: PdfLecture[] = ordered.map((t) => ({
    id: t.id,
    title: t.title,
    dueAt: t.dueAt,
    notesMd: t.notesMd,
    notebook: t.notebook,
    notebookPages: t.notebookPages,
    parts: t.items.map((i) => ({ label: i.label, done: !!i.doneAt })),
  }));

  // One course throughout means the cover and headers can name it.
  const courses = new Set(ordered.map((t) => t.courseId));
  const course = courses.size === 1 ? ordered[0].course : null;

  const pdf = await buildLecturesPdf({
    course: course ? { name: course.name, code: course.code, colour: course.colour } : null,
    lectures,
    generatedAt: new Date(),
  });

  const name = lectures.length === 1
    ? lectures[0].title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)
    : `${course?.code.toLowerCase() ?? "lectures"}-notes`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="studio-${name}-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
