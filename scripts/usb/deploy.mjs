/**
 * Put Studio on the USB stick, or update it. Run on the Mac:
 *
 *   npm run usb:deploy
 *
 * Builds the app, then syncs to the stick:
 *
 *   STUDIO/
 *     Start Studio.command     double-click on the Mac
 *     Start Studio.bat         double-click on Windows
 *     README.txt
 *     studio/
 *       app/                   the built site (replaced on every deploy)
 *       runtime/               Node for each machine
 *       data/studio.db         YOUR DATA - never overwritten by a deploy
 *       config.env             Google / Spotify credentials
 *       launcher.mjs
 *
 * The database is copied across only if the stick has none yet (the first
 * deploy). After that the stick is the live copy: deploys only update the
 * app and apply any new database migrations to it.
 *
 * Set STUDIO_USB to deploy somewhere other than /Volumes/Studio (used for a
 * dry run into a local folder).
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync,
  writeFileSync, utimesSync, copyFileSync, chmodSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STICK = process.env.STUDIO_USB ?? "/Volumes/Studio";
const CACHE = join(REPO, ".usb-cache");
const STAGE = join(CACHE, "stage");
const DEST = join(STICK, "studio");
const args = new Set(process.argv.slice(2));

const step = (m) => console.log(`\n▸ ${m}`);
const info = (m) => console.log(`  ${m}`);
const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };

// ── 0. Preconditions ──────────────────────────────────────────────────────
if (!existsSync(STICK)) die(`Can't find the stick at ${STICK}. Is it plugged in?`);
try { writeFileSync(join(STICK, ".studio-write-test"), "ok"); rmSync(join(STICK, ".studio-write-test")); }
catch { die(`The stick at ${STICK} isn't writable.`); }
const nodeVersion = existsSync(join(CACHE, "node-version")) ? readFileSync(join(CACHE, "node-version"), "utf8").trim() : null;
for (const f of ["mac-arm64/node", "win-x64/node.exe"]) {
  if (!existsSync(join(CACHE, f))) die(`Missing ${f} in .usb-cache - run: npm run usb:runtimes`);
}

// ── 1. Build ──────────────────────────────────────────────────────────────
if (!args.has("--skip-build")) {
  step("Building Studio");
  execSync("npx prisma generate", { cwd: REPO, stdio: "ignore" });
  execSync("npx next build", { cwd: REPO, stdio: ["ignore", "ignore", "inherit"] });
  info("built");
}

// ── 2. Stage a USB-safe copy of the app locally ──────────────────────────
step("Preparing the app");
rmSync(STAGE, { recursive: true, force: true });
const standalone = join(REPO, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) die("No standalone build found - run without --skip-build.");

/**
 * Copy a tree, replacing symlinks with the real files they point to (FAT32
 * can't store links) and skipping what the stick doesn't need.
 */
const SKIP = [/^node_modules\/@img(\/|$)/, /^node_modules\/sharp(\/|$)/, /^\.env/];
function stageTree(src, dst, base = src) {
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const rel = relative(base, from).split("\\").join("/");
    if (SKIP.some((re) => re.test(rel))) continue;
    const st = statSync(from); // follows symlinks: links become real copies
    if (st.isDirectory()) { mkdirSync(join(dst, name), { recursive: true }); stageTree(from, join(dst, name), base); }
    else {
      mkdirSync(dst, { recursive: true });
      copyFileSync(from, join(dst, name));
      // Keep the original timestamp, so the sync can skip files that haven't
      // changed since the last deploy instead of re-copying all of them.
      utimesSync(join(dst, name), st.atime, st.mtime);
    }
  }
}
stageTree(standalone, join(STAGE, "app"));
stageTree(join(REPO, ".next", "static"), join(STAGE, "app", ".next", "static"));
if (existsSync(join(REPO, "public"))) stageTree(join(REPO, "public"), join(STAGE, "app", "public"));
info(`${countFiles(join(STAGE, "app"))} files staged`);

// ── 3. Sync to the stick ─────────────────────────────────────────────────
step(`Syncing to ${STICK}`);
mkdirSync(DEST, { recursive: true });

/**
 * One-way sync: copies what changed (size or mtime, allowing FAT32's
 * two-second timestamp resolution) and deletes what's gone. Written with
 * plain reads and writes rather than copyFile, so macOS doesn't litter the
 * stick with "._" metadata files that Windows would show.
 */
function sync(src, dst) {
  let copied = 0, removed = 0, bytes = 0;
  const walk = (s, d) => {
    mkdirSync(d, { recursive: true });
    const want = new Set(readdirSync(s));
    for (const name of readdirSync(d)) {
      if (name.startsWith("._")) { rmSync(join(d, name), { force: true }); continue; }
      if (!want.has(name)) { rmSync(join(d, name), { recursive: true, force: true }); removed++; }
    }
    for (const name of want) {
      const from = join(s, name), to = join(d, name);
      const st = statSync(from);
      if (st.isDirectory()) { walk(from, to); continue; }
      if (existsSync(to)) {
        const dt = statSync(to);
        if (dt.size === st.size && Math.abs(dt.mtimeMs - st.mtimeMs) <= 2000) continue;
      }
      writeFileSync(to, readFileSync(from));
      utimesSync(to, st.atime, st.mtime);
      copied++; bytes += st.size;
    }
  };
  walk(src, dst);
  return { copied, removed, bytes };
}

/**
 * Sync the app by content. Every build rewrites all its files with new
 * timestamps, so a timestamp check would re-copy all ~3,000 files (100MB+)
 * on every deploy. Instead, a manifest of content hashes is kept on the
 * stick, and only files whose contents changed are written.
 */
function syncByContent(src, dst) {
  const manifestPath = join(dst, ".manifest.json");
  let previous = {};
  try { previous = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { /* first deploy */ }

  const next = {};
  let copied = 0, removed = 0, bytes = 0;
  const walk = (s, rel = "") => {
    for (const name of readdirSync(s)) {
      const from = join(s, name), r = rel ? `${rel}/${name}` : name;
      if (statSync(from).isDirectory()) { walk(from, r); continue; }
      const data = readFileSync(from);
      const hash = createHash("sha1").update(data).digest("hex");
      next[r] = hash;
      const to = join(dst, ...r.split("/"));
      if (previous[r] === hash && existsSync(to)) continue;
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, data);
      copied++; bytes += data.length;
    }
  };
  mkdirSync(dst, { recursive: true });
  walk(src);

  // Delete what the new build no longer has.
  for (const r of Object.keys(previous)) {
    if (!(r in next)) { rmSync(join(dst, ...r.split("/")), { force: true }); removed++; }
  }
  // Written last: an interrupted deploy leaves the old manifest, so the next
  // run re-checks everything rather than trusting a half-finished copy.
  writeFileSync(manifestPath, JSON.stringify(next));
  return { copied, removed, bytes };
}

const t0 = Date.now();
const app = syncByContent(join(STAGE, "app"), join(DEST, "app"));
info(`app: ${app.copied} files updated (${(app.bytes / 1e6).toFixed(1)} MB), ${app.removed} removed`);

// Runtimes: only the two binaries, not the whole cache.
for (const [from, to] of [["mac-arm64/node", "mac-arm64/node"], ["win-x64/node.exe", "win-x64/node.exe"]]) {
  const src = join(CACHE, from), dst = join(DEST, "runtime", to);
  mkdirSync(dirname(dst), { recursive: true });
  const st = statSync(src);
  if (!existsSync(dst) || statSync(dst).size !== st.size) {
    info(`copying Node for ${from.split("/")[0]} (${(st.size / 1e6).toFixed(0)} MB)...`);
    writeFileSync(dst, readFileSync(src));
  }
  // The Mac binary must be executable. FAT32 treats everything as executable,
  // but set it anyway rather than rely on the filesystem.
  chmodSync(dst, 0o755);
}
info(`Node ${nodeVersion ?? "(unknown version)"} for Mac and Windows`);

// Launchers.
writeFileSync(join(DEST, "launcher.mjs"), readFileSync(join(REPO, "scripts/usb/launcher.mjs")));
writeFileSync(join(STICK, "Start Studio.command"), readFileSync(join(REPO, "scripts/usb/Start Studio.command")));
writeFileSync(join(STICK, "Start Studio.bat"), readFileSync(join(REPO, "scripts/usb/Start Studio.bat")));
chmodSync(join(STICK, "Start Studio.command"), 0o755);

// Credentials: only what the app needs from .env, never DATABASE_URL.
const env = existsSync(join(REPO, ".env")) ? readFileSync(join(REPO, ".env"), "utf8") : "";
const keep = env.split(/\r?\n/).filter((l) => /^(GOOGLE_|SPOTIFY_)/.test(l.trim()));
writeFileSync(join(DEST, "config.env"),
  ["# Studio credentials - Google Calendar and Spotify.", "# If the stick is lost, see README.txt.", ...keep, ""].join("\n"));

// Stop Spotlight indexing the stick: fewer writes, no hidden clutter.
writeFileSync(join(STICK, ".metadata_never_index"), "");

writeFileSync(join(STICK, "README.txt"), readFileSync(join(REPO, "scripts/usb/README.txt"), "utf8").replace(/\n/g, "\r\n"));

// ── 4. Data: first deploy only ───────────────────────────────────────────
step("Your data");
const db = join(DEST, "data", "studio.db");
mkdirSync(dirname(db), { recursive: true });
if (!existsSync(db)) {
  const local = join(REPO, "prisma", "dev.db");
  if (!existsSync(local)) die("No database on the stick and none locally to copy.");
  writeFileSync(db, readFileSync(local));
  info("First deploy: copied your data onto the stick. From now on the stick is the live copy.");
} else {
  info("Stick already has data - left untouched.");
}

// ── 5. Apply schema changes to the stick's database ─────────────────────
step("Database migrations");
const out = execSync("npx prisma migrate deploy", {
  cwd: REPO,
  env: { ...process.env, DATABASE_URL: `file:${db}` },
  encoding: "utf8",
});
const applied = (out.match(/Applying migration/g) ?? []).length;
info(applied ? `${applied} migration(s) applied` : "already up to date");

// ── 6. Stamp ─────────────────────────────────────────────────────────────
let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: REPO, encoding: "utf8" }).trim(); } catch {}
writeFileSync(join(DEST, "VERSION"), `Studio ${commit}\nDeployed ${new Date().toISOString()}\nNode ${nodeVersion}\n`);

// Remove any "._" files macOS still created (e.g. from chmod on FAT32).
try { execSync(`dot_clean -m "${STICK}"`, { stdio: "ignore" }); } catch {}

console.log(`\n✓ Done in ${((Date.now() - t0) / 1000).toFixed(0)}s. Eject the stick before unplugging it.\n`);

function countFiles(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    n += statSync(p).isDirectory() ? countFiles(p) : 1;
  }
  return n;
}
