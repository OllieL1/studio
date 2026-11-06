/**
 * The enhancement queue from the terminal - what Claude Code reads and
 * resolves (see .claude/skills/enhancements/SKILL.md).
 *
 *   npm run queue                         queued items, top-down, as markdown
 *   npm run queue -- --all                done and won't-fix ones too
 *   npm run queue -- --dev                read prisma/dev.db, not the stick
 *   npm run queue -- resolve 14 --status done --note "What changed…"
 *   npm run queue -- resolve 14 --status question --note-file /tmp/q.md
 *   npm run queue -- pending              resolutions waiting for a deploy
 *
 * Reads the stick's database (a copy - the stick is never written here),
 * falling back to prisma/dev.db when the stick isn't plugged in. `resolve`
 * writes claude/queue/resolved.json; `npm run usb:deploy` applies it.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { findStick, foldedCopy } from "../usb/stick.mjs";
import { formatQueue, readQueue, readResolutions, recordResolution, RESOLUTIONS } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESOLVED = join(REPO, "claude", "queue", "resolved.json");
const DEV_DB = join(REPO, "prisma", "dev.db");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const die = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

const hasTable = (db) => !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Enhancement'`).get();

/** The database to read, opened read-only, and a description of where it came from. */
async function open() {
  let why = "--dev";
  if (!flag("dev")) {
    why = "the stick isn't plugged in";
    const stickDb = join(findStick(), "studio", "data", "studio.db");
    if (existsSync(stickDb)) {
      const cache = join(REPO, ".usb-cache");
      mkdirSync(cache, { recursive: true });
      const copy = join(cache, "queue.db");
      try {
        await foldedCopy(stickDb, copy);
        const db = new DatabaseSync(copy, { readOnly: true });
        if (hasTable(db)) return { db, source: `the stick (${stickDb})` };
        db.close();
        why = "the stick's Studio predates the queue - deploy it first";
      } catch (e) {
        why = `couldn't read the stick's database: ${e.message}`;
      }
    }
  }
  if (!existsSync(DEV_DB)) die("No database: the stick isn't plugged in and prisma/dev.db doesn't exist.");
  const db = new DatabaseSync(DEV_DB, { readOnly: true });
  if (!hasTable(db)) die("prisma/dev.db has no Enhancement table - run `npx prisma migrate deploy`.");
  return { db, source: `prisma/dev.db (${why})` };
}

// Positional words: whatever isn't a flag or a flag's value.
const VALUED = ["--status", "--note", "--note-file"];
const [command, ref] = args.filter((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]));

if (!command) {
  const { db, source } = await open();
  console.log(formatQueue(readQueue(db, { all: flag("all") }), source));
  if (flag("all")) {
    const closed = readQueue(db, { all: true }).filter((r) => !["queued", "question"].includes(r.status));
    if (closed.length) {
      console.log(`\n---\n\n# Closed\n`);
      for (const r of closed) console.log(`- #${r.number} [${r.kind}] ${r.title} - ${r.status}${r.commit ? ` (${r.commit})` : ""}`);
    }
  }
} else if (command === "resolve") {
  const number = Number(String(ref ?? "").replace(/^#/, ""));
  if (!Number.isInteger(number) || number < 1) die("Which item? e.g. npm run queue -- resolve 14 --status done --note \"…\"");
  const status = opt("status") ?? "done";
  if (!RESOLUTIONS.includes(status)) die(`--status must be one of: ${RESOLUTIONS.join(", ")}`);
  const noteFile = opt("note-file");
  const note = noteFile ? readFileSync(noteFile === "-" ? 0 : noteFile, "utf8") : opt("note");
  if (!note?.trim()) die("Give a --note \"…\" (or --note-file path) - it's what shows in Settings.");

  const { db, source } = await open();
  const row = db.prepare(`SELECT id, number, title FROM Enhancement WHERE number = ?`).get(number);
  if (!row) die(`No #${number} in ${source}.`);
  recordResolution(RESOLVED, { id: row.id, number: row.number, title: row.title, status, note });
  console.log(`  ✓ #${row.number} ${row.title} → ${status}. Commit claude/queue/resolved.json with the fix; the next deploy marks it in Studio.`);
} else if (command === "pending") {
  const entries = readResolutions(RESOLVED);
  const { db, source } = await open();
  const get = db.prepare(`SELECT status, resolvedAt FROM Enhancement WHERE id = ?`);
  const waiting = entries.filter((e) => {
    const row = get.get(e.id);
    return row && (row.resolvedAt == null || Number(row.resolvedAt) < Date.parse(e.at));
  });
  console.log(waiting.length
    ? `${waiting.length} resolution(s) not yet on ${source}:\n${waiting.map((e) => `- #${e.number} ${e.title} → ${e.status}`).join("\n")}`
    : `Everything in resolved.json is already on ${source}.`);
} else {
  die(`Unknown command "${command}". Try: npm run queue, npm run queue -- resolve <n> --status done --note "…", npm run queue -- pending`);
}
