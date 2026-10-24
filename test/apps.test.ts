/** Switching between Studio and Livio (lib/apps.ts). */
import assert from "node:assert/strict";
import { appOf, counterpartPath, crossAppHref, switchHref } from "../lib/apps";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

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

test("the switch is always a path on the current host", () => {
  assert.equal(switchHref("/stats"), "/livio");
  assert.equal(switchHref("/settings"), "/livio/preferences");
  assert.equal(switchHref("/livio/careers"), "/?studio");
  assert.equal(switchHref("/livio/preferences"), "/settings");
});

test("Studio's home carries a marker so livio.localhost doesn't read it as Livio's", () => {
  assert.equal(crossAppHref("studio", "/"), "/?studio");
  assert.equal(crossAppHref("studio", "/stats"), "/stats");
  assert.equal(crossAppHref("livio", "/livio/todo"), "/livio/todo");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
