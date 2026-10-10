// @ts-check
/**
 * The kit additions of prompt 04: per-line amounts (the cloud's sales_lines rows add up to the order's totals) and the
 * two cross-aggregate rules of docs/04 §2 that every store runs the same way (E_REFUND_EXCEEDS, E_MOVE_PAIR).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OrderRuleError, assertMovePair, assertRefundWithin, computeTotals, foldOrder, lineAmounts } from "../src/order.js";
import { uuidv7 } from "../src/ids.js";
import { seeded } from "./helpers.js";

const TILL = "dev_till";
const T0 = Date.UTC(2026, 10, 30, 8, 0, 0);

/** @param {string} orderId @param {string} [device] */
function script(orderId, device = TILL) {
  let seq = 0;
  let at = T0;
  /** @type {any[]} */
  const events = [];
  /** @param {string} type @param {Record<string, any>} [data] @param {{ device?: string }} [o] */
  const add = (type, data = {}, o = {}) => {
    seq += 1;
    at += 1000;
    const ev = { id: uuidv7(at), type, entity: orderId, seq, device: o.device ?? device, staff: "stf_ali", at, data };
    events.push(ev);
    return ev;
  };
  return { add, events };
}

/** @param {string} lineId @param {Record<string, any>} [o] */
const line = (lineId, o = {}) => ({
  lineId,
  productId: "prd_noir",
  name: { fr: "Café noir", ar: "قهوة كحلة" },
  unitCentimes: 1000,
  qtyMilli: 1000,
  vatBp: 1000,
  doses: 1,
  ...o,
});

/** @param {() => unknown} fn @param {string} code */
function throwsCode(fn, code) {
  assert.throws(fn, (e) => e instanceof OrderRuleError && e.code === code);
}

test("lineAmounts: the lines add up to the order's totals and VAT rows, discount included", () => {
  const rnd = seeded(7);
  for (let n = 0; n < 200; n++) {
    const s = script(`ord_${n}`);
    s.add("order.opened", { mode: "counter" });
    const count = 1 + rnd.int(6);
    for (let i = 0; i < count; i++) {
      s.add("line.added", line(`lin_${i}`, { unitCentimes: 100 + rnd.int(5000), qtyMilli: 250 + rnd.int(4000), vatBp: [0, 700, 1000, 1400, 2000][rnd.int(5)] }));
    }
    if (rnd.int(2)) s.add("discount.set", rnd.int(2) ? { kind: "percent", value: 1 + rnd.int(5000) } : { kind: "amount", value: 1 + rnd.int(2000) });
    if (count > 1 && rnd.int(2)) s.add("line.voided", { lineId: "lin_0" });
    const o = foldOrder(s.events);
    const parts = lineAmounts(o);
    const sum = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0);
    assert.equal(sum(parts.map((p) => p.netCentimes)), o.totals.totalCentimes);
    assert.equal(sum(parts.map((p) => p.discountCentimes)), o.totals.discountCentimes);
    for (const r of o.totals.vat) {
      const mine = parts.filter((p) => p.line.vatBp === r.rateBp);
      assert.equal(sum(mine.map((p) => p.netCentimes)), r.ttcCentimes);
      assert.equal(sum(mine.map((p) => p.vatCentimes)), r.vatCentimes);
    }
    assert.deepEqual(computeTotals(o), o.totals);
    assert.ok(parts.every((p) => !p.line.voided), "voided lines have no amounts");
  }
});

/** A closed ticket of 30,00 (three coffees) and a credit note on it. */
function ticketAndCredit() {
  const t = script("ord_ticket");
  t.add("order.opened", { mode: "counter" });
  t.add("line.added", line("lin_1", { qtyMilli: 3000 }));
  t.add("payment.added", { paymentId: "pay_1", tender: "cash", amountCentimes: 3000, bankId: "bnk_till" });
  t.add("order.closed", { receiptNo: "C1-000001" });
  const ticket = foldOrder(t.events);
  /** @param {string} id @param {number} qtyMilli @param {Record<string, any>} [refundOf] */
  const credit = (id, qtyMilli, refundOf = {}) => {
    const c = script(id);
    c.add("order.opened", { mode: "counter", approvedBy: "stf_karim", refundOf: { orderId: "ord_ticket", receiptNo: "C1-000001", ...refundOf } });
    c.add("line.added", line("lin_r", { qtyMilli }));
    return foldOrder(c.events);
  };
  return { ticket, credit };
}

test("assertRefundWithin: credit notes never refund more than what is left of their ticket", () => {
  const { ticket, credit } = ticketAndCredit();
  const two = credit("ord_c1", -2000);
  assertRefundWithin(ticket, two, []);
  assertRefundWithin(ticket, credit("ord_all", -3000), []);
  throwsCode(() => assertRefundWithin(ticket, credit("ord_more", -4000), []), "E_REFUND_EXCEEDS");
  // a second credit note sees the first one, open or closed, but not a voided one
  throwsCode(() => assertRefundWithin(ticket, credit("ord_c2", -2000), [two]), "E_REFUND_EXCEEDS");
  assertRefundWithin(ticket, credit("ord_c2", -1000), [two]);
  assertRefundWithin(ticket, credit("ord_c2", -2000), [{ ...two, status: "voided" }]);
  // the credit note itself in `others` is not counted twice
  assertRefundWithin(ticket, two, [two]);
  // a sale is not a credit note: nothing to check
  assertRefundWithin(null, ticket, []);
});

test("assertRefundWithin: the ticket must exist, be closed under that number, and be a real sale of the same kind", () => {
  const { ticket, credit } = ticketAndCredit();
  const c = credit("ord_c", -1000);
  throwsCode(() => assertRefundWithin(null, c, []), "E_REFUND_EXCEEDS");
  throwsCode(() => assertRefundWithin({ ...ticket, status: "open" }, c, []), "E_REFUND_EXCEEDS");
  throwsCode(() => assertRefundWithin(ticket, credit("ord_c", -1000, { receiptNo: "C1-000002" }), []), "E_REFUND_EXCEEDS");
  throwsCode(() => assertRefundWithin({ ...ticket, id: "ord_other" }, c, []), "E_REFUND_EXCEEDS");
  throwsCode(() => assertRefundWithin({ ...ticket, training: true }, c, []), "E_REFUND_EXCEEDS");
  throwsCode(() => assertRefundWithin({ ...ticket, refundOf: { orderId: "ord_x", receiptNo: "C1-000009", restock: false } }, c, []), "E_REFUND_EXCEEDS");
});

/** Source table 2 with two sent lines, target table 4; the pair of events of a move. */
function move() {
  const src = script("ord_t2");
  src.add("order.opened", { mode: "table", tableId: "tbl_2" });
  src.add("line.added", line("lin_a"));
  src.add("line.added", line("lin_b", { category: "cat_boissons", station: "bar", modifiers: [{ id: "mod_lait", name: { fr: "Lait", ar: "حليب" }, priceCentimes: 200 }] }));
  src.add("lines.sent", { lineIds: ["lin_a", "lin_b"] });
  const source = foldOrder(src.events);
  const dst = script("ord_t4");
  dst.add("order.opened", { mode: "table", tableId: "tbl_4" });
  dst.add("line.added", line("lin_c"));
  const target = foldOrder(dst.events);
  const snaps = source.lines.map(({ movedTo, movedFrom, voided, voidReason, totalCentimes, ...rest }) => rest);
  const out = { id: uuidv7(T0 + 60_000), type: "lines.moved_out", entity: "ord_t2", seq: 5, device: TILL, staff: "stf_ali", at: T0 + 60_000, data: { moveId: "mv_1", toOrderId: "ord_t4", lineIds: ["lin_a", "lin_b"] } };
  const inn = { id: uuidv7(T0 + 60_001), type: "lines.moved_in", entity: "ord_t4", seq: 3, device: TILL, staff: "stf_ali", at: T0 + 60_001, data: { moveId: "mv_1", fromOrderId: "ord_t2", lines: snaps } };
  return { source, target, out, inn, snaps };
}

test("assertMovePair: a move is two events that name each other and carry the same lines", () => {
  const { source, target, out, inn, snaps } = move();
  assertMovePair(out, inn, source, target);
  throwsCode(() => assertMovePair(inn, out, source, target), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair(out, { ...inn, data: { ...inn.data, moveId: "mv_2" } }, source, target), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair(out, { ...inn, device: "dev_phone" }, source, target), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair(out, { ...inn, entity: "ord_t9" }, source, target), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair(out, { ...inn, data: { ...inn.data, fromOrderId: "ord_t9" } }, source, target), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair(out, { ...inn, data: { ...inn.data, lines: snaps.slice(0, 1) } }, source, target), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair({ ...out, data: { ...out.data, lineIds: ["lin_a", "lin_z"] } }, inn, source, target), "E_MOVE_PAIR");
});

test("assertMovePair: the target is opened before the move, and TEST and real orders never exchange lines", () => {
  const { source, target, out, inn } = move();
  throwsCode(() => assertMovePair(out, inn, source, null), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair(out, inn, source, { ...target, id: "ord_t9" }), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair(out, inn, source, { ...target, training: true }), "E_MOVE_PAIR");
  throwsCode(() => assertMovePair(out, inn, { ...source, training: true }, target), "E_MOVE_PAIR");
  assertMovePair(out, inn, { ...source, training: true }, { ...target, training: true });
});

test("assertMovePair: a line never changes on its way (price, quantity, options, rate, doses, sent state, tax class, kitchen)", () => {
  const { source, target, out, inn, snaps } = move();
  const changes = [
    { unitCentimes: 1 },
    { qtyMilli: 2000 },
    { vatBp: 2000 },
    { doses: 2 },
    { productId: "prd_autre" },
    { sent: false },
    { held: true },
    { modifiers: [] },
    { modifiers: [{ id: "mod_lait", name: { fr: "Lait", ar: "حليب" }, priceCentimes: 0 }] },
    { category: "cat_cuisine" },
    { category: null },
    { station: "cuisine" },
    { name: { fr: "Msemen", ar: "مسمن" } },
  ];
  for (const change of changes) {
    const lines = snaps.map((l) => (l.lineId === "lin_b" ? { ...l, ...change } : l));
    throwsCode(() => assertMovePair(out, { ...inn, data: { ...inn.data, lines } }, source, target), "E_MOVE_PAIR");
  }
});

test("table, zone, station and category are short texts or null (E_BAD_DATA otherwise)", () => {
  const open = (/** @type {Record<string, any>} */ data) => {
    const s = script("ord_k");
    s.add("order.opened", { mode: "table", ...data });
    return foldOrder(s.events);
  };
  assert.equal(open({ tableId: "tbl_1", zoneId: "zon_1" }).tableId, "tbl_1");
  assert.equal(open({ tableId: "" }).tableId, null);
  for (const bad of [{ tableId: 5 }, { zoneId: { id: "zon_1" } }, { tableId: "x".repeat(65) }]) {
    throwsCode(() => open(bad), "E_BAD_DATA");
  }
  for (const bad of [{ station: ["bar"] }, { category: 12 }]) {
    const s = script("ord_l");
    s.add("order.opened", { mode: "counter" });
    s.add("line.added", line("lin_1", bad));
    throwsCode(() => foldOrder(s.events), "E_BAD_DATA");
  }
  const s = script("ord_m");
  s.add("order.opened", { mode: "counter" });
  s.add("order.moved", { tableId: 7 });
  throwsCode(() => foldOrder(s.events), "E_BAD_DATA");
});
