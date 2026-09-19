import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { db } from "./db";

/**
 * Local backup of the live data, in case the USB stick is lost.
 *
 * After each logged session, a snapshot of the whole database is written to
 * Documents/Studio Backups/ on whichever computer Studio is running on,
 * replacing the previous one. Each machine therefore holds a copy as of the
 * last session studied on it.
 *
 * Three rules keep it safe:
 * - The snapshot comes from SQLite's `VACUUM INTO`, which produces a complete,
 *   consistent copy even while the app is using the database. Copying the
 *   file directly could catch it half-written.
 * - It's written to a temporary file and only then renamed over the old
 *   backup, so a failed or interrupted backup never destroys the last good one.
 * - It won't replace a backup that has more sessions than the database being
 *   backed up. That covers a replacement stick set up from old data: logging
 *   one session on it must not wipe out the only full copy.
 *
 * Only the live app backs up (the USB launcher sets STUDIO_LIVE). The
 * development server runs on a copy of the data and must never overwrite a
 * real backup with it.
 */

export const BACKUP_FILE = "studio-backup.db";
const META_FILE = "studio-backup.json";

export type BackupMeta = { at: string; sessions: number; bytes: number };

export type BackupResult =
  | { ok: true; path: string; sessions: number }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string; keptPath?: string };

export function backupDir(): string {
  return process.env.STUDIO_BACKUP_DIR ?? join(homedir(), "Documents", "Studio Backups");
}

export function readBackupMeta(): (BackupMeta & { path: string }) | null {
  const dir = backupDir();
  try {
    const meta = JSON.parse(readFileSync(join(dir, META_FILE), "utf8")) as BackupMeta;
    const path = join(dir, BACKUP_FILE);
    return existsSync(path) ? { ...meta, path } : null;
  } catch {
    return null;
  }
}

export async function backupNow(): Promise<BackupResult> {
  if (!process.env.STUDIO_LIVE) {
    return { ok: false, skipped: true, reason: "Backups only run from the live app on the USB stick." };
  }

  const dir = backupDir();
  const final = join(dir, BACKUP_FILE);
  const tmp = join(dir, "studio-backup.tmp.db");

  try {
    mkdirSync(dir, { recursive: true });
    rmSync(tmp, { force: true }); // VACUUM INTO refuses to overwrite

    // SQLite wants forward slashes and doubled quotes in the path literal.
    const literal = tmp.replace(/\\/g, "/").replace(/'/g, "''");
    await db.$executeRawUnsafe(`VACUUM INTO '${literal}'`);

    const sessions = await db.session.count();
    const previous = readBackupMeta();

    if (previous && previous.sessions > sessions) {
      // Keep the fuller backup; park this one beside it rather than lose it.
      const kept = join(dir, `studio-backup-${stamp()}-fewer-sessions.db`);
      renameSync(tmp, kept);
      return {
        ok: false,
        skipped: false,
        error: `This data has ${sessions} sessions but the existing backup has ${previous.sessions}, so the backup was kept.`,
        keptPath: kept,
      };
    }

    renameSync(tmp, final); // atomic replace on Mac and Windows
    const meta: BackupMeta = { at: new Date().toISOString(), sessions, bytes: statSync(final).size };
    writeFileSync(join(dir, META_FILE), JSON.stringify(meta, null, 2));
    return { ok: true, path: final, sessions };
  } catch (e) {
    // Cleanup can fail for the same reason the backup did; never let it mask
    // the real error or escape to the caller.
    try { rmSync(tmp, { force: true }); } catch { /* nothing to clean */ }
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
