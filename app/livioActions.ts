"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { describeDatabase, explainNotionError, parseDatabaseId } from "@/lib/notion";

function refresh() {
  revalidatePath("/livio", "layout");
}

export type NotionConnectResult =
  | { ok: true; title: string }
  | { ok: false; error: string; problems?: string[] };

/**
 * Save Livio's Notion connection - but only once Notion has confirmed the
 * secret works, the database is shared with it, and the columns are right.
 * A connection that's saved and then fails on every pull is worse than one
 * that refuses up front and says why.
 */
export async function connectNotion(secret: string, database: string): Promise<NotionConnectResult> {
  const token = secret.trim();
  if (!token) return { ok: false, error: "Paste the integration secret first." };
  const databaseId = parseDatabaseId(database);
  if (!databaseId) return { ok: false, error: "That doesn't look like a Notion database link." };

  try {
    const info = await describeDatabase(token, databaseId);
    if (info.problems.length) {
      return { ok: false, error: `“${info.title}” is missing what Livio needs:`, problems: info.problems };
    }
    const data = { token, databaseId, dataSourceId: info.dataSourceId, title: info.title };
    await db.notionAuth.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
    refresh();
    return { ok: true, title: info.title };
  } catch (e) {
    return { ok: false, error: explainNotionError(e) };
  }
}

export async function disconnectNotion() {
  await db.notionAuth.deleteMany({ where: { id: "singleton" } });
  refresh();
}
