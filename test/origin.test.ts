/** The port has to be the same in every place that hardcodes it. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PORT, HOST_ALIAS, GOOGLE_REDIRECT_URI, SPOTIFY_REDIRECT_URI } from "../lib/origin";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

test("the launcher's port matches lib/origin", () => {
  const src = readFileSync("scripts/usb/launcher.mjs", "utf8");
  const port = /^const PORT = (\d+);/m.exec(src);
  assert.ok(port, "couldn't find PORT in the launcher");
  assert.equal(Number(port[1]), PORT, "launcher.mjs and lib/origin.ts disagree about the port");

  const alias = /^const HOST_ALIAS = "([^"]+)";/m.exec(src);
  assert.ok(alias, "couldn't find HOST_ALIAS in the launcher");
  assert.equal(alias[1], HOST_ALIAS);
});

test("the npm scripts serve on that port too", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const key of ["dev", "start"]) {
    assert.match(pkg.scripts[key], new RegExp(`-p ${PORT}\\b`), `npm run ${key} doesn't use port ${PORT}`);
  }
});

test("Spotify's redirect is a loopback IP, Google's may be localhost", () => {
  // Spotify rejects `localhost` outright; Google accepts it.
  assert.match(SPOTIFY_REDIRECT_URI, new RegExp(`^http://127\\.0\\.0\\.1:${PORT}/`));
  assert.match(GOOGLE_REDIRECT_URI, new RegExp(`^http://localhost:${PORT}/`));
});

test("the friendly name keeps its .localhost suffix", () => {
  // Safari upgrades a bare hostname to HTTPS even from an explicit http:// URL
  // and then can't connect; it speaks plain HTTP to the .localhost domain.
  assert.match(HOST_ALIAS, /\.localhost$/, "a bare alias breaks in Safari");
});

test("nothing still points at the old port", () => {
  for (const f of ["lib/google.ts", "lib/spotify.ts", "scripts/usb/launcher.mjs", "scripts/usb/README.txt"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /:3000\b/, `${f} still mentions port 3000`);
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
