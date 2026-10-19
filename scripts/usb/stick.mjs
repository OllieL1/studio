/**
 * Where the stick is mounted. Used by deploy and pull.
 *
 * Order: STUDIO_USB, then /Volumes/Studio (Mac), then - in WSL on Windows -
 * the drive labelled STUDIO, or any /mnt/<letter> holding Start Studio.bat.
 * The stick must be mounted in WSL first:
 *
 *   sudo mkdir -p /mnt/d && sudo mount -t drvfs D: /mnt/d -o uid=$(id -u),gid=$(id -g)
 */
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";

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
 * Whether Studio is running from the stick right now - a description, or null.
 *
 * Its database must never be copied or replaced while it is: SQLite keeps
 * recent changes in "studio.db-wal", and a studio.db replaced underneath a
 * live (or later reopened) WAL gets those changes replayed over it. That's
 * how the 19 Oct deploy scrambled the weekly schedule's tables.
 */
export async function studioRunning(stick) {
  // The live app answers on its port - always on a Mac, and from WSL when
  // Windows' localhost is reachable. The dev server answers too; that's not it.
  try {
    const res = await fetch("http://127.0.0.1:3111/api/health", { signal: AbortSignal.timeout(1500) });
    const h = await res.json();
    if (h?.app === "studio" && h.mode !== "development") return "Studio is running.";
  } catch { /* nothing listening */ }
  try {
    if (isWindowsDrive(stick)) {
      const letter = stick.match(/^\/mnt\/([a-z])/)[1].toUpperCase();
      const out = execFileSync("powershell.exe", ["-NoProfile", "-Command",
        `Get-Process | Where-Object { $_.Path -like '${letter}:\\*' } | ForEach-Object { $_.Name }`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const names = out.split(/\s+/).filter(Boolean);
      if (names.length) return `Studio is running from the stick (${[...new Set(names)].join(", ")}).`;
    } else if (process.platform === "darwin") {
      const out = execFileSync("pgrep", ["-f", `${stick}/studio/`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      if (out.trim()) return "Studio is running from the stick.";
    }
  } catch { /* pgrep exits 1 when nothing matches; no powershell: rely on the port */ }
  return null;
}

/**
 * Copy a database that may have a leftover "-wal" (closing Studio's window
 * ends it without folding its last changes into studio.db - that's normal
 * and safe for SQLite) into one self-contained file at `dest`. Only call it
 * while Studio isn't running. Returns whether there was anything to fold.
 */
export async function foldedCopy(src, dest) {
  for (const f of [dest, `${dest}-wal`, `${dest}-shm`]) rmSync(f, { force: true });
  copyFileSync(src, dest);
  const hadWal = existsSync(`${src}-wal`) && statSync(`${src}-wal`).size > 0;
  if (!hadWal) return false;
  copyFileSync(`${src}-wal`, `${dest}-wal`);
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dest);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const ok = Object.values(db.prepare("PRAGMA quick_check").get())[0];
  db.close();
  rmSync(`${dest}-wal`, { force: true });
  rmSync(`${dest}-shm`, { force: true });
  if (ok !== "ok") throw new Error(`the database didn't pass SQLite's check after folding: ${ok}`);
  return true;
}

/** Size and modified time of a database and its WAL - to notice if it changed. */
export function fingerprint(db) {
  return [db, `${db}-wal`].map((f) => (existsSync(f) ? `${statSync(f).size}@${statSync(f).mtimeMs}` : "-")).join(" ");
}

/** A Windows drive seen from WSL (9p/drvfs): SQLite locking is unreliable there. */
export const isWindowsDrive = (p) => /^\/mnt\/[a-z](\/|$)/.test(p);
