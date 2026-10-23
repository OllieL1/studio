import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toBibtex } from "@/lib/papers";

/**
 * Selected papers as a .bib file. `?course=` limits it (and names the file) to
 * one course's library; without it, every paper.
 */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const courseId = req.nextUrl.searchParams.get("course");
  const course = courseId ? await db.course.findUnique({ where: { id: courseId }, select: { shortName: true } }) : null;
  const papers = await db.paper.findMany({
    where: { ...(ids.length ? { id: { in: ids } } : {}), ...(course ? { courseId } : {}) },
    orderBy: { citeKey: "asc" },
  });
  const file = course ? `${course.shortName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-references.bib` : "studio-references.bib";
  return new NextResponse(toBibtex(papers), {
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
