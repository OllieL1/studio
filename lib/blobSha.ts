import { createHash } from "node:crypto";

/**
 * Git's own id for a file's content - so a knowledge-base save knows the new
 * blob's sha without asking GitHub, and an unchanged file is never committed.
 * Server only (node:crypto), which is why it isn't in lib/kb.ts.
 */
export function blobSha(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
