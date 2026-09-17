/**
 * Copies the SQLite database to ./backups with a timestamp.
 *
 *   npm run backup
 *
 * AIM.md's reason for avoiding localStorage was fear of losing data. The
 * whole database is one file, so a backup is one copy — run this before any
 * schema change, or on a cron if you like.
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
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
copyFileSync(src, dest);

// Keep the most recent N, discard the rest.
const backups = readdirSync(dir)
  .filter((f) => f.startsWith("dev-") && f.endsWith(".db"))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

for (const { f } of backups.slice(KEEP)) unlinkSync(join(dir, f));

const kb = (statSync(dest).size / 1024).toFixed(0);
console.log(`\n  Backed up to backups/dev-${stamp}.db (${kb} KB)`);
console.log(`  ${Math.min(backups.length, KEEP)} backup(s) kept.\n`);
