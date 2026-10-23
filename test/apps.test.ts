/** Switching between Studio and Livio (lib/apps.ts). */
import assert from "node:assert/strict";
import { appOf, counterpartPath, crossAppHref, switchHref } from "../lib/apps";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const plain = { protocol: "http:", hostname: "localhost", port: "3111" };
const studioAlias = { ...plain, hostname: "studio.localhost" };
const livioAlias = { ...plain, hostname: "livio.localhost" };

test("pages under /livio are Livio's, everything else Studio's", () => {
  assert.equal(appOf("/livio"), "livio");
  assert.equal(appOf("/livio/careers"), "livio");
  assert.equal(appOf("/"), "studio");
  assert.equal(appOf("/stats"), "studio");
  // A prefix match alone isn't enough.
  assert.equal(appOf("/livioish"), "studio");
});

test("paired pages swap for their counterpart", () => {
  assert.equal(counterpartPath("/"), "/livio");
  assert.equal(counterpartPath("/livio"), "/");
  assert.equal(counterpartPath("/settings"), "/livio/preferences");
  assert.equal(counterpartPath("/livio/preferences"), "/settings");
});

test("unpaired pages land on the other app's home", () => {
  assert.equal(counterpartPath("/calendar"), "/livio");
  assert.equal(counterpartPath("/livio/careers"), "/");
});

test("on plain localhost a path is enough", () => {
  assert.equal(switchHref("/stats", plain), "/livio");
  assert.equal(switchHref("/livio/careers", plain), "/");
});

const both = { studio: true, livio: true };
const studioOnly = { studio: true, livio: false };

test("Safari on studio.localhost with no hosts line for Livio stays on the same host", () => {
  // The bug: this used to send you to livio.localhost, which Safari can't find.
  assert.equal(switchHref("/stats", studioAlias, studioOnly), "/livio");
  assert.equal(switchHref("/settings", studioAlias, studioOnly), "/livio/preferences");
  // And if nothing's been checked yet, the safe answer is the same.
  assert.equal(switchHref("/stats", studioAlias), "/livio");
});

test("Livio's own name is used once it resolves", () => {
  assert.equal(switchHref("/stats", studioAlias, both), "http://livio.localhost:3111/");
  assert.equal(crossAppHref("livio", "/livio/todo", studioAlias, both), "http://livio.localhost:3111/livio/todo");
});

test("from livio.localhost, Studio needs its own host - its alias if it resolves, else localhost", () => {
  // `/` on livio.localhost is Livio's home, so a bare path can't reach Studio.
  assert.equal(switchHref("/livio/careers", livioAlias, both), "http://studio.localhost:3111/");
  assert.equal(crossAppHref("studio", "/stats", livioAlias, both), "http://studio.localhost:3111/stats");
  assert.equal(crossAppHref("studio", "/stats", livioAlias, { studio: false, livio: true }), "http://localhost:3111/stats");
  // Livio pages from livio.localhost are just paths.
  assert.equal(crossAppHref("livio", "/livio/todo", livioAlias, both), "/livio/todo");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
