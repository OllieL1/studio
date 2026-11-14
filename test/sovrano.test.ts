/** Sovrano: what time is worth, what's owed, and what the export says. */
import assert from "node:assert/strict";
import {
  centsFor, fmtHours, fmtUSD, lastPlatform, parseRate, sessionCents, sovranoJson, sovranoTotals,
  type SovProject, type SovSession,
} from "../lib/sovrano";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

// Thursday 12 Nov 2026, mid-afternoon. The week starts Monday the 9th.
const NOW = new Date(2026, 10, 12, 15, 0);

let n = 0;
const s = (over: Partial<SovSession> = {}): SovSession => {
  const startedAt = over.startedAt ?? new Date(2026, 10, 12, 9, 0);
  return {
    id: `s${++n}`, name: "Batch", projectId: "a", platform: "SOVRANO",
    startedAt, endedAt: new Date(startedAt.getTime() + 3_600_000),
    minutes: 60, rawMinutes: 60, paidAt: null, paidCents: null, ...over,
  };
};
const projects: SovProject[] = [
  { id: "a", name: "Alpha", rateCents: 2400 },
  { id: "b", name: "Beta", rateCents: null },
  { id: "c", name: "Gamma", rateCents: 3000 },
];

test("value: minutes at the hourly rate, rounded to the cent", () => {
  assert.equal(centsFor(60, 2400), 2400);
  assert.equal(centsFor(25, 2400), 1000);
  assert.equal(centsFor(7, 2350), 274); // 274.17
});

test("value: no rate means no value yet - not $0", () => {
  assert.equal(sessionCents(s(), { rateCents: null }), null);
  assert.equal(sessionCents(s(), undefined), null);
});

test("value: once paid it's frozen - a new rate doesn't move it", () => {
  const paid = s({ paidAt: NOW, paidCents: 2400 });
  assert.equal(sessionCents(paid, { rateCents: 9900 }), 2400);
  assert.equal(sessionCents(paid, { rateCents: null }), 2400);
});

test("totals: unpaid hours and dollars, paid dollars, per project", () => {
  const t = sovranoTotals(
    [
      s({ minutes: 90 }),
      s({ minutes: 30, paidAt: NOW, paidCents: 1100 }),
      s({ projectId: "c", minutes: 120, platform: "DATAANNOTATION" }),
    ],
    projects,
    NOW,
  );
  assert.equal(t.minutes, 240);
  assert.equal(t.unpaidMinutes, 210);
  assert.equal(t.unpaidCents, 3600 + 6000);
  assert.equal(t.paidCents, 1100);
  assert.deepEqual(t.perPlatform, { SOVRANO: 120, DATAANNOTATION: 120 });
  const alpha = t.projects.find((p) => p.id === "a")!;
  assert.equal(alpha.unpaidMinutes, 90);
  assert.equal(alpha.unpaidCents, 3600);
  assert.equal(alpha.paidCents, 1100);
  assert.equal(alpha.sessions, 2);
});

test("totals: unpaid time on a project with no rate is counted apart, not as $0", () => {
  const t = sovranoTotals([s({ projectId: "b", minutes: 45 }), s({ minutes: 60 })], projects, NOW);
  assert.equal(t.unratedMinutes, 45);
  assert.equal(t.unpaidMinutes, 105);
  assert.equal(t.unpaidCents, 2400);
  assert.equal(t.projects.find((p) => p.id === "b")!.unpaidCents, null);
});

test("totals: this week from Monday, this month from the 1st", () => {
  const t = sovranoTotals(
    [
      s({ startedAt: new Date(2026, 10, 9, 0, 5), minutes: 10 }), // Monday - this week
      s({ startedAt: new Date(2026, 10, 8, 23, 50), minutes: 20 }), // Sunday - last week, this month
      s({ startedAt: new Date(2026, 9, 31, 22, 0), minutes: 40 }), // October
    ],
    projects,
    NOW,
  );
  assert.equal(t.weekMinutes, 10);
  assert.equal(t.monthMinutes, 30);
  assert.equal(t.minutes, 70);
});

test("totals: projects most recently worked first, unworked last by name", () => {
  const t = sovranoTotals(
    [s({ projectId: "c", startedAt: new Date(2026, 10, 10) }), s({ projectId: "a", startedAt: new Date(2026, 10, 11) })],
    projects,
    NOW,
  );
  assert.deepEqual(t.projects.map((p) => p.name), ["Alpha", "Gamma", "Beta"]);
});

test("lastPlatform: the platform the project was last worked under", () => {
  const list = [
    s({ projectId: "a", platform: "DATAANNOTATION", startedAt: new Date(2026, 10, 1) }),
    s({ projectId: "a", platform: "SOVRANO", startedAt: new Date(2026, 10, 3) }),
    s({ projectId: "c", platform: "DATAANNOTATION", startedAt: new Date(2026, 10, 5) }),
  ];
  assert.equal(lastPlatform(list, "a"), "SOVRANO");
  assert.equal(lastPlatform(list, "c"), "DATAANNOTATION");
  assert.equal(lastPlatform(list, "b"), null);
});

test("format: dollars with commas and two places; hours to a tenth", () => {
  assert.equal(fmtUSD(0), "$0.00");
  assert.equal(fmtUSD(5), "$0.05");
  assert.equal(fmtUSD(123456789), "$1,234,567.89");
  assert.equal(fmtHours(90), "1.5 h");
  assert.equal(fmtHours(120), "2 h");
  assert.equal(fmtHours(0), "0 h");
});

test("parseRate: the ways a rate gets typed", () => {
  assert.equal(parseRate("24"), 2400);
  assert.equal(parseRate("$24.50"), 2450);
  assert.equal(parseRate("24.5/h"), 2450);
  assert.equal(parseRate("1,000"), 100000);
  assert.equal(parseRate(""), null);
  assert.equal(parseRate("abc"), undefined);
  assert.equal(parseRate("24.555"), undefined);
});

test("json: sessions oldest first with project, value and paid state", () => {
  const j = sovranoJson(
    [
      s({ startedAt: new Date(2026, 10, 12, 10), minutes: 30 }),
      s({ startedAt: new Date(2026, 10, 11, 10), minutes: 60, paidAt: NOW, paidCents: 2000 }),
    ],
    projects,
    NOW,
  );
  assert.equal(j.currency, "USD");
  assert.equal(j.sessions.length, 2);
  assert.equal(j.sessions[0].valueUsd, 20);
  assert.equal(j.sessions[0].paid, true);
  assert.equal(j.sessions[1].valueUsd, 12);
  assert.equal(j.sessions[1].project, "Alpha");
  assert.equal(j.sessions[1].platform, "Sovrano");
  assert.deepEqual(j.totals, { sessions: 2, hours: 1.5, unpaidHours: 0.5, unpaidUsd: 12, paidUsd: 20, unratedUnpaidHours: 0 });
  // Only the projects these sessions touch.
  assert.deepEqual(j.projects.map((p) => p.name), ["Alpha"]);
  assert.doesNotThrow(() => JSON.stringify(j));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
