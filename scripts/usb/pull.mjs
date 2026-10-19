/**
 * Copy the live database from the stick into this project, for developing
 * against real data. Backs up the local copy first. Never writes to the stick.
 *
 *   npm run usb:pull
 */
import { existsSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findStick, studioRunning } from "./stick.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STICK_DB = join(findStick(), "studio", "data", "studio.db");
const LOCAL = join(REPO, "prisma", "dev.db");

if (!existsSync(STICK_DB)) { console.error(`\n✗ No database found at ${STICK_DB}. Is the stick plugged in?\n`); process.exit(1); }
const running = await studioRunning(findStick());
if (running) { console.error(`\n✗ ${running} Close its window first, so its data is complete.\n`); process.exit(1); }
try {
  const h = await (await fetch("http://127.0.0.1:3111/api/health", { signal: AbortSignal.timeout(1500) })).json();
  if (h?.app === "studio") { console.error("\n✗ prisma/dev.db is in use - stop `npm run dev` first.\n"); process.exit(1); }
} catch { /* not running */ }
if (existsSync(LOCAL)) {
  mkdirSync(join(REPO, "backups"), { recursive: true });
  const bak = join(REPO, "backups", `dev-before-pull-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.db`);
  copyFileSync(LOCAL, bak);
  if (existsSync(`${LOCAL}-wal`)) copyFileSync(`${LOCAL}-wal`, `${bak}-wal`);
  console.log(`  local copy backed up to ${bak.replace(REPO + "/", "")}`);
}
// The database and its WAL travel together: the WAL holds Studio's latest
// changes if it was closed with its window, and a local WAL left from the
// dev server must never be replayed over the stick's file.
for (const f of [`${LOCAL}-wal`, `${LOCAL}-shm`]) rmSync(f, { force: true });
copyFileSync(STICK_DB, LOCAL);
if (existsSync(`${STICK_DB}-wal`)) copyFileSync(`${STICK_DB}-wal`, `${LOCAL}-wal`);
console.log("  ✓ pulled the stick's data into prisma/dev.db (the stick is unchanged)\n");
