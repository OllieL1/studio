/**
 * Snapshots the SQLite database into ./backups with a timestamp.
 *
 *   npm run backup
 *
 * AIM.md's reason for avoiding localStorage was fear of losing data, so run
 * this before any schema change, or on a cron if you like.
 *
 * It uses SQLite's own `VACUUM INTO` rather than copying the file. Since
 * lib/db.ts switched the database to write-ahead logging, recent commits can
 * still be sitting in the -wal sidecar: a plain copy of the .db alone would
 * silently leave them out, which is the one thing a backup must not do.
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "prisma", "dev.db");
const dir = join(root, "backups");
const KEEP = 20;

if (!existsSync(src)) {
  console.error("No database at prisma/dev.db — run `npm run seed` first.");
  process.exit(1);
}

mkdirSync(dir, { recursive: true });

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .slice(0, 19);
const dest = join(dir, `dev-${stamp}.db`);

rmSync(dest, { force: true }); // VACUUM INTO refuses to overwrite
let how = "VACUUM INTO";
try {
  // node:sqlite is still gated behind a flag on some runtimes, so it has to
  // be reached for at run time rather than imported at the top.
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(src, { readOnly: true });
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  db.close();
} catch {
  // No node:sqlite here. Copy the file - and the -wal beside it, or a commit
  // that hasn't been checkpointed yet would be left out of the backup.
  how = "file copy";
  copyFileSync(src, dest);
  for (const ext of ["-wal", "-shm"]) {
    rmSync(dest + ext, { force: true });
    if (existsSync(src + ext)) copyFileSync(src + ext, dest + ext);
  }
}

// Keep the most recent N, discard the rest.
const backups = readdirSync(dir)
  .filter((f) => f.startsWith("dev-") && f.endsWith(".db"))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

for (const { f } of backups.slice(KEEP)) {
  unlinkSync(join(dir, f));
  for (const ext of ["-wal", "-shm"]) rmSync(join(dir, f + ext), { force: true });
}

const kb = (statSync(dest).size / 1024).toFixed(0);
console.log(`\n  Backed up to backups/dev-${stamp}.db (${kb} KB, ${how})`);
console.log(`  ${Math.min(backups.length, KEEP)} backup(s) kept.\n`);
