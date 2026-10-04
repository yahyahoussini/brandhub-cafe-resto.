import { test } from "node:test";
import assert from "node:assert/strict";
import { chainHash, GENESIS, verifyChain } from "../src/journal.js";
import { canonicalJson } from "../src/crypto.js";

async function chain(n) {
  const out = [];
  let prev = GENESIS;
  for (let i = 1; i <= n; i++) {
    const ev = { id: `e${i}`, type: "line.added", entity: "ord_1", seq: i, device: "dev_1", staff: "stf_1", at: 1000 + i, data: { qtyMilli: 1000, unitCentimes: 1000 + i }, pos: i, recvAt: 2000 + i };
    const hash = await chainHash(prev, ev);
    out.push({ ...ev, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

test("canonical JSON is stable whatever the key order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}');
});

test("an intact chain verifies", async () => {
  const events = await chain(20);
  const r = await verifyChain(events);
  assert.equal(r.ok, true);
});

test("changing one amount breaks the chain at that event", async () => {
  const events = await chain(20);
  events[9] = { ...events[9], data: { ...events[9].data, unitCentimes: 1 } };
  assert.deepEqual(await verifyChain(events), { ok: false, brokenAtPos: 10, reason: "hash_mismatch" });
});

test("removing an event is detected", async () => {
  const events = await chain(5);
  events.splice(2, 1);
  const r = await verifyChain(events);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "gap_in_positions");
});
