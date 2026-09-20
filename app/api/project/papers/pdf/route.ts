import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildPapersPdf } from "@/lib/pdf/papers";
import { toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/**
 * The research library as a PDF. `?ids=` exports just those papers, in the
 * order they were selected; without it, the whole library.
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const papers = await db.paper.findMany({
    where: ids.length > 0 ? { id: { in: ids } } : undefined,
    orderBy: [{ year: "desc" }, { title: "asc" }],
  });

  if (papers.length === 0) {
    return new Response("Nothing to export.", { status: 404 });
  }

  const course = await db.course.findFirst({
    where: { isProject: true },
    select: { name: true, code: true },
  });

  const pdf = await buildPapersPdf(papers, {
    subtitle: course ? `${course.name} · ${course.code}` : "Studio",
    generatedAt: new Date(),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // Inline so it opens in a tab; the browser's own save button handles the rest.
      "Content-Disposition": `inline; filename="studio-research-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
