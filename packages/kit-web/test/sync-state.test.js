// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { OFFLINE_AFTER_MIN, syncState } from "../src/ui/sync-state.js";

const now = Date.UTC(2026, 10, 30, 9, 0);
const ago = (/** @type {number} */ min) => now - min * 60_000;

test("green when nothing waits (D15)", () => {
  assert.deepEqual(syncState({ pending: 0, lastContactAt: ago(0.5), now }), {
    state: "synced",
    pending: 0,
    minutes: 0,
  });
});

test("orange with the number of events waiting", () => {
  assert.equal(syncState({ pending: 3, lastContactAt: ago(2), now }).state, "pending");
});

test("red after 10 minutes without contact, even with nothing pending", () => {
  assert.equal(OFFLINE_AFTER_MIN, 10);
  assert.equal(syncState({ pending: 5, lastContactAt: ago(9.9), now }).state, "pending");
  assert.deepEqual(syncState({ pending: 0, lastContactAt: ago(10), now }), {
    state: "offline",
    pending: 0,
    minutes: 10,
  });
  assert.equal(syncState({ pending: 12, lastContactAt: ago(12), now }).minutes, 12);
});

test("never in contact counts as offline", () => {
  assert.equal(syncState({ pending: 0, lastContactAt: null, now }).state, "offline");
});

test("a clock behind the last contact never gives negative minutes", () => {
  assert.equal(syncState({ pending: 0, lastContactAt: now + 60_000, now }).minutes, 0);
});

test("pending must be a count", () => {
  assert.throws(() => syncState({ pending: -1, lastContactAt: now, now }), RangeError);
  assert.throws(() => syncState({ pending: 1.5, lastContactAt: now, now }), RangeError);
});
