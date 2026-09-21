import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkUpload, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Attach a PDF to a task. Multipart: `taskId` and `file`. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const taskId = form.get("taskId");
  const file = form.get("file");

  if (typeof taskId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Expected a taskId and a file." }, { status: 400 });
  }

  const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "No such task." }, { status: 404 });

  const problem = checkUpload(file.type, file.size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the magic number, not the browser's content type.
  if (bytes.subarray(0, 4).toString() !== "%PDF") {
    return NextResponse.json({ error: "That doesn't look like a PDF." }, { status: 400 });
  }

  const saved = saveUpload(bytes, "pdf");
  const attachment = await db.attachment.create({
    data: {
      taskId,
      filename: file.name.slice(0, 200) || "document.pdf",
      storedName: saved.storedName,
      mime: "application/pdf",
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
