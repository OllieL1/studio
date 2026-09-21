/** Light/dark resolution, the wrapping dark window, and the colour pairs. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cleanHour, fmtHour, inDarkWindow, isThemeMode, nextFlip, resolveTheme,
} from "../lib/theme";
import { cssColour, DARK_PALETTE, LIGHT_PALETTE, lightOf, tint } from "../lib/palette";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const at = (h: number, m = 0) => new Date(2026, 8, 21, h, m);

test("fixed modes ignore the clock", () => {
  assert.equal(resolveTheme("light", at(23)), "light");
  assert.equal(resolveTheme("dark", at(11)), "dark");
});

test("auto is dark from 21:00 and light from 07:00", () => {
  assert.equal(resolveTheme("auto", at(20, 59)), "light");
  assert.equal(resolveTheme("auto", at(21, 0)), "dark");
  assert.equal(resolveTheme("auto", at(23, 30)), "dark");
  assert.equal(resolveTheme("auto", at(0, 15)), "dark");
  assert.equal(resolveTheme("auto", at(6, 59)), "dark");
  assert.equal(resolveTheme("auto", at(7, 0)), "light");
  assert.equal(resolveTheme("auto", at(14)), "light");
});

test("a window inside one day doesn't wrap", () => {
  assert.equal(inDarkWindow(at(13), 12, 14), true);
  assert.equal(inDarkWindow(at(15), 12, 14), false);
  assert.equal(inDarkWindow(at(2), 12, 14), false);
});

test("an empty window is never dark", () => {
  assert.equal(inDarkWindow(at(9), 9, 9), false);
  assert.equal(nextFlip(at(9), 9, 9), null);
});

test("the next flip is the nearer boundary, always ahead", () => {
  assert.equal(nextFlip(at(20), 21, 7)!.getHours(), 21);
  assert.equal(nextFlip(at(22), 21, 7)!.getHours(), 7);
  assert.equal(nextFlip(at(3), 21, 7)!.getHours(), 7);
  assert.ok(nextFlip(at(21, 0), 21, 7)!.getTime() > at(21, 0).getTime());
});

test("hours from the database are clamped", () => {
  assert.equal(cleanHour(21, 7), 21);
  assert.equal(cleanHour(-1, 7), 7);
  assert.equal(cleanHour(24, 7), 7);
  assert.equal(cleanHour(NaN, 21), 21);
  assert.equal(fmtHour(7), "07:00");
});

test("only the three modes are accepted", () => {
  assert.ok(isThemeMode("auto") && isThemeMode("dark"));
  assert.ok(!isThemeMode("system") && !isThemeMode(undefined));
});

test("light mode never repaints a colour", () => {
  for (const c of LIGHT_PALETTE) assert.equal(tint(c, "light"), c);
});

test("every seeded colour has a dark counterpart", () => {
  const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
  const used = [...seed.matchAll(/colour:\s*"(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
  assert.ok(used.length >= 10, `expected the seeded palette, found ${used.length}`);
  for (const c of used) {
    assert.ok(LIGHT_PALETTE.map((x) => x.toUpperCase()).includes(c), `${c} has no dark counterpart`);
  }
});

test("tinting is idempotent, so it can be applied twice", () => {
  for (const c of LIGHT_PALETTE) {
    const once = tint(c, "dark");
    assert.equal(tint(once, "dark"), once, `${c} changed on a second pass`);
    assert.equal(lightOf(once), c);
  }
});

test("an unknown dark colour is lightened, a bright one is left alone", () => {
  assert.notEqual(tint("#101010", "dark"), "#101010");
  assert.equal(tint("#ffcc88", "dark"), "#ffcc88");
  assert.equal(tint("not a colour", "dark"), "not a colour");
});

test("the dark set is distinct from the light set", () => {
  assert.equal(new Set([...LIGHT_PALETTE, ...DARK_PALETTE]).size, 20);
});

test("every palette colour has a CSS variable, in both themes", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const dark = css.slice(css.indexOf('[data-theme="dark"]'));
  for (const [i, light] of LIGHT_PALETTE.entries()) {
    const name = `--c-${light.slice(1).toLowerCase()}`;
    assert.ok(css.includes(`${name}: ${light}`), `${name} missing its light value`);
    assert.ok(dark.includes(`${name}: ${DARK_PALETTE[i]}`), `${name} missing its dark value`);
  }
});

test("cssColour points at the variable, with the hex as a fallback", () => {
  assert.equal(cssColour("#8A4430"), "var(--c-8a4430, #8A4430)");
  // The dark counterpart resolves to the same variable, so it can't double up.
  assert.equal(cssColour("#9D4F43"), "var(--c-8a4430, #8A4430)");
  assert.equal(cssColour("#123456"), "#123456");
  assert.equal(cssColour(null), "");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
