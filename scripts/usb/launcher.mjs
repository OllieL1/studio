/**
 * Studio launcher. Lives on the USB stick at studio/launcher.mjs and is run by
 * the bundled Node: "Start Studio.command" on the Mac, "Start Studio.bat" on
 * Windows. Everything platform-specific is kept in this one file.
 *
 * 1. If Studio is already running, just open the browser.
 * 2. Otherwise start the server (bound to this computer only - nobody else on
 *    the network can reach it), wait until it can read the database, then open
 *    the browser.
 *
 * The server runs inside this same process, not as a child. On Windows a
 * child process survives its console window being closed, which would leave
 * Studio running with the database open and the stick impossible to eject.
 * One process means closing the window always stops everything.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import net from "node:net";

const ROOT = dirname(fileURLToPath(import.meta.url)); // .../studio
const PORT = 3000; // fixed: the Google and Spotify sign-in redirects point here
const URL_ = `http://localhost:${PORT}`;
const IS_WIN = process.platform === "win32";

const say = (m = "") => console.log(m ? `  ${m}` : "");
function fail(m) {
  say(); say(`✗ ${m}`); say();
  say("Press Enter to close this window.");
  process.stdin.resume();
  process.stdin.once("data", () => process.exit(1));
}

/** GET /api/health -> { app, ok, mode } or null if nothing answers. */
function health() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/api/health", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(body) }); } catch { resolve({ status: res.statusCode }); }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

/** True if nothing is listening on the port, i.e. we can start there. */
function portFree() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(PORT, "127.0.0.1");
  });
}

/**
 * The port is taken but nothing answers as Studio - usually a Studio that was
 * just closed and is still shutting down. Give it a few seconds.
 */
async function waitForPort(seconds = 12) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await portFree()) return "free";
    const h = await health();
    if (h?.app === "studio") return "studio";
    await new Promise((r) => setTimeout(r, 500));
  }
  return "busy";
}

function openBrowser() {
  if (process.env.STUDIO_NO_BROWSER) return; // for automated tests
  if (IS_WIN) execFile("cmd", ["/c", "start", "", URL_]);
  else if (process.platform === "darwin") execFile("open", [URL_]);
  else execFile("xdg-open", [URL_]);
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

// Closing the window (or Ctrl+C) ends this process - and with it the server.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(0));

say(); say("Studio"); say("──────"); say();

const existing = await health();
if (existing?.app === "studio" && existing.mode === "development") {
  fail(
    "The Studio development server is running on this computer (npm run dev).\n" +
    "  It uses a copy of your data, not the stick. Stop it, then start Studio again.",
  );
} else if (existing?.app === "studio" && !existing.ok) {
  fail(`Studio is already running but can't read its database:\n  ${existing.error}\n  Close the other Studio window and try again.`);
} else if (existing?.app === "studio") {
  say("Studio is already running - opening it.");
  openBrowser();
  setTimeout(() => process.exit(0), 800);
} else if (existing) {
  fail(`Something else is using port ${PORT}. Close it (or restart the computer) and try again.`);
} else {
  const server = join(ROOT, "app", "server.js");
  const dbFile = join(ROOT, "data", "studio.db");
  if (!existsSync(server)) fail("The app is missing from the stick (studio/app/server.js). Re-run the deploy from the Mac.");
  else if (!existsSync(dbFile)) fail("The database is missing (studio/data/studio.db). Restore it from a backup.");
  else {
    const port = (await portFree()) ? "free" : (say("Waiting for the last Studio to finish closing..."), await waitForPort());
    if (port === "studio") { say("Studio is already running - opening it."); openBrowser(); setTimeout(() => process.exit(0), 800); }
    else if (port === "busy") fail(`Something else is using port ${PORT}. Close it (or restart the computer) and try again.`);
    else await start(server, dbFile);
  }
}

async function start(server, dbFile) {
  loadEnv(join(ROOT, "config.env"));

  // Forward slashes work for SQLite paths on Windows too (file:E:/studio/data/studio.db).
  const dbUrl = "file:" + dbFile.replace(/\\/g, "/");
  Object.assign(process.env, {
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1", // this computer only - never the network
    DATABASE_URL: dbUrl,
    NEXT_TELEMETRY_DISABLED: "1",
    // Marks this as the live app, so each logged session is backed up to
    // Documents/Studio Backups on this computer (lib/backup.ts).
    STUDIO_LIVE: "1",
  });

  say("Starting...");
  const started = Date.now();
  // Runs the Next.js server in this process (it reads PORT/HOSTNAME above).
  createRequire(import.meta.url)(server);

  // Wait one check at a time - overlapping checks could each see "ready" and
  // open several browser tabs.
  for (;;) {
    const h = await health();
    if (h?.app === "studio" && h.ok) {
      say(`Ready in ${((Date.now() - started) / 1000).toFixed(1)}s → ${URL_}`);
      say();
      say("Keep this window open while you use Studio.");
      say("When you're done: close this window, then eject the stick.");
      openBrowser();
      return;
    }
    if (h?.app === "studio" && !h.ok) {
      return fail(`Studio started but can't read the database:\n  ${h.error}\n  (${dbUrl})`);
    }
    if (Date.now() - started > 90_000) {
      return fail("Studio didn't start within 90 seconds. Any error from the server is shown above.");
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}
