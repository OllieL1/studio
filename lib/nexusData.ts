import { db } from "./db";
import { stripMentions } from "./mentions";

/** What the Nexus gallery shows, newest first with pinned notes on top. */
export async function getNexus(tag?: string, query?: string) {
  const notes = await db.note.findMany({
    where: {
      ...(tag ? { tags: { some: { tag: { key: tag.toLowerCase() } } } } : {}),
      ...(query ? { OR: [{ title: { contains: query } }, { body: { contains: query } }] } : {}),
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: { tags: { include: { tag: { select: { name: true, key: true } } } } },
  });

  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    icon: n.icon,
    pinned: n.pinned,
    updatedAt: n.updatedAt,
    tags: n.tags.map((t) => t.tag.name),
    excerpt: excerptOf(n.body),
    words: stripMentions(n.body).split(/\s+/).filter(Boolean).length,
  }));
}

/** The first couple of lines, with syntax and chips reduced to plain text. */
export function excerptOf(body: string, length = 140): string {
  const text = stripMentions(body)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_`>|]/g, "")
    .replace(/^\s*[-+]\s+/gm, "· ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** One note, with its tags. */
export async function getNote(id: string) {
  return db.note.findUnique({
    where: { id },
    include: { tags: { include: { tag: { select: { name: true } } } } },
  });
}

/**
 * Everything filed under a tag: papers tagged with it, notes tagged with it,
 * and notes that mention it in their text.
 */
export async function getTagPage(key: string) {
  const tag = await db.tag.findUnique({
    where: { key: key.toLowerCase() },
    include: {
      papers: { include: { paper: true } },
      notes: { include: { note: true } },
    },
  });
  if (!tag) return null;

  // Mentions live in the body as `@#[name]`, so they're found by text.
  const mentioned = await db.note.findMany({
    where: { body: { contains: `@#[${tag.name}]` } },
    select: { id: true, title: true, icon: true, body: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const taggedIds = new Set(tag.notes.map((n) => n.note.id));

  return {
    tag: { id: tag.id, name: tag.name, key: tag.key },
    papers: tag.papers.map((p) => p.paper),
    notes: tag.notes.map((n) => ({
      id: n.note.id,
      title: n.note.title,
      icon: n.note.icon,
      updatedAt: n.note.updatedAt,
      excerpt: excerptOf(n.note.body),
    })),
    mentions: mentioned
      .filter((n) => !taggedIds.has(n.id))
      .map((n) => ({
        id: n.id,
        title: n.title,
        icon: n.icon,
        updatedAt: n.updatedAt,
        excerpt: excerptOf(n.body),
      })),
  };
}

/** Notes that mention this note, for the backlinks panel. */
export async function getBacklinks(noteId: string) {
  const notes = await db.note.findMany({
    where: { body: { contains: `@n[${noteId}` }, NOT: { id: noteId } },
    select: { id: true, title: true, icon: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return notes;
}
