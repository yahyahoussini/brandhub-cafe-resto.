// @ts-check
/**
 * Marks: catalog, settings, staff, layout, kitchen status and table marks (docs/03 §1, §5, D20). The last writer wins,
 * by (`at`, `device`, `id`), per entity and type, and per key where docs/03 §1 says so: `settings.set` per `path`,
 * `kitchen.status` per `sentEventId` and `station`. Two types on one entity never overwrite each other (`staff.set` and
 * `staff.pin_set` stay apart). `day.closed` is kept per business day.
 *
 * `applyMarks(state, events)` folds any batch, in any order, into the same state; the settings defaults of docs/03 §8
 * live here so a device has them offline.
 */

import { assertCentimes, assertRateBp } from "./money.js";
import { EventError, compareEvents, typeInfo } from "./events.js";
import { parseHhMm } from "./timezone.js";

/** @typedef {import("./events.js").EventEnvelope} EventEnvelope */
/** @typedef {"cafe" | "resto"} Product */

/**
 * Settings defaults (docs/03 §8). Paths are flat keys; `settings.set {path, value}` replaces the value at a path.
 * Empty means "filled at onboarding" or "waiting for the accountant": the app shows it as required (CLAUDE.md, Facts).
 * @param {Product} product
 * @returns {Record<string, unknown>}
 */
export function settingsDefaults(product) {
  if (product !== "cafe" && product !== "resto") throw new RangeError(`unknown product ${product}`);
  const cafe = product === "cafe";
  return {
    "service.mode": cafe ? "both" : "waiter",
    "service.banking": "both",
    // zone keys of the menu template (data/menu-templates/*.json); onboarding turns them into zon_… ids
    "service.zones": cafe ? ["salle", "terrasse"] : ["salle"],
    "receipt.languages": "fr+ar",
    "receipt.header": [],
    "receipt.footer": [],
    "receipt.width": 48,
    "receipt.lineLanguage": "fr",
    "receipt.printOnClose": "always",
    // empty: each category's station from the template routes it (bar for drinks, cuisine for food)
    "printing.routes": [],
    "printing.barTicketOnPayment": cafe,
    "taxes.defaultVatBp": 1000,
    "taxes.byMode": { takeaway: null, delivery: null },
    "taxes.debitDeBoissons": { enabled: false, rateBp: null, commune: null },
    "approvals.discountCapBp": { owner: 10000, manager: 5000, cashier: 1000, waiter: 0 },
    "approvals.freeReprints": 1,
    // null: the default approvers, owners and managers (data/permissions.json); otherwise a list of stf_… ids
    "approvals.approvers": null,
    tips: { enabled: false, rule: "equal", roles: [] },
    "reports.eveningTime": "23:30",
    "reports.channels": ["whatsapp", "email"],
    "reports.thresholds": { cashGapCentimes: 2000, dose: { minDoses: 5, relativeBp: 300 } },
    "hours.businessDayCutoff": "05:00",
    "hours.ramadan": null,
    "languages.default": "fr",
    "ordering.inboxDeviceId": null,
    "deposits.vatOnReceipt": null,
    "deposits.keptVatBp": null,
    // docs/06 §1: the lock screen comes back after 2 minutes without a tap on the till, 5 on phones
    "lock.tillSeconds": 120,
    "lock.phoneSeconds": 300,
    // per-action overrides of data/permissions.json, clamped to each floor (permissions.js)
    permissions: {},
  };
}

const ROLES = ["owner", "manager", "cashier", "waiter", "kitchen", "accountant", "driver"];
const KITCHEN_STATUSES = ["new", "preparing", "ready", "served", "recalled"];

/** @param {string} message */
function bad(message) {
  return new EventError("E_BAD_DATA", message);
}

/** @param {unknown} v @param {string} what */
function str(v, what) {
  if (typeof v !== "string" || !v) throw bad(`${what} is required`);
  return v;
}

/** @param {unknown} n */
function name(n) {
  const x = /** @type {any} */ (n);
  if (!x || typeof x.fr !== "string" || typeof x.ar !== "string" || (!x.fr && !x.ar)) throw bad("name must be { fr, ar }");
}

/**
 * Validates the payload of a mark (the sync API calls it after validateEnvelope; docs/04 §2 "movements and marks:
 * schema only"). Throws an EventError coded E_BAD_DATA.
 * @param {EventEnvelope} ev
 */
export function validateMark(ev) {
  if (typeInfo(ev.type).kind !== "mark") throw new EventError("E_BAD_EVENT", `${ev.type} is not a mark`);
  try {
    return checkMarkData(ev);
  } catch (e) {
    if (e instanceof TypeError || e instanceof RangeError) throw bad(e.message);
    throw e;
  }
}

/** @param {EventEnvelope} ev */
function checkMarkData(ev) {
  const d = ev.data;
  switch (ev.type) {
    case "settings.set": {
      const path = str(d.path, "path");
      if (!(path in settingsDefaults("cafe"))) throw bad(`unknown setting ${path}`);
      if (!("value" in d)) throw bad("value is required");
      if (path === "hours.businessDayCutoff" || path === "reports.eveningTime") parseHhMm(String(d.value));
      if (path === "taxes.defaultVatBp") assertRateBp(d.value);
      break;
    }
    case "kitchen.status":
      str(d.sentEventId, "sentEventId");
      str(d.station, "station");
      if (!KITCHEN_STATUSES.includes(d.status)) throw bad(`status must be ${KITCHEN_STATUSES.join(", ")}`);
      break;
    case "table.mark":
      if (d.state !== "cleaning" && d.state !== "free") throw bad("state must be cleaning or free");
      break;
    case "staff.set":
      str(d.displayName, "displayName");
      if (!ROLES.includes(d.role)) throw bad(`role must be ${ROLES.join(", ")}`);
      break;
    case "staff.pin_set":
      str(d.pinHash, "pinHash");
      str(d.pinSalt, "pinSalt");
      if (!Number.isSafeInteger(d.iterations) || d.iterations < 1) throw bad("iterations must be a positive integer");
      break;
    case "catalog.category_set":
      name(d.name);
      if (d.taxClass !== undefined && d.taxClass !== "drink" && d.taxClass !== "food") throw bad("taxClass must be drink or food");
      if (d.course !== undefined && (!Number.isInteger(d.course) || d.course < 1 || d.course > 6)) throw bad("course must be 1..6");
      break;
    case "catalog.product_set":
      name(d.name);
      if (d.priceCentimes !== null) {
        assertCentimes(d.priceCentimes, "priceCentimes");
        if (d.priceCentimes < 0) throw bad("price cannot be negative");
      }
      if (d.vatBp !== null && d.vatBp !== undefined) assertRateBp(d.vatBp);
      for (const x of d.deductions ?? []) {
        str(x.itemId, "deduction itemId");
        if (!Number.isSafeInteger(x.qtyMilli) || x.qtyMilli < 0) throw bad("deduction qtyMilli must be ≥ 0");
      }
      break;
    case "catalog.product_availability":
      if (typeof d.available !== "boolean") throw bad("available must be true or false");
      break;
    case "catalog.recipe_set":
      for (const x of d.lines ?? []) {
        str(x.itemId, "recipe itemId");
        if (!Number.isSafeInteger(x.qtyMilli) || x.qtyMilli < 0) throw bad("recipe qtyMilli must be ≥ 0");
      }
      if (!Number.isSafeInteger(d.yieldMilli) || d.yieldMilli <= 0) throw bad("yieldMilli must be positive");
      if (!Number.isSafeInteger(d.effectiveFrom)) throw bad("effectiveFrom must be Unix ms");
      break;
    case "day.closed":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.businessDate))) throw bad("businessDate must be YYYY-MM-DD");
      break;
    case "deadletter.resolved":
      str(d.how, "how");
      break;
    default:
      break;
  }
  return ev;
}

/**
 * The key a mark competes on (docs/03 §1).
 * @param {EventEnvelope} ev
 */
export function markKey(ev) {
  switch (ev.type) {
    case "settings.set":
      return `${ev.type}|${ev.entity}|${ev.data.path}`;
    case "kitchen.status":
      return `${ev.type}|${ev.entity}|${ev.data.sentEventId}|${ev.data.station}`;
    case "day.closed":
      return `${ev.type}|${ev.entity}|${ev.data.businessDate}`;
    default:
      return `${ev.type}|${ev.entity}`;
  }
}

/**
 * @typedef {object} MarksState
 * @property {Product} product
 * @property {Record<string, EventEnvelope>} winners the winning event per key
 * @property {Record<string, unknown>} settings defaults with the winning settings.set values
 * @property {{ categories: Record<string, any>, products: Record<string, any>, modifierGroups: Record<string, any>,
 *   recipes: Record<string, any>, setMenus: Record<string, any>, stockItems: Record<string, any> }} catalog
 * @property {{ profiles: Record<string, any>, pins: Record<string, any> }} staff
 * @property {{ zones: Record<string, any>, tables: Record<string, any> }} layout
 * @property {Record<string, { state: string, at: number }>} tableMarks
 * @property {Record<string, { orderId: string, sentEventId: string, station: string, status: string, at: number }>} kitchen
 * @property {Record<string, any>} devices
 * @property {Record<string, { at: number, staff: string | null }>} daysClosed by business date
 * @property {Record<string, { how: string, note: string, at: number, staff: string | null }>} deadletters by event id
 */

/**
 * @param {Product} product
 * @returns {MarksState}
 */
export function emptyMarks(product) {
  return derive(product, {});
}

/**
 * Folds marks into the state. Events that are not marks are ignored, so a whole log can be passed. Any order, any
 * batching gives the same state.
 * @param {MarksState} state
 * @param {EventEnvelope[]} events
 * @returns {MarksState}
 */
export function applyMarks(state, events) {
  const winners = { ...state.winners };
  for (const ev of events) {
    if (typeInfo(ev.type).kind !== "mark") continue;
    const key = markKey(ev);
    const cur = winners[key];
    if (!cur || compareEvents(cur, ev) < 0) winners[key] = ev;
  }
  return derive(state.product, winners);
}

/**
 * @param {Product} product
 * @param {Record<string, EventEnvelope>} winners
 * @returns {MarksState}
 */
function derive(product, winners) {
  /** @type {MarksState} */
  const s = {
    product,
    winners,
    settings: settingsDefaults(product),
    catalog: { categories: {}, products: {}, modifierGroups: {}, recipes: {}, setMenus: {}, stockItems: {} },
    staff: { profiles: {}, pins: {} },
    layout: { zones: {}, tables: {} },
    tableMarks: {},
    kitchen: {},
    devices: {},
    daysClosed: {},
    deadletters: {},
  };
  /** @type {Record<string, EventEnvelope>} */
  const availability = {};
  for (const ev of Object.values(winners)) {
    const d = ev.data;
    switch (ev.type) {
      case "settings.set":
        s.settings[d.path] = structuredClone(d.value);
        break;
      case "catalog.category_set":
        s.catalog.categories[ev.entity] = { id: ev.entity, ...d };
        break;
      case "catalog.product_set":
        s.catalog.products[ev.entity] = { id: ev.entity, ...d };
        break;
      case "catalog.product_availability":
        availability[ev.entity] = ev;
        break;
      case "catalog.modifier_group_set":
        s.catalog.modifierGroups[ev.entity] = { id: ev.entity, ...d };
        break;
      case "catalog.recipe_set":
        s.catalog.recipes[ev.entity] = { productId: ev.entity, ...d };
        break;
      case "catalog.set_menu_set":
        s.catalog.setMenus[ev.entity] = { productId: ev.entity, ...d };
        break;
      case "stock.item_set":
        s.catalog.stockItems[ev.entity] = { id: ev.entity, ...d };
        break;
      case "staff.set":
        s.staff.profiles[ev.entity] = { id: ev.entity, ...d };
        break;
      case "staff.pin_set":
        s.staff.pins[ev.entity] = { pinHash: d.pinHash, pinSalt: d.pinSalt, iterations: d.iterations, at: ev.at };
        break;
      case "zone.set":
        s.layout.zones[ev.entity] = { id: ev.entity, ...d };
        break;
      case "table.set":
        s.layout.tables[ev.entity] = { id: ev.entity, ...d };
        break;
      case "table.mark":
        s.tableMarks[ev.entity] = { state: d.state, at: ev.at };
        break;
      case "kitchen.status":
        s.kitchen[`${ev.entity}|${d.sentEventId}|${d.station}`] = {
          orderId: ev.entity,
          sentEventId: d.sentEventId,
          station: d.station,
          status: d.status,
          at: ev.at,
        };
        break;
      case "device.set":
        s.devices[ev.entity] = { id: ev.entity, ...d };
        break;
      case "day.closed":
        s.daysClosed[d.businessDate] = { at: ev.at, staff: ev.staff };
        break;
      case "deadletter.resolved":
        s.deadletters[ev.entity] = { how: d.how, note: typeof d.note === "string" ? d.note : "", at: ev.at, staff: ev.staff };
        break;
    }
  }
  // "86" from the till and the catalog's own `available` are two marks: the later one decides (docs/03 §1).
  for (const [id, product] of Object.entries(s.catalog.products)) {
    const a = availability[id];
    const set = winners[`catalog.product_set|${id}`];
    product.available = a && compareEvents(set, a) < 0 ? a.data.available : product.available !== false;
  }
  return s;
}

/**
 * The settings value at a path (defaults included).
 * @param {MarksState} state
 * @param {string} path
 */
export function setting(state, path) {
  if (!(path in state.settings)) throw new RangeError(`unknown setting ${path}`);
  return state.settings[path];
}
