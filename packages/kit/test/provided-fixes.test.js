// @ts-check
/**
 * Bugs found in the provided kit (docs/STATUS.md, prompt 00 findings 1, 2, 8 and 9), each fixed in prompt 03 after
 * this failing test (prompt 03: "if a provided function has a bug, fix it with a failing test first and say so").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addBlock, newTillNumbering, takeNumber } from "../src/receipts.js";
import { businessDate, zonedToUtc } from "../src/timezone.js";
import { OrderRuleError, applyOrderEvent } from "../src/order.js";
import { BankRuleError, applyBankEvent } from "../src/bank.js";
import { GENESIS, chainHash, verifyChain } from "../src/journal.js";

test("receipts: a block that does not follow the used one starts at its own first number (docs/04 §10 scenario 8)", () => {
  let t = newTillNumbering("C1");
  t = addBlock(t, { blockId: "blk_1", start: 1, end: 2, prefix: "C1" });
  t = takeNumber(t).numbering;
  t = takeNumber(t).numbering;
  t = addBlock(t, { blockId: "blk_2", start: 1001, end: 1500, prefix: "C1" });
  const r = takeNumber(t);
  assert.equal(r.receiptNo, "C1-001001");
  assert.equal(takeNumber(r.numbering).number, 1002);
});

test("receipts: a block received again after it was used up never hands out its numbers twice", () => {
  let t = newTillNumbering("C1");
  t = addBlock(t, { blockId: "blk_1", start: 1, end: 3, prefix: "C1" });
  for (let i = 0; i < 3; i++) t = takeNumber(t).numbering;
  t = addBlock(t, { blockId: "blk_1", start: 1, end: 3, prefix: "C1" });
  assert.throws(() => takeNumber(t), /no receipt number left/);
  t = addBlock(t, { blockId: "blk_2", start: 4, end: 6, prefix: "C1" });
  assert.equal(takeNumber(t).receiptNo, "C1-000004", "a following block continues");
});

test("receipts: with no number left the till says so instead of crashing", () => {
  let t = newTillNumbering("C1");
  t = addBlock(t, { blockId: "blk_1", start: 1, end: 1, prefix: "C1" });
  t = takeNumber(t).numbering;
  assert.throws(() => takeNumber(t), /no receipt number left/);
});

test("timezone: the night after the end of Ramadan stays on one business day (D26)", () => {
  // Morocco goes back to UTC+1 at 02:00 on Sun 14 Mar 2027 (docs/research/facts-2026-09.md).
  for (const [h, m] of [[0, 10], [0, 30], [1, 10], [4, 59]]) {
    assert.equal(businessDate(zonedToUtc(2027, 3, 15, h, m)), "2027-03-14", `15 Mar ${h}:${m}`);
  }
  assert.equal(businessDate(zonedToUtc(2027, 3, 15, 5, 0)), "2027-03-15");
  // and the night Ramadan starts
  assert.equal(businessDate(zonedToUtc(2027, 2, 8, 0, 30)), "2027-02-07");
});

test("timezone: the cut-off can be HH:MM, as the setting hours.businessDayCutoff is (docs/03 §8)", () => {
  const t = zonedToUtc(2026, 12, 1, 5, 30);
  assert.equal(businessDate(t, { cutoff: "06:00" }), "2026-11-30");
  assert.equal(businessDate(t, { cutoff: "05:15" }), "2026-12-01");
  assert.equal(businessDate(t, { cutoffHour: 6 }), "2026-11-30");
});

const base = { device: "dev_a", staff: "stf_a", at: 1_000 };
const opened = { ...base, id: "e1", type: "order.opened", entity: "ord_x", seq: 1, data: { mode: "counter" } };

test("order: malformed amounts and rates are coded E_BAD_DATA (docs/03 §9)", () => {
  const s = applyOrderEvent(null, opened);
  const line = { lineId: "lin_1", productId: "prd_1", name: { fr: "Café", ar: "قهوة" }, unitCentimes: 1000, qtyMilli: 1000, vatBp: 1000 };
  for (const bad of [{ unitCentimes: 12.5 }, { vatBp: 12000 }]) {
    assert.throws(
      () => applyOrderEvent(s, { ...base, id: "e2", type: "line.added", entity: "ord_x", seq: 2, data: { ...line, ...bad } }),
      (e) => e instanceof OrderRuleError && e.code === "E_BAD_DATA",
    );
  }
  const s2 = applyOrderEvent(s, { ...base, id: "e2", type: "line.added", entity: "ord_x", seq: 2, data: line });
  assert.throws(
    () => applyOrderEvent(s2, { ...base, id: "e3", type: "discount.set", entity: "ord_x", seq: 3, data: { kind: "percent", value: 20000 } }),
    (e) => e instanceof OrderRuleError && e.code === "E_BAD_DATA",
  );
  assert.throws(
    () => applyOrderEvent(s2, { ...base, id: "e3", type: "payment.added", entity: "ord_x", seq: 3, data: { paymentId: "pay_1", tender: "cash", bankId: "bnk_1" } }),
    (e) => e instanceof OrderRuleError && e.code === "E_BAD_DATA",
  );
});

test("order: a programming error (no state, stale state) is not disguised as a refused event", () => {
  assert.throws(() => applyOrderEvent(/** @type {any} */ ({ id: "ord_x" }), { ...opened, id: "e2", type: "order.note_set", seq: 2, data: {} }), (e) => !(e instanceof OrderRuleError));
});

test("order: an amount too large for exact arithmetic is E_BAD_DATA", () => {
  const s = applyOrderEvent(null, opened);
  const line = { lineId: "lin_1", productId: "prd_1", name: { fr: "x", ar: "x" }, unitCentimes: 9e15, qtyMilli: 1_000_000, vatBp: 1000 };
  assert.throws(
    () => applyOrderEvent(s, { ...base, id: "e2", type: "line.added", entity: "ord_x", seq: 2, data: line }),
    (e) => e instanceof OrderRuleError && e.code === "E_BAD_DATA",
  );
});

test("bank: a missing float is coded E_BAD_DATA (docs/03 §9)", () => {
  assert.throws(
    () => applyBankEvent(null, { ...base, id: "b1", type: "bank.opened", entity: "bnk_x", seq: 1, data: { kind: "till", holder: "stf_a" } }),
    (e) => e instanceof BankRuleError && e.code === "E_BAD_DATA",
  );
});

test("journal: relayedBy, clockSkew and v are covered by the hash (docs/03 §4, §6)", async () => {
  const ev = { id: "e1", type: "line.added", entity: "ord_1", seq: 1, device: "dev_1", staff: "stf_1", at: 1, data: {}, v: 1, pos: 1, recvAt: 2, relayedBy: "dev_st", clockSkew: 0 };
  const hash = await chainHash(GENESIS, ev);
  const stored = [{ ...ev, prevHash: GENESIS, hash }];
  assert.equal((await verifyChain(stored)).ok, true);
  // a row read back from the store (relayed_by NULL, clock_skew 0) verifies against an event hashed without them
  const plain = { ...ev, relayedBy: undefined, clockSkew: undefined };
  const h2 = await chainHash(GENESIS, plain);
  assert.equal((await verifyChain([{ ...plain, relayedBy: null, clockSkew: 0, prevHash: GENESIS, hash: h2 }])).ok, true);
  for (const [k, v] of /** @type {const} */ ([["relayedBy", "dev_other"], ["clockSkew", 1], ["v", 2]])) {
    assert.deepEqual(await verifyChain([{ ...stored[0], [k]: v }]), { ok: false, brokenAtPos: 1, reason: "hash_mismatch" }, k);
  }
});
