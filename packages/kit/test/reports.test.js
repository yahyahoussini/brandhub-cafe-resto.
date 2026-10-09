// @ts-check
/** Report rules beyond the acceptance day (prompt 03 review): credit notes, merges, discounts, banks, doses, clocks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDay, normalizeThresholds } from "../src/reports.js";
import { zonedToUtc } from "../src/timezone.js";
import { eventLog, newId } from "./helpers.js";

const DAY = "2026-11-30";
/** @param {number} h @param {number} [m] @param {number} [d] */
const at = (h, m = 0, d = 30) => zonedToUtc(2026, 11, d, h, m);
const TILL = newId("dev");
const STAFF = newId("stf");
const BOSS = newId("stf");
const item = (/** @type {number} */ unit, /** @type {number} */ qty = 1, doses = 0) => ({
  lineId: newId("lin"),
  productId: newId("prd"),
  name: { fr: "x", ar: "x" },
  unitCentimes: unit,
  qtyMilli: qty * 1000,
  vatBp: 1000,
  doses,
});

function day() {
  const log = eventLog({ [TILL]: "till" });
  let clock = at(8);
  /** @param {string} type @param {string} entity @param {any} data @param {Record<string, any>} [extra] */
  const e = (type, entity, data, extra = {}) => ({ ...log.emit({ device: TILL, staff: STAFF, type, entity, data, at: (clock += 60_000) }), ...extra });
  const bank = newId("bnk");
  e("bank.opened", bank, { kind: "till", holder: STAFF, floatCentimes: 10000 });
  return { log, e, bank, tick: (/** @type {number} */ ms) => (clock += ms) };
}

/**
 * @param {ReturnType<typeof day>} d @param {any[]} lines @param {{ pay?: [string, number, string?][], receiptNo?: string, refundOf?: any, discount?: any, mode?: string }} o
 */
function order(d, lines, o = {}) {
  const id = newId("ord");
  d.e("order.opened", id, { mode: o.mode ?? "counter", ...(o.refundOf ? { refundOf: o.refundOf, approvedBy: BOSS } : {}) });
  for (const l of lines) d.e("line.added", id, l);
  if (o.discount) d.e("discount.set", id, o.discount);
  for (const [tender, amount, bankId] of o.pay ?? []) d.e("payment.added", id, { paymentId: newId("pay"), tender, amountCentimes: amount, bankId: bankId ?? d.bank });
  if (o.receiptNo) d.e("order.closed", id, { receiptNo: o.receiptNo });
  return id;
}

test("the average ticket is revenue ÷ tickets, credit notes included in the revenue (docs/10 §1)", () => {
  const d = day();
  order(d, [item(10000)], { pay: [["cash", 10000]], receiptNo: "C1-000001" });
  order(d, [item(10000)], { pay: [["card_external", 10000]], receiptNo: "C1-000002" });
  order(d, [item(6000, -1)], { pay: [["cash", -6000]], receiptNo: "C1-000003", refundOf: { orderId: newId("ord"), receiptNo: "C1-000001", restock: false } });
  const r = buildDay(d.log.events, { businessDate: DAY });
  assert.equal(r.revenueCentimes, 14000);
  assert.equal(r.tickets.count, 2);
  assert.equal(r.creditNotes.count, 1);
  assert.equal(r.averageTicketCentimes, 7000);
});

test("a voided order is valued after its discount; a merge with a free correction is not a void", () => {
  const d = day();
  const v = newId("ord");
  d.e("order.opened", v, { mode: "table" });
  d.e("line.added", v, item(6000, 2));
  d.e("discount.set", v, { kind: "percent", value: 5000, reason: "offert", approvedBy: BOSS });
  d.e("order.voided", v, { reason: "erreur" });
  const src = newId("ord");
  const dst = newId("ord");
  const juice = item(1500);
  const coffee = item(1000);
  d.e("order.opened", src, { mode: "table" });
  d.e("line.added", src, juice);
  d.e("line.voided", src, { lineId: juice.lineId, reason: "erreur" }); // before sending: free
  d.e("line.added", src, coffee);
  d.e("lines.sent", src, { lineIds: [coffee.lineId] });
  d.e("order.opened", dst, { mode: "table" });
  d.e("lines.moved_out", src, { moveId: "m1", toOrderId: dst, lineIds: [coffee.lineId] });
  d.e("lines.moved_in", dst, { moveId: "m1", fromOrderId: src, lines: [{ ...coffee, sent: true, held: false, sentAt: 1, firedAt: 1 }] });
  d.e("order.voided", src, { reason: "merged" });
  d.e("payment.added", dst, { paymentId: newId("pay"), tender: "cash", amountCentimes: 1000, bankId: d.bank });
  d.e("order.closed", dst, { receiptNo: "C1-000001" });
  const r = buildDay(d.log.events, { businessDate: DAY });
  assert.deepEqual(r.voids.orders, { count: 1, totalCentimes: 6000, withoutNumber: 1, merged: 1 });
});

test("a bank's Z: tickets, revenue and VAT of the payments made into it; Kredi cash on its own line", () => {
  const d = day();
  const phoneBank = newId("bnk");
  d.e("bank.opened", phoneBank, { kind: "waiter", holder: STAFF, floatCentimes: 0 });
  order(d, [item(4000)], { pay: [["cash", 4000]], receiptNo: "C1-000001" });
  order(d, [item(2000), item(2000)], { pay: [["cash", 1000], ["cash", 3000, phoneBank]], receiptNo: "C1-000002" });
  d.e("bank.cash_in", d.bank, { amountCentimes: 500, reason: "monnaie" });
  d.e("bank.cash_out", d.bank, { amountCentimes: 2000, reason: "fournisseur", approvedBy: BOSS });
  const cus = newId("cus");
  d.e("kredi.repaid", cus, { amountCentimes: 4000, tender: "cash", bankId: d.bank });
  d.e("kredi.repaid", cus, { amountCentimes: -1000, tender: "cash", bankId: d.bank, approvedBy: BOSS });
  const r = buildDay(d.log.events, { businessDate: DAY });
  const till = /** @type {any} */ (r.banks.find((b) => b.id === d.bank));
  const phone = /** @type {any} */ (r.banks.find((b) => b.id === phoneBank));
  assert.equal(till.krediCashCentimes, 3000);
  assert.equal(till.salesCashCentimes, 5000);
  assert.equal(till.floatCentimes + till.salesCashCentimes + till.krediCashCentimes + till.cashInCentimes - till.cashOutCentimes, till.expectedCentimes);
  assert.equal(till.revenueCentimes + phone.revenueCentimes, r.revenueCentimes);
  assert.equal(phone.revenueCentimes, 3000);
  assert.equal(till.vatCentimes + phone.vatCentimes, r.vatCentimes);
  assert.deepEqual(till.tickets.series, { C1: { first: "C1-000001", last: "C1-000002", count: 2 } });
  assert.deepEqual(phone.tickets.series, { C1: { first: "C1-000002", last: "C1-000002", count: 1 } });
});

test("dose gap: every machine needs both readings, and a counter reset is never hidden", () => {
  const coffee = (/** @type {ReturnType<typeof day>} */ d) => order(d, [item(1000, 100, 1)], { pay: [["cash", 100000]], receiptNo: "C1-000001" });
  const reading = (/** @type {ReturnType<typeof day>} */ d, /** @type {string} */ m, /** @type {number} */ value, /** @type {string} */ kind) =>
    d.e("machine.reading", m, { reading: value, kind, businessDate: DAY });
  const m1 = newId("mch");
  const m2 = newId("mch");
  const a = day();
  coffee(a);
  reading(a, m1, 1000, "open");
  reading(a, m1, 1060, "close");
  reading(a, m2, 5000, "open");
  assert.equal(buildDay(a.log.events, { businessDate: DAY }).doses.reason, "missing_reading");
  const b = day();
  coffee(b);
  reading(b, m1, 100, "open");
  reading(b, m1, 10, "close");
  reading(b, m2, 5000, "open");
  reading(b, m2, 5200, "close");
  const r = buildDay(b.log.events, { businessDate: DAY }).doses;
  assert.equal(r.reason, "counter_reset");
  assert.equal(r.gapCentimes, null);
  const c = day();
  coffee(c);
  reading(c, m1, 1000, "open");
  reading(c, m1, 1060, "close");
  reading(c, m2, 5000, "open");
  reading(c, m2, 5041, "close");
  assert.equal(buildDay(c.log.events, { businessDate: DAY }).doses.gapDoses, 1);
});

test("an event flagged for a wrong device clock counts on the day the server received it (docs/04 §6)", () => {
  const d = day();
  const id = order(d, [item(1500)], { pay: [["cash", 1500]] });
  const closing = d.e("order.closed", id, { receiptNo: "C1-000001" });
  const events = d.log.events.map((e) => (e.id === closing.id ? { ...e, at: at(12, 0, 31) + 86_400_000, recvAt: at(12, 5), clockSkew: 1 } : e));
  assert.equal(buildDay(events, { businessDate: DAY }).revenueCentimes, 1500);
  assert.equal(buildDay(events, { businessDate: "2026-12-02" }).revenueCentimes, 0);
});

test("an order opened before the cut-off and closed after it is reported on its closing day", () => {
  const log = eventLog({ [TILL]: "till" });
  const bank = newId("bnk");
  const id = newId("ord");
  log.emit({ device: TILL, staff: STAFF, type: "bank.opened", entity: bank, data: { kind: "till", holder: STAFF, floatCentimes: 0 }, at: at(18, 0, 29) });
  log.emit({ device: TILL, staff: STAFF, type: "order.opened", entity: id, data: { mode: "counter" }, at: at(22, 0, 29) });
  log.emit({ device: TILL, staff: STAFF, type: "line.added", entity: id, data: item(1500), at: at(22, 1, 29) });
  log.emit({ device: TILL, staff: STAFF, type: "payment.added", entity: id, data: { paymentId: newId("pay"), tender: "cash", amountCentimes: 1500, bankId: bank }, at: at(8) });
  log.emit({ device: TILL, staff: STAFF, type: "order.closed", entity: id, data: { receiptNo: "C1-000001" }, at: at(8, 1) });
  assert.equal(buildDay(log.events, { businessDate: DAY }).revenueCentimes, 1500);
  assert.equal(buildDay(log.events, { businessDate: "2026-11-29" }).revenueCentimes, 0);
});

test("malformed thresholds keep their defaults", () => {
  assert.deepEqual(normalizeThresholds({ cashGapCentimes: /** @type {any} */ ("20 DH"), dose: /** @type {any} */ ({ minDoses: -1 }) }), {
    cashGapCentimes: 2000,
    dose: { minDoses: 5, relativeBp: 300 },
  });
  const d = day();
  d.e("bank.counted", d.bank, { countedCentimes: 9500 });
  const r = buildDay(d.log.events, { businessDate: DAY, thresholds: /** @type {any} */ ({ cashGapCentimes: "x" }) });
  assert.equal(r.banks[0].gapState, "warn");
});
