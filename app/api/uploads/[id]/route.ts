import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { uploadExists, uploadPath } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Serve an attached file. `?download=1` saves rather than opens it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await db.attachment.findUnique({ where: { id } });
  if (!file || !uploadExists(file.storedName)) return new Response("Not found.", { status: 404 });

  const bytes = await readFile(uploadPath(file.storedName));
  const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      // The filename is quoted and stripped of quotes, so a odd name can't
      // break out of the header.
      "Content-Disposition": `${disposition}; filename="${file.filename.replace(/["\\]/g, "")}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
