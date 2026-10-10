// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocate,
  changeDue,
  discountAmount,
  divRound,
  formatAmount,
  lineTotal,
  parseAmount,
  splitEvenly,
  vatIncluded,
} from "../src/money.js";

test("divRound rounds half away from zero", () => {
  assert.equal(divRound(5, 2), 3);
  assert.equal(divRound(-5, 2), -3);
  assert.equal(divRound(4, 3), 1);
  assert.equal(divRound(-4, 3), -1);
  assert.equal(divRound(0, 7), 0);
  assert.throws(() => divRound(1, 0), RangeError);
});

test("parseAmount reads what staff type", () => {
  assert.equal(parseAmount("12"), 1200);
  assert.equal(parseAmount("12,5"), 1250);
  assert.equal(parseAmount("12.50"), 1250);
  assert.equal(parseAmount("1 234,50 DH"), 123450);
  assert.equal(parseAmount("1 234,50"), 123450);
  assert.equal(parseAmount("15 درهم"), 1500);
  assert.equal(parseAmount("-3,20"), -320);
  assert.equal(parseAmount(8.5), 850);
  assert.throws(() => parseAmount("12,345"), RangeError);
  assert.throws(() => parseAmount("abc"), RangeError);
  assert.throws(() => parseAmount(12.345), RangeError);
});

test("formatAmount writes French and Arabic amounts with western digits", () => {
  assert.equal(formatAmount(123450), "1 234,50 DH");
  assert.equal(formatAmount(850, "ar"), "8,50 درهم");
  assert.equal(formatAmount(-320), "−3,20 DH");
  assert.equal(formatAmount(0), "0,00 DH");
});

test("vatIncluded at 10 % on a 15 DH coffee", () => {
  // 1500 TTC at 10 %: net = round(1500 × 10000 / 11000) = 1364, VAT = 136
  assert.equal(vatIncluded(1500, 1000), 136);
  assert.equal(vatIncluded(1500, 0), 0);
  assert.equal(vatIncluded(-1500, 1000), -136);
  assert.throws(() => vatIncluded(1500, 10001), RangeError);
});

test("property: VAT + net always equals the TTC total, VAT within one centime of exact", () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 10000; i++) {
    const total = Math.floor(rnd() * 2_000_000) - 100_000;
    const rate = [0, 700, 1000, 1400, 2000][Math.floor(rnd() * 5)];
    const vat = vatIncluded(total, rate);
    const net = total - vat;
    assert.equal(net + vat, total);
    const exact = (total * rate) / (10000 + rate);
    assert.ok(Math.abs(vat - exact) <= 0.5 + 1e-9, `total ${total} rate ${rate}`);
  }
});

test("allocate keeps the sum exact and is proportional", () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(1000, [1500, 800, 200]), [600, 320, 80]);
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(allocate(5, [0, 0]), [3, 2]);
  assert.deepEqual(allocate(7, [0, 3, 0, 1]), [0, 5, 0, 2]);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 2000; i++) {
    const n = 1 + Math.floor(rnd() * 8);
    const weights = Array.from({ length: n }, () => Math.floor(rnd() * 10000));
    const total = Math.floor(rnd() * 100000);
    const parts = allocate(total, weights);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
    parts.forEach((p) => assert.ok(p >= 0));
  }
});

test("splitEvenly for 'split the bill in 3'", () => {
  assert.deepEqual(splitEvenly(10000, 3), [3334, 3333, 3333]);
  assert.throws(() => splitEvenly(100, 0), RangeError);
});

test("discountAmount caps at the base", () => {
  assert.equal(discountAmount(5000, { kind: "percent", value: 1000 }), 500);
  assert.equal(discountAmount(5000, { kind: "amount", value: 7000 }), 5000);
  assert.equal(discountAmount(0, { kind: "amount", value: 100 }), 0);
  assert.throws(() => discountAmount(5000, { kind: "percent", value: 12000 }), RangeError);
});

test("lineTotal with quantities in thousandths", () => {
  assert.equal(lineTotal(1500, 1000), 1500);
  assert.equal(lineTotal(1500, 3000), 4500);
  assert.equal(lineTotal(12000, 250), 3000); // 250 g at 120 DH/kg
  assert.equal(lineTotal(999, 333), 333); // 3.32667 → 333
  assert.equal(lineTotal(1500, -1000), -1500);
  assert.throws(() => lineTotal(1500, 0), RangeError);
});

test("changeDue", () => {
  assert.equal(changeDue(8750, 10000), 1250);
  assert.throws(() => changeDue(8750, 5000), RangeError);
});
