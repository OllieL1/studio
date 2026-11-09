/** Pushcut links: which are accepted, and how a saved one is hidden. */
import assert from "node:assert/strict";
import { isPushcutUrl, maskPushcutUrl } from "../lib/pushcutUrl";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const exec = "https://api.pushcut.io/SECRET123/execute?shortcut=Studio%20Session%20Started";

test("accepts an execute link", () => assert.equal(isPushcutUrl(exec), true));
test("accepts a notification link", () => assert.equal(isPushcutUrl("https://api.pushcut.io/SECRET123/notifications/Studio%20start"), true));
test("ignores surrounding spaces", () => assert.equal(isPushcutUrl(`  ${exec}\n`), true));
test("rejects plain http", () => assert.equal(isPushcutUrl(exec.replace("https", "http")), false));
test("rejects another host", () => assert.equal(isPushcutUrl("https://evil.example/SECRET123/execute?shortcut=x"), false));
test("rejects a look-alike host", () => assert.equal(isPushcutUrl("https://api.pushcut.io.evil.example/SECRET123/execute"), false));
test("rejects credentials in the link", () => assert.equal(isPushcutUrl("https://u:p@api.pushcut.io/SECRET123/execute"), false));
test("rejects other Pushcut paths", () => assert.equal(isPushcutUrl("https://api.pushcut.io/v1/devices"), false));
test("rejects junk", () => {
  assert.equal(isPushcutUrl(""), false);
  assert.equal(isPushcutUrl("not a url"), false);
});

test("masking hides the secret and keeps the rest", () => {
  const m = maskPushcutUrl(exec)!;
  assert.ok(!m.includes("SECRET123"));
  assert.ok(m.includes("/execute?shortcut=Studio%20Session%20Started"));
});
test("masking nothing gives nothing", () => {
  assert.equal(maskPushcutUrl(null), null);
  assert.equal(maskPushcutUrl(""), null);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
