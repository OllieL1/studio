/** The CV's master + versions model (lib/cv/model.ts). */
import assert from "node:assert/strict";
import { SAMPLE_CV } from "./fixtures/cv";
import {
  addNode, countOverrides, editText, importVersion, inherit, isOverridden, move, NO_OVERRIDES, removeNode, resolveCv,
  setOn, setStyle, visible, withIds, type CvDoc, type State,
} from "../lib/cv/model";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

let n = 0;
const ids = () => `id${++n}`;
const master = (): CvDoc => withIds(SAMPLE_CV, ids);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const experience = (d: CvDoc) => d.sections.find((s) => s.title === "Experience") as Extract<CvDoc["sections"][number], { type: "entries" }>;

test("ids are given to every section, item, bullet and contact line", () => {
  const m = master();
  const all: { id: string }[] = [
    ...m.contact, ...m.sections,
    ...m.sections.flatMap((s): { id: string }[] => (s.type === "text" ? [] : s.items)),
    ...experience(m).items.flatMap((e) => e.bullets),
  ];
  assert.ok(all.every((x) => typeof x.id === "string"));
  assert.equal(new Set(all.map((x) => x.id)).size, all.length);
});

test("with no overrides a version is the master", () => {
  const m = master();
  assert.deepEqual(resolveCv(m, NO_OVERRIDES), m);
});

test("a version's reworded bullet doesn't touch the master; a master typo fix reaches the version", () => {
  const m = master();
  const jpmc = experience(m).items[0];
  let s: State = { master: m, overrides: clone(NO_OVERRIDES) };
  s = editText(s, jpmc.bullets[0].id, "t", "Tailored for Stripe");
  assert.equal(experience(resolveCv(s.master, s.overrides!)).items[0].bullets[0].t, "Tailored for Stripe");
  assert.equal(experience(s.master).items[0].bullets[0].t, jpmc.bullets[0].t);

  // Now fix a typo in the master's second bullet: the version sees it.
  const fixed = editText({ master: s.master, overrides: null }, jpmc.bullets[1].id, "t", "Fixed typo");
  assert.equal(experience(resolveCv(fixed.master, s.overrides!)).items[0].bullets[1].t, "Fixed typo");
  // ...but not on the bullet the version reworded.
  assert.equal(experience(resolveCv(fixed.master, s.overrides!)).items[0].bullets[0].t, "Tailored for Stripe");
});

test("an override that comes back round to the master's value is dropped", () => {
  const m = master();
  let s: State = { master: m, overrides: clone(NO_OVERRIDES) };
  s = editText(s, "cv", "headline", "Backend Engineer");
  assert.ok(isOverridden(s.overrides, "cv", "headline"));
  s = editText(s, "cv", "headline", m.headline);
  assert.equal(countOverrides(s.overrides!), 0);
  s = setOn(s, m.sections[0].id, false);
  s = setOn(s, m.sections[0].id, true);
  assert.equal(countOverrides(s.overrides!), 0);
  s = setStyle(s, { accent: "#635bff" });
  s = setStyle(s, { accent: m.accent });
  assert.equal(countOverrides(s.overrides!), 0);
});

test("reordering in a version stores an order; reordering back drops it", () => {
  const m = master();
  let s: State = { master: m, overrides: clone(NO_OVERRIDES) };
  const second = m.sections[1].id;
  s = move(s, second, -1);
  assert.equal(resolveCv(s.master, s.overrides!).sections[0].id, second);
  assert.equal(s.master.sections[1].id, second, "master untouched");
  s = move(s, second, 1);
  assert.deepEqual(s.overrides!.order, {});
});

test("something added in a version is on there and off everywhere else", () => {
  const m = master();
  const exp = experience(m);
  let s: State = { master: m, overrides: clone(NO_OVERRIDES) };
  s = addNode(s, exp.items[0].id, { id: "new-bullet", t: "Only for this application" });
  const here = experience(resolveCv(s.master, s.overrides!)).items[0].bullets.at(-1)!;
  assert.equal(here.id, "new-bullet");
  assert.notEqual(here.on, false);
  assert.equal(experience(s.master).items[0].bullets.at(-1)!.on, false);
  assert.equal(experience(resolveCv(s.master, NO_OVERRIDES)).items[0].bullets.at(-1)!.on, false);
});

test("removing in a version only hides; removing in the master deletes", () => {
  const m = master();
  const id = m.sections[0].id;
  const v = removeNode({ master: m, overrides: clone(NO_OVERRIDES) }, id);
  assert.equal(v.master.sections.length, m.sections.length);
  assert.equal(resolveCv(v.master, v.overrides!).sections[0].on, false);
  const gone = removeNode({ master: m, overrides: null }, id);
  assert.equal(gone.master.sections.length, m.sections.length - 1);
});

test("inherit puts the master's words back", () => {
  const m = master();
  let s: State = { master: m, overrides: clone(NO_OVERRIDES) };
  s = editText(s, m.contact[0].id, "text", "other@example.com");
  s = inherit(s, m.contact[0].id, "text");
  assert.equal(resolveCv(s.master, s.overrides!).contact[0].text, m.contact[0].text);
});

test("an imported old version renders exactly as it was exported", () => {
  const m = master();
  // A tailored copy, as the old builder would have saved it: no ids, a
  // bullet reworded, one hidden, one added, sections reordered, a new
  // headline and accent, and a whole new section.
  const old = clone(SAMPLE_CV) as typeof SAMPLE_CV & { sections: Record<string, unknown>[] };
  old.headline = "Backend Engineer";
  old.accent = "#635bff";
  const exp = old.sections.find((s) => s.title === "Experience") as { items: { bullets: { t: string; on?: boolean }[] }[] };
  exp.items[0].bullets[0].t = "Reworded for Stripe";
  exp.items[0].bullets[1].on = false;
  exp.items[0].bullets.push({ t: "A bullet the master never had" });
  [old.sections[2], old.sections[3]] = [old.sections[3], old.sections[2]];
  old.sections.push({ type: "list", title: "Talks", cols: 1, items: [{ title: "Payments at scale", text: "Stripe Sessions" }] });

  const state = importVersion(m, old, ids);
  const shown = resolveCv(state.master, state.overrides!);
  assert.deepEqual(visible(shown), visible(withIds(old, ids)));

  // The master still reads as it did - nothing it gained shows there.
  assert.deepEqual(visible(resolveCv(state.master, NO_OVERRIDES)), visible(m));
});

test("importing the master unchanged needs no overrides", () => {
  const m = master();
  const state = importVersion(m, clone(SAMPLE_CV), ids);
  assert.equal(countOverrides(state.overrides!), 0);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message.split("\n").slice(0, 12).join("\n    ")}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
