/**
 * Local backup, run against a scratch copy of the database and a scratch
 * backup folder — real data and real backups are never touched.
 */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "studio-backup-test-"));
const dbCopy = join(scratch, "live.db");
copyFileSync("prisma/dev.db", dbCopy);
process.env.DATABASE_URL = `file:${dbCopy}`;
process.env.STUDIO_BACKUP_DIR = join(scratch, "Studio Backups");

const { backupNow, readBackupMeta, BACKUP_FILE } = await import("../lib/backup");
const { db } = await import("../lib/db");

const tests: [string, () => Promise<void>][] = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);
const dir = process.env.STUDIO_BACKUP_DIR;
const sqlite = (file: string, sql: string) => execFileSync("sqlite3", ["-readonly", file, sql], { encoding: "utf8" }).trim();

test("the development server never backs up", async () => {
  delete process.env.STUDIO_LIVE;
  const r = await backupNow();
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.skipped);
  assert.equal(existsSync(join(dir, BACKUP_FILE)), false, "nothing written");
  process.env.STUDIO_LIVE = "1";
});

test("the live app writes a complete, readable backup", async () => {
  const r = await backupNow();
  assert.ok(r.ok, JSON.stringify(r));
  const file = join(dir, BACKUP_FILE);
  assert.equal(sqlite(file, "PRAGMA integrity_check;"), "ok");
  for (const table of ["Session", "Task", "Course", "TaskItem"]) {
    assert.equal(sqlite(file, `SELECT count(*) FROM "${table}";`), sqlite(dbCopy, `SELECT count(*) FROM "${table}";`), `${table} rows match`);
  }
});

test("a new backup replaces the old one — only one file is kept", async () => {
  await db.session.create({
    data: { name: "backup test", startedAt: new Date(), endedAt: new Date(), minutes: 30, rawMinutes: 30, focus: 70 },
  });
  const r = await backupNow();
  assert.ok(r.ok);
  const dbs = readdirSync(dir).filter((f) => f.endsWith(".db"));
  assert.deepEqual(dbs, [BACKUP_FILE], "one backup, no temp or dated copies");
  assert.equal(sqlite(join(dir, BACKUP_FILE), "SELECT count(*) FROM Session WHERE name = 'backup test';"), "1", "includes the new session");
  assert.equal(readBackupMeta()!.sessions, await db.session.count());
});

test("a backup with fewer sessions doesn't replace a fuller one", async () => {
  // Pretend the existing backup came from a stick with far more history.
  const meta = readBackupMeta()!;
  writeFileSync(join(dir, "studio-backup.json"), JSON.stringify({ ...meta, sessions: meta.sessions + 50 }));
  const before = sqlite(join(dir, BACKUP_FILE), "SELECT count(*) FROM Session;");

  const r = await backupNow();
  assert.equal(r.ok, false);
  assert.ok(!r.ok && !r.skipped && r.keptPath && existsSync(r.keptPath), "the new snapshot is kept alongside");
  assert.equal(sqlite(join(dir, BACKUP_FILE), "SELECT count(*) FROM Session;"), before, "the fuller backup is untouched");
});

test("a failed backup leaves the previous one intact", async () => {
  writeFileSync(join(dir, "studio-backup.json"), JSON.stringify({ ...readBackupMeta()!, sessions: 0 }));
  const before = sqlite(join(dir, BACKUP_FILE), "SELECT count(*) FROM Session;");
  const good = process.env.STUDIO_BACKUP_DIR;
  process.env.STUDIO_BACKUP_DIR = join(scratch, "not-a-dir.txt", "nested"); // can't be created
  writeFileSync(join(scratch, "not-a-dir.txt"), "x");
  const r = await backupNow();
  process.env.STUDIO_BACKUP_DIR = good;
  assert.equal(r.ok, false);
  assert.equal(sqlite(join(dir, BACKUP_FILE), "SELECT count(*) FROM Session;"), before);
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
await db.$disconnect();
rmSync(scratch, { recursive: true, force: true });
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
