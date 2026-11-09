/** The Live / Markdown switch: ⌥M everywhere, ⌘⇧M / Ctrl-Shift-M where the browser lets it through. */
import assert from "node:assert/strict";
import { isModeToggle } from "../lib/editor/shortcuts";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const k = (code: string, o: { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean } = {}) =>
  ({ code, altKey: !!o.alt, ctrlKey: !!o.ctrl, metaKey: !!o.meta, shiftKey: !!o.shift });

test("⌥M and ⌘⇧M / Ctrl-Shift-M switch modes", () => {
  assert.ok(isModeToggle(k("KeyM", { alt: true })));
  assert.ok(isModeToggle(k("KeyM", { meta: true, shift: true })));
  assert.ok(isModeToggle(k("KeyM", { ctrl: true, shift: true })));
});

test("plain M, ⌘M, ⌥⇧M and other keys don't", () => {
  for (const e of [k("KeyM"), k("KeyM", { shift: true }), k("KeyM", { meta: true }), k("KeyM", { alt: true, shift: true }), k("KeyM", { alt: true, ctrl: true }), k("KeyS", { alt: true })])
    assert.equal(isModeToggle(e), false, JSON.stringify(e));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
