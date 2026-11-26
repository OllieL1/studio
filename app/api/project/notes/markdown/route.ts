/** Purpose: download one note (`?id=`) as a markdown file, beside the PDF export. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { fileSlug, noteMarkdown } from "@/lib/noteExport";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return new Response("No note id given.", { status: 400 });

  const note = await db.note.findUnique({ where: { id }, select: { title: true, body: true } });
  if (!note) return new Response(`No note with id ${id}.`, { status: 404 });

  const filename = `${fileSlug(note.title) || "note"}-${toISODate(new Date())}.md`;
  return new Response(noteMarkdown(note.title, note.body), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
