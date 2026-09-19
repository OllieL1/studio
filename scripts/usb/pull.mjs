/**
 * Copy the live database from the stick into this project, for developing
 * against real data. Backs up the local copy first. Never writes to the stick.
 *
 *   npm run usb:pull
 */
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STICK_DB = join(process.env.STUDIO_USB ?? "/Volumes/Studio", "studio", "data", "studio.db");
const LOCAL = join(REPO, "prisma", "dev.db");

if (!existsSync(STICK_DB)) { console.error(`\n✗ No database found at ${STICK_DB}. Is the stick plugged in?\n`); process.exit(1); }
if (existsSync(LOCAL)) {
  mkdirSync(join(REPO, "backups"), { recursive: true });
  const bak = join(REPO, "backups", `dev-before-pull-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.db`);
  copyFileSync(LOCAL, bak);
  console.log(`  local copy backed up to ${bak.replace(REPO + "/", "")}`);
}
copyFileSync(STICK_DB, LOCAL);
console.log("  ✓ pulled the stick's data into prisma/dev.db (the stick is unchanged)\n");
