import { db } from "./db";

/**
 * Tags are shared by research papers and Nexus notes.
 *
 * A tag is matched case-insensitively on `key` but keeps the capitalisation it
 * was first given, so "PEFT" and "peft" are one tag that reads the way you
 * typed it.
 */

export const tagKey = (name: string) => name.trim().toLowerCase();

/** Clean up what someone typed: trimmed, no commas, no empty strings. */
export function parseTagInput(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter((t) => t.length > 0 && t.length <= 40)
    .filter((t) => {
      const k = tagKey(t);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Find or create each tag, returning their ids in order. */
export async function ensureTags(names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of parseTagInput(names.join(","))) {
    const tag = await db.tag.upsert({
      where: { key: tagKey(name) },
      create: { name, key: tagKey(name) },
      update: {},
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

/** Tags with how much is filed under each - for the pickers and tag pages. */
export async function allTags() {
  const tags = await db.tag.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, key: true, _count: { select: { papers: true, notes: true } } },
  });
  return tags.map((t) => ({
    id: t.id,
    name: t.name,
    key: t.key,
    papers: t._count.papers,
    notes: t._count.notes,
    total: t._count.papers + t._count.notes,
  }));
}

/** Drop tags nothing is filed under any more, after an edit. */
export async function pruneOrphanTags() {
  await db.tag.deleteMany({ where: { papers: { none: {} }, notes: { none: {} } } });
}
