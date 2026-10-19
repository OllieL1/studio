/**
 * Where the stick is mounted. Used by deploy and pull.
 *
 * Order: STUDIO_USB, then /Volumes/Studio (Mac), then - in WSL on Windows -
 * the drive labelled STUDIO, or any /mnt/<letter> holding Start Studio.bat.
 * The stick must be mounted in WSL first:
 *
 *   sudo mkdir -p /mnt/d && sudo mount -t drvfs D: /mnt/d -o uid=$(id -u),gid=$(id -g)
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";

export function findStick() {
  if (process.env.STUDIO_USB) return process.env.STUDIO_USB;
  if (existsSync("/Volumes/Studio")) return "/Volumes/Studio";
  if (existsSync("/mnt/c")) {
    let labelled = [];
    try {
      const out = execSync(
        `powershell.exe -NoProfile -Command "Get-Volume | Where-Object FileSystemLabel -eq 'STUDIO' | ForEach-Object { $_.DriveLetter }"`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      labelled = out.split(/\s+/).filter(Boolean).map((l) => `/mnt/${l.toLowerCase()}`);
    } catch { /* no powershell: fall back to scanning */ }
    const scan = readdirSync("/mnt").filter((d) => d.length === 1 && d !== "c").map((d) => `/mnt/${d}`);
    for (const p of [...labelled, ...scan]) {
      if (existsSync(`${p}/studio`) || existsSync(`${p}/Start Studio.bat`)) return p;
    }
    if (labelled.length) return labelled[0]; // blank stick, labelled STUDIO
  }
  return "/Volumes/Studio";
}

/**
 * Why a database can't safely be copied as a single file right now, or null.
 *
 * SQLite keeps recent changes in "<db>-wal" until Studio shuts down cleanly.
 * Copying or replacing studio.db while that file holds changes either loses
 * them or - worse - has them replayed over the new file when Studio next
 * opens it, scrambling whatever the new file put on those pages. (That's
 * how the 19 Oct deploy broke the weekly schedule's tables.)
 */
export function busyDatabase(dbPath) {
  const wal = `${dbPath}-wal`;
  if (existsSync(wal) && statSync(wal).size > 0) {
    return "Studio is running from it, or didn't shut down cleanly (its -wal file still holds changes). "
      + "Quit Studio - or open and quit it once if it's already closed - then try again.";
  }
  return null;
}

/** A Windows drive seen from WSL (9p/drvfs): SQLite locking is unreliable there. */
export const isWindowsDrive = (p) => /^\/mnt\/[a-z](\/|$)/.test(p);
