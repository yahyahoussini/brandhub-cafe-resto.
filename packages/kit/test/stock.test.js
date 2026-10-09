// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { stockLevels } from "../src/stock.js";
import { foldOrder } from "../src/order.js";
import { CLOUD_DEVICE } from "../src/events.js";
import { newId, uuidv7 } from "../src/ids.js";
import { seeded } from "./helpers.js";

const TILL = newId("dev");
const OWNER = newId("own");
const COFFEE = newId("itm"); // grams × 1000
const MILK = newId("itm"); // ml × 1000
const CAFE = newId("prd");
const CREME = newId("prd");

/** @param {string} type @param {string} entity @param {Record<string, any>} data @param {number} at */
const mv = (type, entity, data, at) => ({ id: uuidv7(at), type, entity, seq: null, device: TILL, staff: null, at, data, v: 1 });
/** @param {string} type @param {string} entity @param {Record<string, any>} data @param {number} at */
const cat = (type, entity, data, at) => ({ id: uuidv7(at), type, entity, seq: null, device: CLOUD_DEVICE, staff: OWNER, at, data, v: 1 });

const catalog = [
  cat("catalog.product_set", CAFE, { name: { fr: "Café noir", ar: "قهوة سوداء" }, priceCentimes: 1000, deductions: [{ itemId: COFFEE, qtyMilli: 7000 }] }, 100),
  cat("catalog.product_set", CREME, { name: { fr: "Café crème", ar: "قهوة بالحليب" }, priceCentimes: 1200, deductions: [{ itemId: COFFEE, qtyMilli: 7000 }, { itemId: MILK, qtyMilli: 120000 }] }, 100),
];

/**
 * A closed order (or credit note) of `lines` at `closedAt`.
 * @param {[string, number][]} lines product, quantity
 * @param {number} closedAt
 * @param {{ refund?: { restock: boolean }, training?: boolean }} [opts]
 */
function closedOrder(lines, closedAt, opts = {}) {
  const id = newId("ord");
  let seq = 0;
  const sign = opts.refund ? -1 : 1;
  const e = (/** @type {string} */ type, /** @type {any} */ data) => ({ id: uuidv7(closedAt), type, entity: id, seq: ++seq, device: TILL, staff: null, at: closedAt - 100 + seq, data });
  const evs = [
    e("order.opened", { mode: "counter", training: opts.training ?? false, ...(opts.refund ? { refundOf: { orderId: newId("ord"), receiptNo: "C1-000001", restock: opts.refund.restock }, approvedBy: newId("stf") } : {}) }),
  ];
  let total = 0;
  for (const [productId, qty] of lines) {
    const unit = productId === CAFE ? 1000 : 1200;
    evs.push(e("line.added", { lineId: newId("lin"), productId, name: { fr: "x", ar: "x" }, unitCentimes: unit, qtyMilli: sign * qty * 1000, vatBp: 1000 }));
    total += sign * unit * qty;
  }
  evs.push(e("payment.added", { paymentId: newId("pay"), tender: "cash", amountCentimes: total, bankId: newId("bnk") }));
  const closed = e("order.closed", { receiptNo: "C1-000009" });
  evs.push({ ...closed, at: closedAt });
  return foldOrder(/** @type {any} */ (evs));
}

test("a count is a snapshot; received, wasted and adjusted move the level; sales deduct their list", () => {
  const levels = stockLevels({
    movements: [
      mv("stock.counted", COFFEE, { qtyMilli: 1_000_000 }, 1000),
      mv("stock.received", COFFEE, { qtyMilli: 500_000 }, 2000),
      mv("stock.wasted", COFFEE, { qtyMilli: 10_000, reason: "spilled" }, 3000),
      mv("stock.adjusted", COFFEE, { qtyMilli: -5_000, reason: "recount" }, 4000),
    ],
    orders: [closedOrder([[CAFE, 2], [CREME, 1]], 5000)],
    catalogEvents: catalog,
  });
  assert.equal(levels[COFFEE].levelMilli, 1_000_000 + 500_000 - 10_000 - 5_000 - 3 * 7000);
  assert.equal(levels[COFFEE].soldMilli, 21_000);
  assert.equal(levels[MILK].levelMilli, -120_000, "no count yet: the level starts at 0");
});

test("the stock gap at a count: count − (previous count + received − wasted + adjusted − sold)", () => {
  const levels = stockLevels({
    movements: [
      mv("stock.counted", COFFEE, { qtyMilli: 1_000_000 }, 1000),
      mv("stock.received", COFFEE, { qtyMilli: 200_000 }, 2000),
      mv("stock.counted", COFFEE, { qtyMilli: 1_150_000 }, 9000),
    ],
    orders: [closedOrder([[CAFE, 3]], 5000)],
    catalogEvents: catalog,
  });
  assert.equal(levels[COFFEE].gapMilli, 1_150_000 - (1_000_000 + 200_000 - 21_000));
  assert.equal(levels[COFFEE].levelMilli, 1_150_000);
});

test("the deduction list in force when the order closed applies, not today's", () => {
  const later = cat("catalog.product_set", CAFE, { ...catalog[0].data, deductions: [{ itemId: COFFEE, qtyMilli: 9000 }] }, 6000);
  const levels = stockLevels({ movements: [], orders: [closedOrder([[CAFE, 1]], 5000), closedOrder([[CAFE, 1]], 7000)], catalogEvents: [...catalog, later] });
  assert.equal(levels[COFFEE].soldMilli, 7000 + 9000);
});

test("a recipe (Resto) wins over the deduction list from its effectiveFrom, scaled by its yield", () => {
  const recipe = cat("catalog.recipe_set", CAFE, { lines: [{ itemId: COFFEE, qtyMilli: 16000 }], yieldMilli: 2000, effectiveFrom: 6000 }, 5500);
  const levels = stockLevels({ movements: [], orders: [closedOrder([[CAFE, 1]], 5000), closedOrder([[CAFE, 3]], 7000)], catalogEvents: [...catalog, recipe] });
  assert.equal(levels[COFFEE].soldMilli, 7000 + 3 * 8000);
});

test("a credit note gives ingredients back only with restock; otherwise it is waste from refunds", () => {
  const sale = closedOrder([[CREME, 2]], 5000);
  const back = stockLevels({ movements: [], orders: [sale, closedOrder([[CREME, 1]], 6000, { refund: { restock: true } })], catalogEvents: catalog });
  assert.equal(back[MILK].levelMilli, -120_000);
  assert.equal(back[MILK].refundWasteMilli, 0);
  const gone = stockLevels({ movements: [], orders: [sale, closedOrder([[CREME, 1]], 6000, { refund: { restock: false } })], catalogEvents: catalog });
  assert.equal(gone[MILK].levelMilli, -240_000, "the level does not move: the sale already took it out");
  assert.equal(gone[MILK].refundWasteMilli, 120_000);
});

test("TEST orders, open and voided orders never touch stock", () => {
  const levels = stockLevels({ movements: [], orders: [closedOrder([[CAFE, 5]], 5000, { training: true })], catalogEvents: catalog });
  assert.equal(levels[COFFEE], undefined);
});

test("a moved line counts once, in the order that closes it", () => {
  const src = newId("ord");
  const dst = newId("ord");
  const lineId = newId("lin");
  const line = { lineId, productId: CAFE, name: { fr: "x", ar: "x" }, unitCentimes: 1000, qtyMilli: 2000, vatBp: 1000 };
  let s1 = 0;
  let s2 = 0;
  const a = (/** @type {string} */ type, /** @type {any} */ data) => ({ id: uuidv7(1), type, entity: src, seq: ++s1, device: TILL, staff: null, at: 1000 + s1, data });
  const b = (/** @type {string} */ type, /** @type {any} */ data) => ({ id: uuidv7(2), type, entity: dst, seq: ++s2, device: TILL, staff: null, at: 2000 + s2, data });
  const source = foldOrder(/** @type {any} */ ([
    a("order.opened", { mode: "table" }),
    a("line.added", line),
    a("lines.moved_out", { moveId: "m1", toOrderId: dst, lineIds: [lineId] }),
    a("order.voided", { reason: "merged" }),
  ]));
  const target = foldOrder(/** @type {any} */ ([
    b("order.opened", { mode: "table" }),
    b("lines.moved_in", { moveId: "m1", fromOrderId: src, lines: [{ ...line, sent: false, held: false }] }),
    b("payment.added", { paymentId: "p1", tender: "cash", amountCentimes: 2000, bankId: newId("bnk") }),
    b("order.closed", { receiptNo: "C1-000001" }),
  ]));
  assert.equal(stockLevels({ movements: [], orders: [source, target], catalogEvents: catalog })[COFFEE].soldMilli, 14000);
});

test("property: movements and orders in any order give the same levels", () => {
  const rng = seeded(42);
  for (let round = 0; round < 30; round++) {
    const movements = [];
    for (let i = 0; i < 25; i++) {
      const at = 1000 + rng.int(50) * 10;
      const item = rng.int(2) ? COFFEE : MILK;
      const k = rng.int(4);
      if (k === 0) movements.push(mv("stock.counted", item, { qtyMilli: rng.int(100) * 1000 }, at));
      else if (k === 1) movements.push(mv("stock.received", item, { qtyMilli: rng.int(50) * 1000 }, at));
      else if (k === 2) movements.push(mv("stock.wasted", item, { qtyMilli: rng.int(5) * 1000, reason: "x" }, at));
      else movements.push(mv("stock.adjusted", item, { qtyMilli: (rng.int(11) - 5) * 1000, reason: "x" }, at));
    }
    const orders = Array.from({ length: 6 }, () => closedOrder([[rng.int(2) ? CAFE : CREME, 1 + rng.int(3)]], 1000 + rng.int(50) * 10 + 5));
    const reference = stockLevels({ movements, orders, catalogEvents: catalog });
    const again = stockLevels({ movements: rng.shuffle(movements), orders: rng.shuffle(orders), catalogEvents: rng.shuffle(catalog) });
    assert.deepEqual(again, reference, `round ${round}`);
  }
});
