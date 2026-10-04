import { test } from "node:test";
import assert from "node:assert/strict";
import { isEntityId, isUuidv7, newId, shortCode, uuidv7, uuidv7Time } from "../src/ids.js";

test("uuidv7 has the right version, variant and timestamp", () => {
  const t = Date.UTC(2026, 10, 30, 7, 0, 0);
  const id = uuidv7(t, new Uint8Array(10).fill(0xff));
  assert.ok(isUuidv7(id), id);
  assert.equal(id[14], "7");
  assert.ok("89ab".includes(id[19]));
  assert.equal(uuidv7Time(id), t);
});

test("uuidv7 sorts by time across milliseconds", () => {
  const a = uuidv7(1_000_000_000_000);
  const b = uuidv7(1_000_000_000_001);
  assert.ok(a < b);
});

test("uuidv7 is unique in a burst", () => {
  const set = new Set();
  for (let i = 0; i < 20000; i++) set.add(uuidv7());
  assert.equal(set.size, 20000);
});

test("entity ids carry a known prefix", () => {
  const id = newId("ord");
  assert.ok(isEntityId(id, "ord"));
  assert.ok(!isEntityId(id, "pay"));
  assert.ok(!isEntityId("ord_123"));
  assert.throws(() => newId("xyz"), RangeError);
});

test("shortCode is 4+2 Crockford characters", () => {
  const code = shortCode(newId("ord"));
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$/);
});
