import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOrderEvent, dosesSold, foldOrder, OrderRuleError, paymentsByTender } from "../src/order.js";
import { uuidv7 } from "../src/ids.js";

const TILL = "dev_till";
const PHONE = "dev_phone";
const T0 = Date.UTC(2026, 10, 30, 8, 0, 0);

/** Small helper that builds events with increasing seq for one order. */
function script(orderId = "ord_1", device = TILL) {
  let seq = 0;
  let at = T0;
  /** @type {any[]} */
  const events = [];
  /**
   * @param {string} type
   * @param {Record<string, any>} [data]
   * @param {{ device?: string, staff?: string, atStep?: number }} [o]
   */
  const add = (type, data = {}, o = {}) => {
    seq += 1;
    at += o.atStep ?? 1000;
    const ev = { id: uuidv7(at), type, entity: orderId, seq, device: o.device ?? device, staff: o.staff ?? "stf_ali", at, data };
    events.push(ev);
    return ev;
  };
  /** Forget the last event (after a refused attempt), so the next one reuses its seq. */
  const drop = () => {
    events.pop();
    seq -= 1;
  };
  return { add, drop, events };
}

const coffee = (lineId, qtyMilli = 1000) => ({
  lineId,
  productId: "prd_noir",
  name: { fr: "Café noir", ar: "قهوة كحلة" },
  unitCentimes: 1000,
  qtyMilli,
  vatBp: 1000,
  doses: 1,
  station: "bar",
});

const msemen = (lineId) => ({
  lineId,
  productId: "prd_msemen",
  name: { fr: "Msemen", ar: "مسمن" },
  unitCentimes: 500,
  qtyMilli: 1000,
  vatBp: 1000,
  station: "kitchen",
});

/** @param {Function} fn @param {string} code */
function throwsCode(fn, code) {
  assert.throws(fn, (e) => e instanceof OrderRuleError && e.code === code);
}

test("a counter sale: open, add, send, pay cash with change, close", () => {
  const s = script();
  s.add("order.opened", { mode: "counter" });
  s.add("line.added", coffee("lin_1", 2000));
  s.add("line.added", { ...msemen("lin_2"), modifiers: [{ id: "mod_miel", name: { fr: "Miel", ar: "عسل" }, priceCentimes: 300 }] });
  s.add("lines.sent", { lineIds: ["lin_1", "lin_2"] });
  s.add("payment.added", { paymentId: "pay_1", tender: "cash", amountCentimes: 2800, tenderedCentimes: 5000, bankId: "bnk_till" });
  s.add("order.closed", { receiptNo: "C1-000001" });
  const o = foldOrder(s.events);
  assert.equal(o.status, "closed");
  assert.equal(o.totals.totalCentimes, 2800);
  assert.equal(o.totals.dueCentimes, 0);
  assert.equal(o.payments[0].changeCentimes, 2200);
  assert.equal(o.receiptNo, "C1-000001");
  assert.deepEqual(o.totals.vat, [{ rateBp: 1000, ttcCentimes: 2800, vatCentimes: 255, baseCentimes: 2545 }]);
  assert.equal(dosesSold(o), 2);
});

test("replaying the same events gives the same order; duplicates are ignored", () => {
  const s = script();
  s.add("order.opened", { mode: "table", tableId: "tbl_4", zoneId: "zon_terrasse" });
  s.add("line.added", coffee("lin_1"));
  const once = foldOrder(s.events);
  const again = applyOrderEvent(once, s.events[1]);
  assert.equal(again, once);
  assert.deepEqual(foldOrder([...s.events].reverse()), once);
});

test("seq must be exactly +1", () => {
  const s = script();
  const opened = applyOrderEvent(null, s.add("order.opened", {}));
  const ev = s.add("line.added", coffee("lin_1"));
  throwsCode(() => applyOrderEvent(opened, { ...ev, seq: 3 }), "E_SEQ");
});

test("only the owner device writes; transfer and take-over move ownership", () => {
  const s = script("ord_2", PHONE);
  s.add("order.opened", { mode: "table", tableId: "tbl_1" });
  s.add("line.added", coffee("lin_1"));
  let o = foldOrder(s.events);
  const foreign = { id: uuidv7(), type: "line.added", entity: "ord_2", seq: 3, device: TILL, staff: "stf_sara", at: T0 + 9000, data: coffee("lin_2") };
  throwsCode(() => applyOrderEvent(o, foreign), "E_NOT_OWNER");

  o = applyOrderEvent(o, { id: uuidv7(), type: "order.transferred", entity: "ord_2", seq: 3, device: PHONE, staff: "stf_ali", at: T0 + 9000, data: { toDevice: TILL } });
  assert.equal(o.owner, TILL);
  o = applyOrderEvent(o, { ...foreign, seq: 4 });
  assert.equal(o.lines.length, 2);

  const takeOver = { id: uuidv7(), type: "order.taken_over", entity: "ord_2", seq: 5, device: PHONE, staff: "stf_ali", at: T0 + 10000, data: {} };
  throwsCode(() => applyOrderEvent(o, takeOver), "E_APPROVAL_REQUIRED");
  o = applyOrderEvent(o, { ...takeOver, data: { approvedBy: "stf_manager", reason: "tablet broken" } });
  assert.equal(o.owner, PHONE);
});

test("a sent line cannot change quantity, and voiding it needs approval", () => {
  const s = script();
  s.add("order.opened", {});
  s.add("line.added", coffee("lin_1"));
  s.add("lines.sent", { lineIds: ["lin_1"] });
  const o = foldOrder(s.events);
  throwsCode(() => applyOrderEvent(o, s.add("line.qty_changed", { lineId: "lin_1", qtyMilli: 2000 })), "E_LINE_SENT");
  s.drop();
  throwsCode(() => applyOrderEvent(o, s.add("line.voided", { lineId: "lin_1", reason: "erreur" })), "E_APPROVAL_REQUIRED");
  s.drop();
  const voided = applyOrderEvent(o, s.add("line.voided", { lineId: "lin_1", reason: "erreur", approvedBy: "stf_manager" }));
  assert.equal(voided.totals.totalCentimes, 0);
});

test("an unsent line can change quantity and be voided freely", () => {
  const s = script();
  s.add("order.opened", {});
  s.add("line.added", coffee("lin_1"));
  s.add("line.qty_changed", { lineId: "lin_1", qtyMilli: 3000 });
  s.add("line.voided", { lineId: "lin_1", reason: "client parti" });
  const o = foldOrder(s.events);
  assert.equal(o.totals.totalCentimes, 0);
  assert.ok(o.lines[0].voided);
});

test("payments never exceed the total; the order closes only when paid", () => {
  const s = script();
  s.add("order.opened", {});
  s.add("line.added", coffee("lin_1"));
  const o = foldOrder(s.events);
  throwsCode(() => applyOrderEvent(o, s.add("payment.added", { paymentId: "pay_x", tender: "cash", amountCentimes: 1200, bankId: "bnk_till" })), "E_OVERPAID");
  s.drop();
  throwsCode(() => applyOrderEvent(o, s.add("order.closed", { receiptNo: "C1-000002" })), "E_NOT_PAID");
  s.drop();
  throwsCode(() => applyOrderEvent(o, s.add("payment.added", { paymentId: "pay_y", tender: "cash", amountCentimes: 1000, tenderedCentimes: 500, bankId: "bnk_till" })), "E_TENDERED_LOW");
});

test("split payments across tenders", () => {
  const s = script();
  s.add("order.opened", { mode: "table", tableId: "tbl_2", covers: 3 });
  for (let i = 1; i <= 3; i++) s.add("line.added", coffee(`lin_${i}`));
  s.add("payment.added", { paymentId: "pay_1", tender: "cash", amountCentimes: 1000, bankId: "bnk_waiter" });
  s.add("payment.added", { paymentId: "pay_2", tender: "card_external", amountCentimes: 1000, reference: "TPE 4821", bankId: "bnk_waiter" });
  s.add("payment.added", { paymentId: "pay_3", tender: "maroc_pay", amountCentimes: 1000, reference: "MP-99", bankId: "bnk_waiter" });
  s.add("order.closed", { receiptNo: "C1-000003" });
  const o = foldOrder(s.events);
  assert.deepEqual(paymentsByTender(o), { cash: 1000, card_external: 1000, maroc_pay: 1000 });
});

test("an order discount is spread over the lines before VAT", () => {
  const s = script();
  s.add("order.opened", {});
  s.add("line.added", { ...coffee("lin_1"), unitCentimes: 1500 });
  s.add("line.added", { ...msemen("lin_2"), unitCentimes: 800, vatBp: 2000 });
  s.add("discount.set", { kind: "percent", value: 1000, reason: "habitué" });
  const o = foldOrder(s.events);
  // gross 2300, discount 230 → lines 1500−150 = 1350 at 10 %, 800−80 = 720 at 20 %
  assert.equal(o.totals.discountCentimes, 230);
  assert.equal(o.totals.totalCentimes, 2070);
  assert.deepEqual(o.totals.vat, [
    { rateBp: 1000, ttcCentimes: 1350, vatCentimes: 123, baseCentimes: 1227 },
    { rateBp: 2000, ttcCentimes: 720, vatCentimes: 120, baseCentimes: 600 },
  ]);
});

test("a void keeps the history and needs approval once something was sent", () => {
  const s = script();
  s.add("order.opened", {});
  s.add("line.added", coffee("lin_1"));
  s.add("lines.sent", { lineIds: ["lin_1"] });
  const o = foldOrder(s.events);
  throwsCode(() => applyOrderEvent(o, s.add("order.voided", { reason: "erreur" })), "E_APPROVAL_REQUIRED");
  s.drop();
  const v = applyOrderEvent(o, s.add("order.voided", { reason: "erreur", approvedBy: "stf_manager" }));
  assert.equal(v.status, "voided");
  assert.equal(v.receiptNo, null);
  throwsCode(() => applyOrderEvent(v, s.add("line.added", coffee("lin_9"))), "E_STATUS");
});

test("an order with payments cannot be voided", () => {
  const s = script();
  s.add("order.opened", {});
  s.add("line.added", coffee("lin_1"));
  s.add("payment.added", { paymentId: "pay_1", tender: "cash", amountCentimes: 1000, bankId: "bnk_till" });
  const o = foldOrder(s.events);
  throwsCode(() => applyOrderEvent(o, s.add("order.voided", { reason: "x", approvedBy: "stf_manager" })), "E_HAS_PAYMENTS");
});

test("a recent payment can be corrected; an older one needs approval", () => {
  const s = script();
  s.add("order.opened", {});
  s.add("line.added", coffee("lin_1"));
  s.add("payment.added", { paymentId: "pay_1", tender: "card_external", amountCentimes: 1000, bankId: "bnk_till" });
  const o = foldOrder(s.events);
  const quick = applyOrderEvent(o, s.add("payment.voided", { paymentId: "pay_1", reason: "mauvais mode" }, { atStep: 30_000 }));
  assert.equal(quick.totals.paidCentimes, 0);
  s.drop();
  throwsCode(() => applyOrderEvent(o, s.add("payment.voided", { paymentId: "pay_1", reason: "x" }, { atStep: 600_000 })), "E_APPROVAL_REQUIRED");
});

test("voiding a line that was already paid is refused (use a credit note)", () => {
  const s = script();
  s.add("order.opened", {});
  s.add("line.added", coffee("lin_1"));
  s.add("line.added", coffee("lin_2"));
  s.add("payment.added", { paymentId: "pay_1", tender: "cash", amountCentimes: 2000, bankId: "bnk_till" });
  const o = foldOrder(s.events);
  throwsCode(() => applyOrderEvent(o, s.add("line.voided", { lineId: "lin_2", reason: "x" })), "E_OVERPAID");
});

test("a credit note has negative lines and payments and needs approval", () => {
  const s = script("ord_refund");
  throwsCode(() => applyOrderEvent(null, s.add("order.opened", { refundOf: { orderId: "ord_1", receiptNo: "C1-000001" } })), "E_APPROVAL_REQUIRED");
  const r = script("ord_refund");
  r.add("order.opened", { refundOf: { orderId: "ord_1", receiptNo: "C1-000001" }, approvedBy: "stf_manager" });
  r.add("line.added", coffee("lin_r1", -1000));
  r.add("payment.added", { paymentId: "pay_r1", tender: "cash", amountCentimes: -1000, bankId: "bnk_till" });
  r.add("order.closed", { receiptNo: "C1-000004" });
  const o = foldOrder(r.events);
  assert.equal(o.totals.totalCentimes, -1000);
  assert.equal(o.totals.vat[0].vatCentimes, -91);
  const bad = script("ord_refund2");
  bad.add("order.opened", { refundOf: { orderId: "ord_1", receiptNo: "C1-000001" }, approvedBy: "stf_manager" });
  const o2 = foldOrder(bad.events);
  throwsCode(() => applyOrderEvent(o2, bad.add("line.added", coffee("lin_x", 1000))), "E_REFUND_SIGN");
});

test("property: random valid sequences keep paid within the total and replay identically", () => {
  let seed = 99;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 500; n++) {
    const s = script(`ord_p${n}`);
    let state = applyOrderEvent(null, s.add("order.opened", {}));
    const lines = [];
    const count = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < count; i++) {
      const id = `lin_${i}`;
      state = applyOrderEvent(state, s.add("line.added", { ...coffee(id, 1000 * (1 + Math.floor(rnd() * 3))), unitCentimes: 500 + Math.floor(rnd() * 3000) }));
      lines.push(id);
    }
    if (rnd() < 0.5) state = applyOrderEvent(state, s.add("discount.set", { kind: "percent", value: Math.floor(rnd() * 3000) }));
    let due = state.totals.dueCentimes;
    let k = 0;
    while (due > 0) {
      const amount = Math.max(1, Math.min(due, Math.floor(rnd() * due) + 1));
      state = applyOrderEvent(state, s.add("payment.added", { paymentId: `pay_${k++}`, tender: rnd() < 0.7 ? "cash" : "card_external", amountCentimes: amount, bankId: "bnk_till" }));
      due = state.totals.dueCentimes;
      assert.ok(state.totals.paidCentimes <= state.totals.totalCentimes);
    }
    state = applyOrderEvent(state, s.add("order.closed", { receiptNo: `C1-${n}` }));
    const vatSum = state.totals.vat.reduce((a, r) => a + r.ttcCentimes, 0);
    assert.equal(vatSum, state.totals.totalCentimes);
    assert.deepEqual(foldOrder(s.events), state);
  }
});

test("restaurant courses: send starters, hold the mains, fire them later", () => {
  const s = script("ord_resto");
  s.add("order.opened", { mode: "table", tableId: "tbl_12", covers: 4 });
  s.add("line.added", { ...coffee("lin_h"), productId: "prd_harira", name: { fr: "Harira", ar: "حريرة" }, unitCentimes: 2000, doses: 0, station: "chaud", seat: 1, course: 1 });
  s.add("line.added", { ...coffee("lin_t"), productId: "prd_tajine", name: { fr: "Tajine poulet citron", ar: "طاجين دجاج بالحامض" }, unitCentimes: 7500, doses: 0, station: "chaud", seat: 1, course: 2 });
  s.add("lines.sent", { lineIds: ["lin_h"] });
  s.add("lines.sent", { lineIds: ["lin_t"], hold: true });
  let o = foldOrder(s.events);
  assert.equal(o.lines[1].held, true);
  assert.equal(o.lines[1].firedAt, null);
  // a held line can be voided without approval: the kitchen has not started it
  const voidHeld = applyOrderEvent(o, s.add("line.voided", { lineId: "lin_t", reason: "changement" }));
  assert.equal(voidHeld.lines[1].voided, true);
  s.drop();
  o = applyOrderEvent(o, s.add("lines.fired", { lineIds: ["lin_t"] }));
  assert.equal(o.lines[1].held, false);
  assert.ok(o.lines[1].firedAt);
  throwsCode(() => applyOrderEvent(o, s.add("lines.fired", { lineIds: ["lin_t"] })), "E_NOT_HELD");
  s.drop();
  throwsCode(() => applyOrderEvent(o, s.add("line.voided", { lineId: "lin_t", reason: "x" })), "E_APPROVAL_REQUIRED");
  s.drop();
  throwsCode(() => applyOrderEvent(o, s.add("line.added", { ...coffee("lin_bad"), seat: 99 })), "E_BAD_DATA");
});

test("merge: sent lines move to another order without a void, an approval or a new ticket", () => {
  const src = script("ord_t2");
  src.add("order.opened", { mode: "table", tableId: "tbl_2" });
  src.add("line.added", coffee("lin_a"));
  src.add("line.added", msemen("lin_b"));
  src.add("lines.sent", { lineIds: ["lin_a", "lin_b"] });
  const dst = script("ord_t4");
  dst.add("order.opened", { mode: "table", tableId: "tbl_4" });
  dst.add("line.added", coffee("lin_c"));
  dst.add("lines.sent", { lineIds: ["lin_c"] });

  const source = foldOrder(src.events);
  const snaps = source.lines.map(({ movedTo, movedFrom, voided, voidReason, totalCentimes, ...rest }) => rest);
  src.add("lines.moved_out", { moveId: "mv_1", toOrderId: "ord_t4", lineIds: ["lin_a", "lin_b"] });
  dst.add("lines.moved_in", { moveId: "mv_1", fromOrderId: "ord_t2", lines: snaps });

  const a = foldOrder(src.events);
  const b = foldOrder(dst.events);
  assert.equal(a.totals.totalCentimes, 0);
  assert.equal(b.totals.totalCentimes, 2500);
  assert.ok(b.lines.every((l) => l.sent && l.firedAt !== null), "moved lines stay sent and fired");
  assert.equal(b.lines.find((l) => l.lineId === "lin_a")?.movedFrom, "ord_t2");
  // the emptied source is voided with no approval: nothing it still holds was sent
  src.add("order.voided", { reason: "fusion" });
  assert.equal(foldOrder(src.events).status, "voided");
  // the moved lines no longer belong to the source
  throwsCode(() => applyOrderEvent(a, { ...src.events[4], id: uuidv7(T0 + 99_000), type: "line.voided", seq: a.seq + 1, data: { lineId: "lin_a", approvedBy: "stf_karim" } }), "E_LINE_MOVED");
});

test("a move never takes more than what is left after payments, and checks its lines", () => {
  const s = script("ord_x");
  s.add("order.opened", { mode: "table", tableId: "tbl_1" });
  s.add("line.added", coffee("lin_1"));
  s.add("line.added", coffee("lin_2"));
  s.add("payment.added", { paymentId: "pay_1", tender: "cash", amountCentimes: 1500, bankId: "bnk_till" });
  const o = foldOrder(s.events);
  const next = (type, data) => ({ id: uuidv7(T0 + 50_000), type, entity: "ord_x", seq: o.seq + 1, device: TILL, staff: "stf_ali", at: T0 + 50_000, data });
  throwsCode(() => applyOrderEvent(o, next("lines.moved_out", { moveId: "mv_2", toOrderId: "ord_y", lineIds: ["lin_2"] })), "E_OVERPAID");
  throwsCode(() => applyOrderEvent(o, next("lines.moved_out", { moveId: "mv_2", toOrderId: "ord_y", lineIds: ["lin_9"] })), "E_LINE_UNKNOWN");
  throwsCode(() => applyOrderEvent(o, next("lines.moved_out", { moveId: "mv_2", toOrderId: "ord_x", lineIds: ["lin_1"] })), "E_BAD_DATA");
  throwsCode(() => applyOrderEvent(o, next("lines.moved_in", { moveId: "mv_3", fromOrderId: "ord_z", lines: [{ ...coffee("lin_1"), sent: false, held: false }] })), "E_DUP_LINE");
  throwsCode(() => applyOrderEvent(o, next("lines.moved_in", { moveId: "mv_3", fromOrderId: "ord_z", lines: [{ ...coffee("lin_7"), held: false }] })), "E_BAD_DATA");
});

test("a customer is attached and cleared while the order is open; flags from the opening are kept", () => {
  const s = script("ord_k");
  s.add("order.opened", { mode: "takeaway", source: "phone", training: true });
  s.add("order.customer_set", { customerId: "cus_1" });
  let o = foldOrder(s.events);
  assert.equal(o.customerId, "cus_1");
  assert.equal(o.source, "phone");
  assert.equal(o.training, true);
  s.add("order.customer_set", { customerId: null });
  s.add("line.added", coffee("lin_1"));
  s.add("payment.added", { paymentId: "pay_1", tender: "cash", amountCentimes: 1000, bankId: "bnk_till" });
  s.add("order.closed", { receiptNo: "TC1-000001" });
  o = foldOrder(s.events);
  assert.equal(o.customerId, null);
  const late = { id: uuidv7(T0 + 90_000), type: "order.customer_set", entity: "ord_k", seq: o.seq + 1, device: TILL, staff: null, at: T0 + 90_000, data: { customerId: "cus_2" } };
  throwsCode(() => applyOrderEvent(o, late), "E_STATUS");
  const bad = script("ord_bad");
  throwsCode(() => bad.add("order.opened", { source: "Web Site" }) && foldOrder(bad.events), "E_BAD_DATA");
});

test("a credit note records whether the goods came back to stock", () => {
  const s = script("ord_cn");
  s.add("order.opened", { refundOf: { orderId: "ord_1", receiptNo: "C1-000001", restock: false }, approvedBy: "stf_karim" });
  assert.equal(foldOrder(s.events).refundOf?.restock, false);
  const t = script("ord_cn2");
  t.add("order.opened", { refundOf: { orderId: "ord_1", receiptNo: "C1-000001" }, approvedBy: "stf_karim" });
  assert.equal(foldOrder(t.events).refundOf?.restock, false, "restock defaults to false");
  const u = script("ord_cn3");
  u.add("order.opened", { refundOf: { orderId: "ord_1", receiptNo: "C1-000001", restock: "yes" }, approvedBy: "stf_karim" });
  throwsCode(() => foldOrder(u.events), "E_BAD_DATA");
});
