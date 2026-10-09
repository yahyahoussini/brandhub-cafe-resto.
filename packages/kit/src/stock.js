// @ts-check
/**
 * Stock levels (docs/03 §5, docs/10 §1). Movements (`stock.counted` as a snapshot, `stock.received`, `stock.wasted`,
 * `stock.adjusted`) and the sales of closed orders, applied in time order (`at`, `device`, `id`): the same input in any
 * order gives the same levels.
 *
 * Sales deduct without events: each closed order's active lines use the recipe (Resto, `catalog.recipe_set`, from its
 * `effectiveFrom`) or the product's deduction list (`catalog.product_set`) in force when the order closed. A moved line
 * counts once, in the order that closes it (it is active only there). A credit note gives its ingredients back only
 * when `refundOf.restock` is true; otherwise they are recorded as waste from refunds and the level does not move (the
 * sale already took them out). TEST orders (training) never touch stock.
 */

import { divRound } from "./money.js";
import { compareEvents } from "./events.js";
import { isActiveLine } from "./order.js";

/** @typedef {import("./events.js").EventEnvelope} EventEnvelope */
/** @typedef {import("./order.js").OrderState} OrderState */

/**
 * @typedef {object} StockLine
 * @property {string} itemId
 * @property {number} levelMilli level now
 * @property {number | null} lastCountAt
 * @property {number | null} lastCountMilli
 * @property {number} receivedMilli since the last count
 * @property {number} wastedMilli since the last count (stock.wasted)
 * @property {number} adjustedMilli since the last count (stock.adjusted, signed)
 * @property {number} soldMilli since the last count (sales deductions, credit notes with restock subtracted)
 * @property {number} refundWasteMilli since the last count: ingredients of credit notes that did not come back
 * @property {number | null} gapMilli at the last count: count − (previous level + received − wasted + adjusted − sold);
 *   null before a second count
 */

const MOVEMENTS = new Set(["stock.counted", "stock.received", "stock.wasted", "stock.adjusted"]);

/**
 * The version of a product's deduction list or recipe in force at an instant.
 * @param {EventEnvelope[]} catalogEvents `catalog.product_set` and `catalog.recipe_set` events, any order
 */
export function deductionsAt(catalogEvents) {
  /** @type {Map<string, EventEnvelope[]>} */
  const products = new Map();
  /** @type {Map<string, EventEnvelope[]>} */
  const recipes = new Map();
  for (const ev of catalogEvents) {
    const map = ev.type === "catalog.product_set" ? products : ev.type === "catalog.recipe_set" ? recipes : null;
    if (!map) continue;
    const list = map.get(ev.entity) ?? [];
    list.push(ev);
    map.set(ev.entity, list);
  }
  for (const list of [...products.values(), ...recipes.values()]) list.sort(compareEvents);

  /**
   * Item quantities for `qtyMilli` of a product sold at `at`.
   * @param {string} productId
   * @param {number} qtyMilli
   * @param {number} at
   * @returns {Map<string, number>}
   */
  return function forSale(productId, qtyMilli, at) {
    /** @type {Map<string, number>} */
    const out = new Map();
    const recipe = (recipes.get(productId) ?? []).filter((r) => r.data.effectiveFrom <= at && r.at <= at).at(-1);
    if (recipe) {
      for (const l of recipe.data.lines ?? []) {
        out.set(l.itemId, (out.get(l.itemId) ?? 0) + divRound(l.qtyMilli * qtyMilli, recipe.data.yieldMilli));
      }
      return out;
    }
    const product = (products.get(productId) ?? []).filter((p) => p.at <= at).at(-1);
    for (const x of product?.data.deductions ?? []) {
      out.set(x.itemId, (out.get(x.itemId) ?? 0) + divRound(x.qtyMilli * qtyMilli, 1000));
    }
    return out;
  };
}

/**
 * @param {{ movements: EventEnvelope[], orders: OrderState[], catalogEvents: EventEnvelope[] }} input
 * @returns {Record<string, StockLine>}
 */
export function stockLevels({ movements, orders, catalogEvents }) {
  const forSale = deductionsAt(catalogEvents);
  /** @type {{ at: number, device: string, id: string, itemId: string, kind: string, qtyMilli: number }[]} */
  const timeline = [];
  for (const ev of movements) {
    if (!MOVEMENTS.has(ev.type)) continue;
    timeline.push({ at: ev.at, device: ev.device, id: ev.id, itemId: ev.entity, kind: ev.type, qtyMilli: ev.data.qtyMilli });
  }
  for (const o of orders) {
    if (o.status !== "closed" || o.training || o.closedAt === null) continue;
    /** @type {Map<string, number>} */
    const used = new Map();
    for (const l of o.lines.filter(isActiveLine)) {
      for (const [itemId, q] of forSale(l.productId, l.qtyMilli, o.closedAt)) used.set(itemId, (used.get(itemId) ?? 0) + q);
    }
    const kind = o.refundOf === null ? "sale" : o.refundOf.restock ? "restock" : "refund_waste";
    for (const [itemId, q] of used) {
      if (q !== 0) timeline.push({ at: o.closedAt, device: o.owner, id: o.id, itemId, kind, qtyMilli: q });
    }
  }
  timeline.sort((a, b) => compareEvents(a, b) || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));

  /** @type {Record<string, StockLine>} */
  const out = {};
  for (const e of timeline) {
    const s = (out[e.itemId] ??= {
      itemId: e.itemId,
      levelMilli: 0,
      lastCountAt: null,
      lastCountMilli: null,
      receivedMilli: 0,
      wastedMilli: 0,
      adjustedMilli: 0,
      soldMilli: 0,
      refundWasteMilli: 0,
      gapMilli: null,
    });
    switch (e.kind) {
      case "stock.counted":
        if (s.lastCountAt !== null) s.gapMilli = e.qtyMilli - s.levelMilli;
        s.levelMilli = e.qtyMilli;
        s.lastCountAt = e.at;
        s.lastCountMilli = e.qtyMilli;
        s.receivedMilli = s.wastedMilli = s.adjustedMilli = s.soldMilli = s.refundWasteMilli = 0;
        break;
      case "stock.received":
        s.levelMilli += e.qtyMilli;
        s.receivedMilli += e.qtyMilli;
        break;
      case "stock.wasted":
        s.levelMilli -= e.qtyMilli;
        s.wastedMilli += e.qtyMilli;
        break;
      case "stock.adjusted":
        s.levelMilli += e.qtyMilli;
        s.adjustedMilli += e.qtyMilli;
        break;
      case "sale":
      case "restock": // a credit note's quantities are negative: subtracting them gives the goods back
        s.levelMilli -= e.qtyMilli;
        s.soldMilli += e.qtyMilli;
        break;
      case "refund_waste":
        s.refundWasteMilli -= e.qtyMilli;
        break;
    }
  }
  return out;
}
