import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toBibtex } from "@/lib/papers";

/** Selected papers as a .bib file for the dissertation. */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const papers = await db.paper.findMany({
    where: ids.length ? { id: { in: ids } } : undefined,
    orderBy: { citeKey: "asc" },
  });
  return new NextResponse(toBibtex(papers), {
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Content-Disposition": 'attachment; filename="studio-references.bib"',
    },
  });
}
