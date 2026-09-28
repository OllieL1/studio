import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBacklinks, getNote } from "@/lib/nexusData";
import { allTags } from "@/lib/tags";
import { splitBlocks } from "@/lib/editor/blocks";
import { renderMarkdown } from "@/lib/markdown";
import { fmtRelative } from "@/lib/dates";
import { Card, Eyebrow } from "@/components/ui";
import { NoteEditor } from "@/components/project/NoteEditor";

export const dynamic = "force-dynamic";

/** One Nexus note, with whatever else points at it. */
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await getNote(id);
  if (!note) notFound();

  const [tags, backlinks] = await Promise.all([allTags(), getBacklinks(id)]);
  const initialHtml = splitBlocks(note.body).map((b) => (b.text.trim() ? renderMarkdown(b.text) : ""));

  return (
    <div className="space-y-5">
      <Link href={"/project?tab=nexus" as Route} className="text-[12px] font-medium text-n-500 hover:text-rust-600">
        ← Nexus
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
                <span className="font-num text-[10.5px] text-n-400">{fmtRelative(b.updatedAt)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
