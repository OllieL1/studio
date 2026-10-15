import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { uploadExists, uploadPath } from "@/lib/uploads";
import { toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The slide PDFs attached to lectures, merged into one file.
 *
 *   ?ids=a,b,c      those lectures, in the order given (a lecture with
 *                   several PDFs contributes all of them, oldest first)
 *   &download=1     save as a file instead of opening in the browser
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ids = q.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (ids.length === 0) return new Response("Nothing to export.", { status: 400 });

  const tasks = await db.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, attachments: { orderBy: { createdAt: "asc" } } },
  });
  const ordered = ids.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as typeof tasks;
  const files = ordered.flatMap((t) => t.attachments.filter((a) => uploadExists(a.storedName)));
  if (files.length === 0) return new Response("No slides attached.", { status: 404 });

  const out = await PDFDocument.create();
  for (const f of files) {
    try {
      const src = await PDFDocument.load(await readFile(uploadPath(f.storedName)), { ignoreEncryption: true });
      for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
    } catch {
      // One unreadable deck shouldn't sink the whole export.
    }
  }
  if (out.getPageCount() === 0) return new Response("Couldn't read those slides.", { status: 422 });

  const name = ordered.length === 1
    ? ordered[0].title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)
    : "lectures";
  return new Response(new Uint8Array(await out.save()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${q.get("download") === "1" ? "attachment" : "inline"}; filename="studio-${name}-slides-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
