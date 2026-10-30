import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkUpload, MAX_UPLOAD_BYTES, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Attach a PDF, Word or PowerPoint file to a task. Multipart: `taskId` and `file`. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const taskId = form.get("taskId");
  const file = form.get("file");

  if (typeof taskId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Expected a taskId and a file." }, { status: 400 });
  }

  const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "No such task." }, { status: 404 });

  // Turned away before reading, so a huge file is never held in memory.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `That file is over ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the extension and the magic number, not the browser's content type.
  const vetted = checkUpload(file.name, bytes);
  if (!vetted.ok) return NextResponse.json({ error: vetted.error }, { status: 400 });

  const saved = saveUpload(bytes, vetted.ext);
  const attachment = await db.attachment.create({
    data: {
      taskId,
      filename: file.name.slice(0, 200) || `document.${vetted.ext}`,
      storedName: saved.storedName,
      mime: vetted.mime,
      size: saved.size,
    },
  });

  return NextResponse.json({
    id: attachment.id,
    filename: attachment.filename,
    size: attachment.size,
    createdAt: attachment.createdAt,
  });
}
