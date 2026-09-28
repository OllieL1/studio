"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ensureTags, pruneOrphanTags, tagKey } from "@/lib/tags";
import { renameTagMentions } from "@/lib/mentions";

/**
 * Nexus: the project's notebook, plus the tags shared with research.
 *
 * Notes are markdown like everything else, and the mentions inside them are
 * just text - which is why renaming a tag has to rewrite note bodies as well
 * as the tag record.
 */

const refresh = () => {
  revalidatePath("/project");
  revalidatePath("/project/nexus", "layout");
  revalidatePath("/project/tags", "layout");
};

export async function createNote(input?: { title?: string; body?: string }) {
  const project = await db.course.findFirst({ where: { isProject: true }, select: { id: true } });
  const note = await db.note.create({
    data: {
      title: input?.title?.trim() || "Untitled",
      body: input?.body ?? "",
      courseId: project?.id ?? null,
    },
    select: { id: true },
  });
  refresh();
  return { ok: true as const, id: note.id };
}

export async function updateNote(
  id: string,
  data: { title?: string; body?: string; icon?: string | null; pinned?: boolean },
) {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title.trim().slice(0, 120) || "Untitled";
  if (data.body !== undefined) patch.body = data.body;
  if (data.icon !== undefined) patch.icon = data.icon?.trim() || null;
  if (data.pinned !== undefined) patch.pinned = data.pinned;

  await db.note.update({ where: { id }, data: patch });
  refresh();
  return { ok: true as const };
}

export async function deleteNote(id: string) {
  await db.note.delete({ where: { id } });
  await pruneOrphanTags();
  refresh();
  return { ok: true as const };
}

/** Replace a note's tags with exactly this set. */
export async function setNoteTags(id: string, names: string[]) {
  const tagIds = await ensureTags(names);
  await db.$transaction(async (tx) => {
    await tx.noteTag.deleteMany({ where: { noteId: id } });
    if (tagIds.length) {
      await tx.noteTag.createMany({ data: tagIds.map((tagId) => ({ noteId: id, tagId })) });
    }
  });
  await pruneOrphanTags();
  refresh();
  return { ok: true as const };
}

/** Replace a paper's tags with exactly this set. */
export async function setPaperTags(id: string, names: string[]) {
  const tagIds = await ensureTags(names);
  await db.$transaction(async (tx) => {
    await tx.paperTag.deleteMany({ where: { paperId: id } });
    if (tagIds.length) {
      await tx.paperTag.createMany({ data: tagIds.map((tagId) => ({ paperId: id, tagId })) });
    }
  });
  await pruneOrphanTags();
  refresh();
  return { ok: true as const };
}

/**
 * Rename a tag everywhere: the record, and the `@#[…]` mentions written into
 * note bodies. Merges into an existing tag if the new name is already taken.
 */
export async function renameTag(id: string, name: string) {
  const next = name.trim().replace(/^#/, "");
  if (!next) return { ok: false as const, error: "A tag needs a name." };

  const tag = await db.tag.findUnique({ where: { id }, select: { name: true } });
  if (!tag) return { ok: false as const, error: "That tag is gone." };
  if (tag.name === next) return { ok: true as const };

  const existing = await db.tag.findUnique({ where: { key: tagKey(next) }, select: { id: true } });

  await db.$transaction(async (tx) => {
    if (existing && existing.id !== id) {
      // Merge: move what's filed under this tag onto the other one.
      const [papers, notes] = await Promise.all([
        tx.paperTag.findMany({ where: { tagId: id }, select: { paperId: true } }),
        tx.noteTag.findMany({ where: { tagId: id }, select: { noteId: true } }),
      ]);
      for (const p of papers) {
        await tx.paperTag.upsert({
          where: { paperId_tagId: { paperId: p.paperId, tagId: existing.id } },
          create: { paperId: p.paperId, tagId: existing.id },
          update: {},
        });
      }
      for (const n of notes) {
        await tx.noteTag.upsert({
          where: { noteId_tagId: { noteId: n.noteId, tagId: existing.id } },
          create: { noteId: n.noteId, tagId: existing.id },
          update: {},
        });
      }
      await tx.tag.delete({ where: { id } });
    } else {
      await tx.tag.update({ where: { id }, data: { name: next, key: tagKey(next) } });
    }

    // Mentions carry the old name as text, so they're rewritten too.
    const notes = await tx.note.findMany({ select: { id: true, body: true } });
    for (const n of notes) {
      const body = renameTagMentions(n.body, tag.name, next);
      if (body !== n.body) await tx.note.update({ where: { id: n.id }, data: { body } });
    }
  });

  refresh();
  return { ok: true as const };
}

export async function deleteTag(id: string) {
  await db.tag.delete({ where: { id } });
  refresh();
  return { ok: true as const };
}
