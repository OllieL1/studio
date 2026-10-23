import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildReadingPdf } from "@/lib/pdf/reading";
import { toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/**
 * The reading list as a PDF. `?ids=` exports exactly those, in that order -
 * the view as it stood when `:export` was run; `notes=1` includes notes.
 */
export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const rows = await db.readingItem.findMany({ where: ids.length ? { id: { in: ids } } : {} });
  const items = ids.length ? ids.map((id) => rows.find((r) => r.id === id)).filter((r) => r !== undefined) : rows;
  if (!items.length) return new Response("Nothing to export.", { status: 404 });

  const title = req.nextUrl.searchParams.get("title")?.slice(0, 80) || "Reading list";
  const pdf = await buildReadingPdf(items, {
    title,
    generatedAt: new Date(),
    notes: req.nextUrl.searchParams.get("notes") === "1",
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // Inline so it opens in a tab; the browser's own save button handles the rest.
      "Content-Disposition": `inline; filename="reading-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
