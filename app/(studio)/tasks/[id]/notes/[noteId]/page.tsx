import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getBacklinks, getNote } from "@/lib/nexusData";
import { allTags } from "@/lib/tags";
import { splitBlocks } from "@/lib/editor/blocks";
import { renderMarkdown } from "@/lib/markdown";
import { fmtAgo } from "@/lib/dates";
import { cssColour } from "@/lib/palette";
import { Card, Eyebrow } from "@/components/ui";
import { NoteEditor } from "@/components/project/NoteEditor";

export const dynamic = "force-dynamic";

/** A note written for a task - the Nexus editor, filed under the task. */
export default async function TaskNotePage({ params }: { params: Promise<{ id: string; noteId: string }> }) {
  const { id, noteId } = await params;
  const note = await getNote(noteId);
  if (!note || note.taskId !== id) notFound();

  const [task, tags, backlinks] = await Promise.all([
    db.task.findUnique({ where: { id }, select: { title: true, course: { select: { colour: true } } } }),
    allTags(),
    getBacklinks(noteId),
  ]);
  if (!task) notFound();
  const initialHtml = splitBlocks(note.body).map((b) => (b.text.trim() ? renderMarkdown(b.text) : ""));
  const back = `/tasks/${id}?tab=files`;

  return (
    <div className="space-y-5">
      <Link
        href={back as Route}
        className={task.course ? "text-[12px] font-medium hover:underline" : "text-[12px] font-medium text-n-500 hover:text-rust-600"}
        style={task.course ? { color: cssColour(task.course.colour) } : undefined}
      >
        ← {task.title}
      </Link>

      <NoteEditor
        note={{
          id: note.id,
          title: note.title,
          body: note.body,
          pinned: note.pinned,
          tags: note.tags.map((t) => t.tag.name),
        }}
        initialHtml={initialHtml}
        allTags={tags.map((t) => t.name)}
        backHref={back}
        showPin={false}
      />

      {backlinks.length > 0 && (
        <Card className="p-4">
          <Eyebrow className="mb-2">Mentioned in</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {backlinks.map((b) => (
              <Link
                key={b.id}
                href={`/project/nexus/${b.id}` as Route}
                className="flex items-center gap-1.5 rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[12.5px] text-n-700 transition-colors duration-[120ms] hover:bg-n-50"
              >
                {b.title}
                <span className="font-num text-[10.5px] text-n-400">{fmtAgo(b.updatedAt)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
