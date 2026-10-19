/**
 * Copy the live database from the stick into this project, for developing
 * against real data. Backs up the local copy first. Never writes to the stick.
 *
 *   npm run usb:pull
 */
import { existsSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { busyDatabase, findStick } from "./stick.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STICK_DB = join(findStick(), "studio", "data", "studio.db");
const LOCAL = join(REPO, "prisma", "dev.db");

if (!existsSync(STICK_DB)) { console.error(`\n✗ No database found at ${STICK_DB}. Is the stick plugged in?\n`); process.exit(1); }
const busyStick = busyDatabase(STICK_DB);
if (busyStick) { console.error(`\n✗ The stick's database is in use. ${busyStick}\n`); process.exit(1); }
const busyLocal = existsSync(LOCAL) && busyDatabase(LOCAL);
if (busyLocal) { console.error("\n✗ prisma/dev.db is in use - stop `npm run dev` first.\n"); process.exit(1); }
if (existsSync(LOCAL)) {
  mkdirSync(join(REPO, "backups"), { recursive: true });
  const bak = join(REPO, "backups", `dev-before-pull-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.db`);
  copyFileSync(LOCAL, bak);
  console.log(`  local copy backed up to ${bak.replace(REPO + "/", "")}`);
}
copyFileSync(STICK_DB, LOCAL);
// The local WAL index belonged to the old file.
rmSync(`${LOCAL}-shm`, { force: true });
console.log("  ✓ pulled the stick's data into prisma/dev.db (the stick is unchanged)\n");
