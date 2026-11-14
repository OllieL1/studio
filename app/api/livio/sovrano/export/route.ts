import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { buildSovranoPdf } from "@/lib/pdf/sovrano";
import { sovranoJson } from "@/lib/sovrano";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/**
 * Sovrano's work log, as `format=pdf` (opens in a tab) or `format=json` (a
 * download). `?ids=` exports exactly those - the view as it stood on the
 * page; without it, everything.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ids = q.get("ids")?.split(",").filter(Boolean) ?? [];
  const [sessions, projects] = await Promise.all([
    db.sovranoSession.findMany({ where: ids.length ? { id: { in: ids } } : {}, orderBy: { startedAt: "asc" } }),
    db.sovranoProject.findMany(),
  ]);
  if (!sessions.length) return new Response("Nothing to export.", { status: 404 });
  const now = new Date();
  const stamp = toISODate(now);

  if (q.get("format") === "json") {
    return new Response(JSON.stringify(sovranoJson(sessions, projects, now), null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="sovrano-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdf = await buildSovranoPdf(sessions, projects, { title: q.get("title")?.slice(0, 80) || "Sovrano work log", generatedAt: now });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // Inline so it opens in a tab; the viewer's own save button does the rest.
      "Content-Disposition": `inline; filename="sovrano-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
