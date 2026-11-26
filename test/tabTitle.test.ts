/** Purpose: pins which timer gets the tab title when both want it. */
import assert from "node:assert/strict";
import { TITLE_PRIORITY, winningTitle } from "../lib/tabTitle";

const paused = { title: "0:20:00 · Paused", priority: TITLE_PRIORITY.study };
const working = { title: "0:05:00 · Working", priority: TITLE_PRIORITY.work };

assert.equal(winningTitle([]), null);
assert.equal(winningTitle([paused]), paused.title);
assert.equal(winningTitle([paused, working]), working.title);
assert.equal(winningTitle([working, paused]), working.title);

console.log("tab title: 4 checks passed");
