import { NextRequest } from "next/server";
import { getDraft, kbDocCommittedAt, kbRepo, readKbDoc } from "@/lib/kbData";
import { buildNotesPdf } from "@/lib/pdf/notes";
import { pdfBodyOf, titleOf } from "@/lib/kb";
import { toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/**
 * One KB doc as a PDF (`?path=`), through the notes renderer. It's what
 * Studio has - the uncommitted draft when there is one, else GitHub's
 * version - so it matches the page it was exported from. Headed with the
 * repo on the left and the doc's path on the right.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const kb = await kbRepo();
  if (!path || !kb) return new Response("No such doc.", { status: 404 });

  const draft = await getDraft(kb, path);
  const doc = draft ? null : await readKbDoc(kb, path).catch(() => null);
  if (!draft && !doc) return new Response(`${path} isn't in ${kb.repo}.`, { status: 404 });
  const body = draft?.body ?? doc!.body;

  const updatedAt = draft?.updatedAt ?? (await kbDocCommittedAt(kb, path)) ?? new Date();
  const title = titleOf(path, body);
  const pdf = await buildNotesPdf({
    notes: [{ id: path, title, body: pdfBodyOf(body), tags: [], pinned: false, updatedAt, course: { name: kb.repo, code: "" }, work: path }],
    course: null,
    generatedAt: new Date(),
  });

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // Inline so it opens in a tab; the browser's own save button handles the rest.
      "Content-Disposition": `inline; filename="${slug || "doc"}-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
