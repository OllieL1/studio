/**
 * The enhancement queue, seen from the repo (scripts/queue/cli.mjs) and from
 * deploy (scripts/usb/deploy.mjs).
 *
 * Items are added in the app, so they live in the stick's database. Claude
 * only ever *reads* that - from a copy - and writes what it did to
 * claude/queue/resolved.json, a file in git. The next deploy applies those
 * resolutions to the stick's database, in the same safe copy-and-swap it
 * already does for migrations. So an item reads "done" in Studio once the fix
 * is actually on the stick.
 *
 * Plain SQL through node:sqlite: these run outside Next, and the deploy
 * works on a database file the app's Prisma client isn't pointed at.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const KINDS = ["bug", "feature", "tweak"];
/** What Claude can resolve an item as. */
export const RESOLUTIONS = ["done", "question", "wontfix"];

/** Open items, in queue order: what's waiting, then what's waiting on an answer. */
export function readQueue(db, { all = false } = {}) {
  const where = all ? "" : `WHERE status IN ('queued', 'question')`;
  return db
    .prepare(`SELECT id, number, kind, title, body, app, path, status, position, resolution, "commit", createdAt, resolvedAt
              FROM Enhancement ${where}
              ORDER BY CASE status WHEN 'queued' THEN 0 WHEN 'question' THEN 1 ELSE 2 END, position`)
    .all();
}

/** The queue as markdown, for Claude to read. */
export function formatQueue(rows, source) {
  const queued = rows.filter((r) => r.status === "queued");
  const waiting = rows.filter((r) => r.status === "question");
  const out = [`# Enhancement queue`, ``, `Source: ${source}`, `${queued.length} queued, ${waiting.length} waiting on an answer.`, ``];
  const item = (r) => {
    const where = r.path ? ` · ${r.app} ${r.path}` : ` · ${r.app}`;
    out.push(`## #${r.number} [${r.kind}] ${r.title}`, ``, `id: ${r.id}${where} · noted ${fmtDate(r.createdAt)}`, ``);
    if (r.body?.trim()) out.push(r.body.trim(), ``);
    if (r.resolution?.trim()) out.push(`> ${r.status === "question" ? "Claude asked" : "Earlier note"}: ${r.resolution.trim().replace(/\n/g, "\n> ")}`, ``);
  };
  if (queued.length) { out.push(`---`, ``, `# Queued (work top-down)`, ``); queued.forEach(item); }
  if (waiting.length) { out.push(`---`, ``, `# Waiting on an answer (skip these)`, ``); waiting.forEach(item); }
  if (!rows.length) out.push(`Nothing queued.`);
  return out.join("\n");
}

const fmtDate = (v) => {
  const d = new Date(typeof v === "number" ? v : String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};

/* ── resolved.json ───────────────────────────────────────────────────── */

/** [{ id, number, title, status, note, at }] - one per item, the latest. */
export function readResolutions(file) {
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

/** Records (or replaces) what was done about one item. */
export function recordResolution(file, entry) {
  if (!RESOLUTIONS.includes(entry.status)) throw new Error(`status must be one of ${RESOLUTIONS.join(", ")}`);
  if (!entry.note?.trim()) throw new Error("a note is needed - it's what shows in Settings");
  const rest = readResolutions(file).filter((e) => e.id !== entry.id);
  const next = [...rest, { ...entry, note: entry.note.trim(), at: entry.at ?? new Date().toISOString() }]
    .sort((a, b) => a.number - b.number);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  return next;
}

/**
 * Applies resolutions to a database. Only ones newer than what the item
 * already carries: so running it twice changes nothing, and a question you've
 * answered and re-queued in the app isn't flipped back to a question by the
 * next deploy. `commitOf(id)` finds the commit for entries that name none.
 * Returns the entries applied.
 */
export function applyResolutions(db, entries, commitOf = () => null) {
  const hasTable = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Enhancement'`).get();
  if (!hasTable) return [];
  const get = db.prepare(`SELECT resolvedAt FROM Enhancement WHERE id = ?`);
  const set = db.prepare(
    `UPDATE Enhancement SET status = ?, resolution = ?, "commit" = ?, resolvedAt = ?, updatedAt = ? WHERE id = ?`,
  );
  const applied = [];
  for (const e of entries) {
    const row = get.get(e.id);
    if (!row) continue; // noted in another copy of the database (dev)
    const at = Date.parse(e.at);
    if (row.resolvedAt != null && toMs(row.resolvedAt) >= at) continue;
    set.run(e.status, e.note, e.commit ?? commitOf(e.id) ?? null, at, Date.now(), e.id);
    applied.push(e);
  }
  return applied;
}

/** Prisma stores SQLite DateTimes as epoch milliseconds; tolerate ISO text too. */
const toMs = (v) => (typeof v === "number" || typeof v === "bigint" ? Number(v) : Date.parse(String(v)));
