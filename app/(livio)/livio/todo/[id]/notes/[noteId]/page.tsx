import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LIVIO_BASE } from "@/lib/apps";
import { getNote } from "@/lib/nexusData";
import { allTags } from "@/lib/tags";
import { splitBlocks } from "@/lib/editor/blocks";
import { renderMarkdown } from "@/lib/markdown";
import { NoteEditor } from "@/components/project/NoteEditor";

export const dynamic = "force-dynamic";

/** A note written for a Livio todo - the same editor Studio's task notes use. */
export default async function TodoNotePage({ params }: { params: Promise<{ id: string; noteId: string }> }) {
  const { id, noteId } = await params;
  const note = await getNote(noteId);
  if (!note || note.taskId !== id) notFound();

  const [task, tags] = await Promise.all([
    db.task.findUnique({ where: { id }, select: { title: true } }),
    allTags(),
  ]);
  if (!task) notFound();
  const initialHtml = splitBlocks(note.body).map((b) => (b.text.trim() ? renderMarkdown(b.text) : ""));
  const back = `${LIVIO_BASE}/todo/${id}?tab=files`;

  return (
    <div className="space-y-5">
      <Link href={back as Route} className="text-[12px] font-medium text-n-500 hover:text-rust-600">
        ← {task.title}
      </Link>
      <NoteEditor
        note={{ id: note.id, title: note.title, body: note.body, pinned: note.pinned, tags: note.tags.map((t) => t.tag.name) }}
        initialHtml={initialHtml}
        allTags={tags.map((t) => t.name)}
        backHref={back}
        showPin={false}
      />
    </div>
  );
}
