/** Livio careers rules (lib/careers.ts). */
import assert from "node:assert/strict";
import { isStale, parseContact, quietDays, statusForType, statusesFor } from "../lib/careers";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const NOW = new Date(2026, 9, 23, 12, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const email = (over: Partial<Parameters<typeof isStale>[0]> = {}) => ({
  type: "COLD_EMAIL", status: "EMAIL_SENT", statusChangedAt: null, sentAt: daysAgo(15), createdAt: daysAgo(30), ...over,
});

test("each type offers its own statuses plus the shared ones, in pipeline order", () => {
  assert.deepEqual(statusesFor("COLD_EMAIL"), ["TODO", "EMAIL_SENT", "BACK_AND_FORTH", "WAITING", "INTERVIEW", "OFFERED", "REJECTED"]);
  assert.deepEqual(statusesFor("APPLICATION"), ["TODO", "APPLIED", "INTERVIEW", "OFFERED", "REJECTED"]);
});

test("changing type keeps a status that fits and maps one that doesn't", () => {
  assert.equal(statusForType("INTERVIEW", "APPLICATION"), "INTERVIEW");
  assert.equal(statusForType("TODO", "APPLICATION"), "TODO");
  assert.equal(statusForType("WAITING", "APPLICATION"), "APPLIED");
  assert.equal(statusForType("APPLIED", "COLD_EMAIL"), "EMAIL_SENT");
});

test("a cold email sent 15 days ago with no reply is stale", () => {
  assert.equal(quietDays(email(), NOW), 15);
  assert.ok(isStale(email(), NOW));
  assert.ok(isStale(email({ status: "WAITING" }), NOW));
});

test("13 days is not yet stale; 14 is", () => {
  assert.ok(!isStale(email({ sentAt: daysAgo(13) }), NOW));
  assert.ok(isStale(email({ sentAt: daysAgo(14) }), NOW));
});

test("a recent status change restarts the clock", () => {
  assert.ok(!isStale(email({ status: "WAITING", statusChangedAt: daysAgo(3) }), NOW));
});

test("only cold emails waiting on a reply go stale", () => {
  for (const status of ["BACK_AND_FORTH", "INTERVIEW", "OFFERED", "REJECTED", "TODO"]) {
    assert.ok(!isStale(email({ status }), NOW), status);
  }
  assert.ok(!isStale(email({ type: "APPLICATION", status: "APPLIED" }), NOW));
});

test("with no sent date the clock runs from when it was logged", () => {
  assert.equal(quietDays(email({ sentAt: null }), NOW), 30);
});

test("contacts split into name and email in either order", () => {
  assert.deepEqual(parseContact("Jane Doe jane@acme.com"), { contactName: "Jane Doe", contactEmail: "jane@acme.com" });
  assert.deepEqual(parseContact("<jane@acme.com> Jane"), { contactName: "Jane", contactEmail: "jane@acme.com" });
  assert.deepEqual(parseContact("Jane Doe"), { contactName: "Jane Doe", contactEmail: null });
  assert.deepEqual(parseContact("  "), { contactName: null, contactEmail: null });
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
