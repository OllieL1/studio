/**
 * Tag names, without touching the database.
 *
 * Split out from lib/tags.ts so the picker - a client component - can clean up
 * what's typed without dragging Prisma into the browser bundle.
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
