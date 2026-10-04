import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abandonBlockRest,
  addBlock,
  formatInvoiceNo,
  formatReceiptNo,
  needsBlock,
  newSeries,
  newTillNumbering,
  remaining,
  reserveBlock,
  takeNumber,
} from "../src/receipts.js";

test("the server hands out consecutive, non-overlapping blocks; retries are idempotent", () => {
  let ledger = newSeries("C1");
  const a = reserveBlock(ledger, "blk_a", 100);
  ledger = a.ledger;
  const b = reserveBlock(ledger, "blk_b", 100);
  ledger = b.ledger;
  assert.deepEqual([a.block.start, a.block.end, b.block.start, b.block.end], [1, 100, 101, 200]);
  const retry = reserveBlock(ledger, "blk_a", 100);
  assert.equal(retry.ledger, ledger);
  assert.equal(retry.block.start, 1);
});

test("a till consumes its numbers without gaps across blocks", () => {
  let ledger = newSeries("C2");
  let till = newTillNumbering("C2");
  for (const id of ["blk_1", "blk_2"]) {
    const r = reserveBlock(ledger, id, 10);
    ledger = r.ledger;
    till = addBlock(till, r.block);
  }
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const t = takeNumber(till);
    seen.push(t.number);
    till = t.numbering;
  }
  assert.deepEqual(seen, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(remaining(till), 0);
  assert.throws(() => takeNumber(till), RangeError);
});

test("the till asks for a block before it runs out", () => {
  let till = newTillNumbering("C1");
  till = addBlock(till, { blockId: "blk_1", start: 1, end: 200, prefix: "C1" });
  assert.equal(needsBlock(till, 150), false);
  for (let i = 0; i < 60; i++) till = takeNumber(till).numbering;
  assert.equal(needsBlock(till, 150), true);
});

test("receipt and invoice formats", () => {
  assert.equal(formatReceiptNo("C1", 123), "C1-000123");
  assert.equal(formatInvoiceNo(2027, 7), "F-2027-000007");
  assert.throws(() => newSeries("c1"), RangeError);
});

test("after a reset, the rest of the block is declared abandoned", () => {
  let ledger = newSeries("C1");
  ledger = reserveBlock(ledger, "blk_1", 500).ledger;
  ledger = abandonBlockRest(ledger, "blk_1", 137);
  assert.equal(ledger.blocks[0].abandonedFrom, 138);
  const next = reserveBlock(ledger, "blk_2", 500);
  assert.equal(next.block.start, 501);
});

test("blocks from another series or overlapping are refused", () => {
  const till = addBlock(newTillNumbering("C1"), { blockId: "blk_1", start: 1, end: 100, prefix: "C1" });
  assert.throws(() => addBlock(till, { blockId: "blk_x", start: 50, end: 150, prefix: "C1" }), RangeError);
  assert.throws(() => addBlock(till, { blockId: "blk_y", start: 101, end: 150, prefix: "C9" }), RangeError);
});
