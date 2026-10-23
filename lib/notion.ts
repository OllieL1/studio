/**
 * Notion, for Livio's todo inbox.
 *
 * Tasks jotted into a Notion database on the phone get pulled into Livio the
 * next time it opens. The connection is an internal integration: a secret
 * from notion.so/my-integrations, with the To-do database shared to it. No
 * OAuth, so there's no redirect URI to keep in step with the port.
 *
 * Speaks API version 2025-09-03, where a database is a container of data
 * sources and it's the data source that gets queried and has a schema.
 *
 * The pure parts (id parsing, schema checks) are separate from the fetches so
 * they can be tested without a network.
 */

export const NOTION_VERSION = "2025-09-03";
const API = "https://api.notion.com/v1";

/** The columns Livio reads and writes, and the property types it expects. */
export const EXPECTED_PROPERTIES = {
  Task: ["title"],
  // Notion's built-in Status type, or a plain select with the same options.
  Status: ["status", "select"],
  Deadline: ["date"],
  Synced: ["checkbox"],
} as const satisfies Record<string, readonly string[]>;

/**
 * The database id from whatever got pasted: a share link, a link with a
 * `?v=` view, or a bare id with or without dashes. The id is the last 32 hex
 * characters of the path; the query string is a view id, not the database.
 */
export function parseDatabaseId(input: string): string | null {
  const path = input.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  // The slug's title runs straight into the id once dashes go ("Feed" +
  // id), so take the trailing 32, not the first hex run.
  const compact = path.slice(path.lastIndexOf("/") + 1).replace(/-/g, "");
  const m = /([0-9a-f]{32})$/i.exec(compact);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Problems with a data source's schema, as sentences. Empty means usable. */
export function schemaProblems(properties: Record<string, { type: string }>): string[] {
  const problems: string[] = [];
  for (const [name, types] of Object.entries(EXPECTED_PROPERTIES)) {
    const prop = properties[name];
    if (!prop) problems.push(`No “${name}” property.`);
    else if (!(types as readonly string[]).includes(prop.type)) {
      problems.push(`“${name}” is a ${prop.type} property; Livio expects ${types.join(" or ")}.`);
    }
  }
  return problems;
}

export class NotionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function notion<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new NotionError(body?.message ?? `Notion answered ${res.status}.`, res.status);
  }
  return res.json() as Promise<T>;
}

type RichText = { plain_text: string }[];

export type DatabaseInfo = {
  title: string;
  dataSourceId: string;
  problems: string[];
};

/** Look a database up and check it has the columns Livio needs. */
export async function describeDatabase(token: string, databaseId: string): Promise<DatabaseInfo> {
  const db = await notion<{ title: RichText; data_sources: { id: string; name: string }[] }>(
    token, `/databases/${databaseId}`,
  );
  const source = db.data_sources[0];
  if (!source) throw new NotionError("That database has no data source to read.", 400);

  const ds = await notion<{ properties: Record<string, { type: string }> }>(token, `/data_sources/${source.id}`);
  return {
    title: db.title.map((t) => t.plain_text).join("") || "Untitled",
    dataSourceId: source.id,
    problems: schemaProblems(ds.properties),
  };
}

/** Notion's own errors are written for developers; say what to do instead. */
export function explainNotionError(e: unknown): string {
  if (e instanceof NotionError) {
    if (e.status === 401) return "Notion didn't accept that secret. Copy it again from notion.so/my-integrations.";
    if (e.status === 404) {
      return "Notion can't see that database. Open it, choose ••• → Connections, and add your integration.";
    }
    return e.message;
  }
  return "Couldn't reach Notion. Check the connection and try again.";
}

/* ── Pulling and writing back ───────────────────────────────────────────── */

type PropertyValue =
  | { type: "title"; title: RichText }
  | { type: "status"; status: { name: string } | null }
  | { type: "select"; select: { name: string } | null }
  | { type: "date"; date: { start: string } | null }
  | { type: "checkbox"; checkbox: boolean }
  | { type: string };

export type NotionPage = { id: string; properties: Record<string, PropertyValue> };

export type PulledTask = {
  pageId: string;
  title: string;
  /** A date-only deadline lands at 23:59 that day, the way Studio stores
   *  "sometime that day"; a deadline with a time keeps it. */
  dueAt: Date | null;
  status: string | null;
  statusType: "status" | "select";
};

/** Midnight-free: "2026-11-03" is the end of that day, local time. */
export function notionDate(start: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 23, 59);
  return new Date(start);
}

export function pageToTask(page: NotionPage): PulledTask {
  const p = page.properties;
  const title = p.Task && "title" in p.Task ? p.Task.title.map((t) => t.plain_text).join("").trim() : "";
  const date = p.Deadline && "date" in p.Deadline ? p.Deadline.date : null;
  const s = p.Status;
  const status = s && "status" in s ? s.status?.name ?? null : s && "select" in s ? s.select?.name ?? null : null;
  return {
    pageId: page.id,
    title: title || "Untitled",
    dueAt: date?.start ? notionDate(date.start) : null,
    status,
    statusType: s?.type === "select" ? "select" : "status",
  };
}

/** Every page not yet ticked Synced, across as many pages of results as it takes. */
export async function queryUnsynced(token: string, dataSourceId: string): Promise<PulledTask[]> {
  const out: PulledTask[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      token,
      `/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          filter: { property: "Synced", checkbox: { equals: false } },
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    out.push(...res.results.map(pageToTask));
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

export async function setSynced(token: string, pageId: string, synced: boolean): Promise<void> {
  await notion(token, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { Synced: { checkbox: synced } } }),
  });
}

/** Done when ticked off in Livio or Studio; Not Started when unticked. */
export async function setStatus(token: string, pageId: string, statusType: string, name: string): Promise<void> {
  const value = statusType === "select" ? { select: { name } } : { status: { name } };
  await notion(token, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { Status: value } }),
  });
}
