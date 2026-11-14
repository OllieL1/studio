"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ensureTags, pruneOrphanTags, tagKey } from "@/lib/tags";
import { renameTagMentions } from "@/lib/mentions";
import { CONFLICT } from "@/lib/editor/saveGuard";

/**
 * Nexus: the project's notebook, plus the tags shared with research.
 *
 * Notes are markdown like everything else, and the mentions inside them are
 * just text - which is why renaming a tag has to rewrite note bodies as well
 * as the tag record.
 */

/**
 * The pages that list notes: the gallery and the tag pages.
 *
 * Deliberately not the note pages themselves. Invalidating the page you are
 * currently writing on invites the server to re-render the editor underneath
 * you, and nothing on it has changed that you didn't just type.
 */
const refreshIndexes = (taskId?: string | null) => {
  revalidatePath("/project");
  revalidatePath("/project/tags", "layout");
  // A task note is listed on its task's page instead of the gallery.
  if (taskId) {
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/livio/todo/${taskId}`);
  }
};

/** Also the note pages - only when one appears, vanishes, or is rewritten. */
const refreshAll = () => {
  refreshIndexes();
  revalidatePath("/project/nexus", "layout");
};

/** A Nexus note, or - given a taskId - a note filed under that task, which
 *  takes the task's course rather than the project's. */
export async function createNote(input?: { title?: string; body?: string; taskId?: string }) {
  let courseId: string | null;
  if (input?.taskId) {
    const task = await db.task.findUnique({ where: { id: input.taskId }, select: { courseId: true } });
    if (!task) return { ok: false as const, error: "That task is gone." };
    courseId = task.courseId;
  } else {
    const project = await db.course.findFirst({ where: { isProject: true }, select: { id: true } });
    courseId = project?.id ?? null;
  }
  const note = await db.note.create({
    data: {
      title: input?.title?.trim().slice(0, 120) || "Untitled",
      body: input?.body ?? "",
      courseId,
      taskId: input?.taskId ?? null,
    },
    select: { id: true },
  });
  refreshIndexes(input?.taskId);
  return { ok: true as const, id: note.id };
}

/**
 * `expectedBody` is what the editor believes the body is now. When it's given
 * and the body has moved on - saved from another tab, or from this page as it
 * was before Back restored an old copy of it - nothing is written and the
 * editor is told so (lib/editor/saveGuard.ts).
 */
export async function updateNote(
  id: string,
  data: { title?: string; body?: string; pinned?: boolean; expectedBody?: string },
) {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title.trim().slice(0, 120) || "Untitled";
  if (data.body !== undefined) patch.body = data.body;
  if (data.pinned !== undefined) patch.pinned = data.pinned;

  if (data.expectedBody !== undefined) {
    // One statement, so nothing can land between the check and the write.
    const { count } = await db.note.updateMany({ where: { id, body: data.expectedBody }, data: patch });
    if (count === 0) return CONFLICT;
  }
  const note = data.expectedBody !== undefined
    ? await db.note.findUniqueOrThrow({ where: { id }, select: { taskId: true } })
    : await db.note.update({ where: { id }, data: patch, select: { taskId: true } });
  // A body save is the autosave; only what the gallery shows is worth
  // invalidating, and the gallery is dynamic so it re-queries on arrival.
  if (data.title !== undefined || data.pinned !== undefined) refreshIndexes(note.taskId);
  return { ok: true as const };
}

/** The body as stored now - for an editor checking its page isn't a stale copy. */
export async function readNoteBody(id: string) {
  const note = await db.note.findUnique({ where: { id }, select: { body: true } });
  return note?.body ?? null;
}

export async function deleteNote(id: string) {
  const note = await db.note.delete({ where: { id }, select: { taskId: true } });
  await pruneOrphanTags();
  refreshAll();
  if (note.taskId) {
    revalidatePath(`/tasks/${note.taskId}`, "layout");
    revalidatePath(`/livio/todo/${note.taskId}`, "layout");
  }
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
  const note = await db.note.findUnique({ where: { id }, select: { taskId: true } });
  refreshIndexes(note?.taskId);
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
  refreshIndexes();
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

  // Note bodies were rewritten, so the note pages have to go too.
  refreshAll();
  return { ok: true as const };
}

export async function deleteTag(id: string) {
  await db.tag.delete({ where: { id } });
  refreshIndexes();
  return { ok: true as const };
}
