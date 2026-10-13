/** The loading bar's rules: which requests and gestures count, and when it shows. */
import assert from "node:assert/strict";
import { createBusy, Intent, INTENT_WINDOW_MS, isActionKey, isTrackedRequest, type BusyView } from "../lib/busy";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

/** Timers that only move when told to, so timing rules can be tested exactly. */
class Clock {
  now = 0;
  private next = 1;
  private tasks = new Map<number, { at: number; fn: () => void }>();
  set = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.tasks.set(id, { at: this.now + ms, fn });
    return id;
  };
  clear = (id: unknown) => void this.tasks.delete(id as number);
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.tasks.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.now = due[1].at;
      this.tasks.delete(due[0]);
      due[1].fn();
    }
    this.now = end;
  }
}

function rig(extra: { reducedMotion?: () => boolean } = {}) {
  const clock = new Clock();
  const views: BusyView[] = [];
  const busy = createBusy({ onChange: (v) => views.push(v), timers: clock, ...extra });
  return { clock, views, busy, last: () => views[views.length - 1] };
}

/* ── Which requests count ─────────────────────────────────────────────────── */

test("a server action counts", () => {
  assert.equal(isTrackedRequest("/x", { headers: { "next-action": "abc123" } }), true);
});

test("a navigation or refresh counts, whatever the header's casing", () => {
  assert.equal(isTrackedRequest("/x", { headers: { rsc: "1", "next-router-state-tree": "[]" } }), true);
  assert.equal(isTrackedRequest("/x", { headers: { RSC: "1" } }), true);
});

test("headers given as a Headers object or as pairs are read too", () => {
  assert.equal(isTrackedRequest("/x", { headers: new Headers({ "Next-Action": "a" }) }), true);
  assert.equal(isTrackedRequest("/x", { headers: [["rsc", "1"]] }), true);
});

test("headers carried on a Request object are read too", () => {
  assert.equal(isTrackedRequest(new Request("http://localhost/x", { headers: { "next-action": "a" } })), true);
});

test("a prefetch never counts - links scrolling into view must stay silent", () => {
  for (const v of ["1", "2", "3"]) {
    assert.equal(isTrackedRequest("/x", { headers: { rsc: "1", "next-router-prefetch": v } }), false);
  }
  assert.equal(
    isTrackedRequest("/x", { headers: { rsc: "1", "next-router-segment-prefetch": "/_tree" } }),
    false,
  );
});

test("ordinary fetches don't count - polling widgets, search, rendering", () => {
  assert.equal(isTrackedRequest("/api/active", {}), false);
  assert.equal(isTrackedRequest("/api/render", { headers: { "content-type": "application/json" } }), false);
  assert.equal(isTrackedRequest("/api/search?q=x"), false);
});

/* ── Which gestures count ─────────────────────────────────────────────────── */

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods });

test("typing letters is never an action", () => {
  assert.equal(isActionKey(key("a"), { tag: "textarea", editable: true }), false);
  assert.equal(isActionKey(key("a"), { tag: "div" }), false);
});

test("Enter is an action, except where it only starts a new line", () => {
  assert.equal(isActionKey(key("Enter"), { tag: "button" }), true);
  assert.equal(isActionKey(key("Enter"), { tag: "input" }), true);
  assert.equal(isActionKey(key("Enter"), { tag: "a" }), true);
  assert.equal(isActionKey(key("Enter"), { tag: "textarea", editable: true }), false);
  assert.equal(isActionKey(key("Enter"), { tag: "div", editable: true }), false);
});

test("Space is an action only on something it activates", () => {
  assert.equal(isActionKey(key(" "), { tag: "button" }), true);
  assert.equal(isActionKey(key(" "), { tag: "div", role: "switch" }), true);
  assert.equal(isActionKey(key(" "), { tag: "textarea", editable: true }), false);
  assert.equal(isActionKey(key(" "), { tag: "input" }), false);
});

test("a shortcut chord is an action wherever the cursor is", () => {
  assert.equal(isActionKey(key("s", { metaKey: true }), { tag: "textarea", editable: true }), true);
  assert.equal(isActionKey(key("/", { ctrlKey: true }), { tag: "body" }), true);
});

test("a request counts only shortly after a gesture", () => {
  let t = 5000;
  const intent = new Intent(() => t);
  assert.equal(intent.recent(), false, "nothing yet");
  intent.note();
  t += INTENT_WINDOW_MS;
  assert.equal(intent.recent(), true);
  t += 1;
  assert.equal(intent.recent(), false, "autosave a second after the last click is not a click's doing");
});

/* ── When the bar shows ───────────────────────────────────────────────────── */

test("a quick request never shows the bar", () => {
  const { clock, views, busy } = rig();
  const done = busy.begin();
  clock.advance(100);
  done();
  clock.advance(2000);
  assert.deepEqual(views, []);
});

test("a slow request shows the bar, which creeps and never reaches the end by itself", () => {
  const { clock, views, busy, last } = rig();
  busy.begin();
  clock.advance(149);
  assert.equal(views.length, 0, "still waiting");
  clock.advance(1);
  assert.deepEqual(views[0], { visible: true, progress: 0.1, run: 1 });
  clock.advance(3000);
  assert.ok(last().progress > 0.5 && last().progress < 0.92, `progress ${last().progress}`);
  clock.advance(60_000 - 3150 - 1);
  assert.equal(last().visible, true, "still up, just under the give-up limit");
  assert.ok(last().progress < 0.92);
});

test("when the work ends the bar sweeps to full and fades", () => {
  const { clock, busy, last } = rig();
  const done = busy.begin();
  clock.advance(500);
  done();
  clock.advance(149);
  assert.equal(last().visible, true, "lingering a moment in case more follows");
  clock.advance(1);
  assert.deepEqual(last(), { visible: false, progress: 1, run: 1 });
});

test("an action and the refresh straight after it read as one bar", () => {
  const { clock, views, busy, last } = rig();
  const action = busy.begin();
  clock.advance(400);
  action();
  clock.advance(100); // inside the linger
  const refresh = busy.begin();
  clock.advance(500);
  refresh();
  assert.equal(views.filter((v) => !v.visible).length, 0, "never faded between them");
  assert.equal(new Set(views.map((v) => v.run)).size, 1, "one run throughout");
  clock.advance(150);
  assert.equal(last().visible, false);
});

test("ending a request twice can't end someone else's", () => {
  const { clock, busy, last } = rig();
  const a = busy.begin();
  busy.begin();
  clock.advance(200);
  a();
  a();
  clock.advance(1000);
  assert.equal(last().visible, true, "the second request is still running");
  assert.equal(busy.engaged(), true);
});

test("a bar that's up too long is cleared, even if a request never reports back", () => {
  const { clock, busy, last } = rig();
  busy.begin();
  clock.advance(60_000 + 200);
  assert.equal(last().visible, false);
  assert.equal(busy.engaged(), false);
});

test("reduced motion gets a still, full line rather than a creeping one", () => {
  const { clock, busy, views } = rig({ reducedMotion: () => true });
  busy.begin();
  clock.advance(5000);
  assert.equal(views.length, 1, "no creeping updates");
  assert.deepEqual(views[0], { visible: true, progress: 1, run: 1 });
});

test("each appearance is a new run, so a bar is never animated backwards", () => {
  const { clock, busy, last } = rig();
  let done = busy.begin();
  clock.advance(300);
  done();
  clock.advance(150 + 300); // linger, then the fade
  done = busy.begin();
  clock.advance(150);
  assert.equal(last().run, 2);
  assert.equal(last().visible, true);
  assert.equal(last().progress, 0.1);
});

test("a request that starts while the last bar is fading begins afresh", () => {
  const { clock, busy, last } = rig();
  let done = busy.begin();
  clock.advance(300);
  done();
  clock.advance(150); // finished, now fading
  assert.equal(last().visible, false);
  done = busy.begin();
  clock.advance(150);
  assert.deepEqual(last(), { visible: true, progress: 0.1, run: 2 });
});

test("work counts as engaged while it runs and during the moment after", () => {
  const { clock, busy } = rig();
  assert.equal(busy.engaged(), false);
  const done = busy.begin();
  assert.equal(busy.engaged(), true);
  clock.advance(300);
  done();
  assert.equal(busy.engaged(), true, "a follow-up request now is part of the same piece of work");
  clock.advance(150);
  assert.equal(busy.engaged(), false);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
