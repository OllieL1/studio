import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildNotesPdf } from "@/lib/pdf/notes";
import { toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/**
 * Notes as a PDF. `?ids=` exports just those notes; without it, all of
 * Nexus. A single note is one document with no cover. Each is headed with
 * its course and, for a task's note, the task.
 */
export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const rows = await db.note.findMany({
    where: ids.length > 0 ? { id: { in: ids } } : { taskId: null },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: {
      tags: { include: { tag: { select: { name: true } } } },
      course: { select: { name: true, code: true } },
      task: { select: { title: true, course: { select: { name: true, code: true } } } },
    },
  });

  if (rows.length === 0) return new Response("Nothing to export.", { status: 404 });

  // Keep the order the notes were picked in, so an export reads as chosen.
  const order = new Map(ids.map((id, i) => [id, i]));
  const notes = rows
    .map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      pinned: n.pinned,
      updatedAt: n.updatedAt,
      tags: n.tags.map((t) => t.tag.name),
      course: n.course ?? n.task?.course ?? null,
      work: n.task?.title ?? null,
    }))
    .sort((a, b) => (order.size ? (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) : 0));

  const course = await db.course.findFirst({ where: { isProject: true }, select: { name: true, code: true } });
  const pdf = await buildNotesPdf({ notes, course, generatedAt: new Date() });

  // Named for what it is: the note, or the piece of work / course a bundle shares.
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const works = new Set(notes.map((n) => n.work));
  const label =
    notes.length === 1 ? notes[0].title
    : works.size === 1 && notes[0].work ? `${notes[0].work} notes`
    : `${(notes[0].course ?? course)?.name ?? ""} notes`;
  const name = slug(label);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // Inline so it opens in a tab; the browser's own save button handles the rest.
      "Content-Disposition": `inline; filename="${name || "notes"}-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
