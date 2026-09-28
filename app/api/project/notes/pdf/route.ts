import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildNotesPdf } from "@/lib/pdf/notes";
import { toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/**
 * Nexus as a PDF. `?ids=` exports just those notes; without it, everything.
 * A single note is one document with no cover.
 */
export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const rows = await db.note.findMany({
    where: ids.length > 0 ? { id: { in: ids } } : undefined,
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: { tags: { include: { tag: { select: { name: true } } } } },
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
    }))
    .sort((a, b) => (order.size ? (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) : 0));

  const course = await db.course.findFirst({ where: { isProject: true }, select: { name: true, code: true } });
  const pdf = await buildNotesPdf({ notes, course, generatedAt: new Date() });

  const name = notes.length === 1 ? notes[0].title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "nexus";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // Inline so it opens in a tab; the browser's own save button handles the rest.
      "Content-Disposition": `inline; filename="studio-${name || "note"}-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
