// @ts-check
/**
 * The event envelope and the type registry (docs/03 §4–§5, D20). Every device, the Station and the cloud call
 * `validateEnvelope` before anything else; the sync API then checks the writer's device kind with `canWrite`, and the
 * aggregate rules (order.js, bank.js) or the mark and movement schemas run after.
 *
 * Writers:
 * - `till`, `phone`, `screen`, `station`: paired devices, `device` is their own `dev_…`;
 * - `office`: the back office, an owner or manager session (`staff` is their `own_…`), written by the Worker as
 *   `dev_cloud`;
 * - `cloud`: system events of the Worker (`dev_cloud`, `staff` null): receipt blocks, invoices, the day Z.
 */

import { isEntityId, isUuidv7 } from "./ids.js";
import { assertCentimes } from "./money.js";
import { TENDERS } from "./order.js";

export class EventError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "EventError";
    this.code = code;
  }
}

/** The cloud's writer id (docs/03 §2). */
export const CLOUD_DEVICE = "dev_cloud";
export const ENVELOPE_VERSION = 1;
/** docs/04 §2: each event's data ≤ 16 KB. */
export const MAX_DATA_BYTES = 16 * 1024;

export const DEVICE_KINDS = Object.freeze(/** @type {const} */ (["till", "phone", "screen", "station", "office", "cloud"]));
/** @typedef {(typeof DEVICE_KINDS)[number]} DeviceKind */
/** @typedef {"sequenced" | "movement" | "mark"} EventKind */
/**
 * @typedef {{ prefixes: readonly string[], kind: EventKind, writers: readonly DeviceKind[],
 *   writersByPrefix?: Readonly<Record<string, readonly DeviceKind[]>> }} TypeInfo
 */

const SALE = /** @type {const} */ (["till", "phone"]);
const FLOOR = /** @type {const} */ (["till", "phone", "office"]);

/**
 * @param {string | readonly string[]} prefixes
 * @param {EventKind} kind
 * @param {readonly DeviceKind[]} writers
 * @param {Record<string, readonly DeviceKind[]>} [writersByPrefix] when the writer depends on the entity
 * @returns {TypeInfo}
 */
const def = (prefixes, kind, writers, writersByPrefix = undefined) =>
  Object.freeze({
    prefixes: Object.freeze(typeof prefixes === "string" ? [prefixes] : [...prefixes]),
    kind,
    writers,
    ...(writersByPrefix ? { writersByPrefix: Object.freeze(writersByPrefix) } : {}),
  });

/**
 * docs/03 §5. `prefixes` is the entity's id prefix ("uuid" for `deadletter.resolved`, whose entity is the rejected
 * event's id).
 * @type {Readonly<Record<string, TypeInfo>>}
 */
export const EVENT_TYPES = Object.freeze({
  // Order — sequenced (order.js)
  "order.opened": def("ord", "sequenced", SALE),
  "line.added": def("ord", "sequenced", SALE),
  "line.qty_changed": def("ord", "sequenced", SALE),
  "line.voided": def("ord", "sequenced", SALE),
  "lines.sent": def("ord", "sequenced", SALE),
  "lines.fired": def("ord", "sequenced", SALE),
  "discount.set": def("ord", "sequenced", SALE),
  "discount.cleared": def("ord", "sequenced", SALE),
  "order.moved": def("ord", "sequenced", SALE),
  "order.covers_set": def("ord", "sequenced", SALE),
  "order.note_set": def("ord", "sequenced", SALE),
  "payment.added": def("ord", "sequenced", SALE),
  "payment.voided": def("ord", "sequenced", SALE),
  "order.closed": def("ord", "sequenced", SALE),
  "order.voided": def("ord", "sequenced", SALE),
  "order.transferred": def("ord", "sequenced", SALE),
  "order.taken_over": def("ord", "sequenced", SALE),
  "order.customer_set": def("ord", "sequenced", SALE),
  "lines.moved_out": def("ord", "sequenced", SALE),
  "lines.moved_in": def("ord", "sequenced", SALE),
  // Bank — sequenced (bank.js)
  "bank.opened": def("bnk", "sequenced", SALE),
  "bank.cash_in": def("bnk", "sequenced", SALE),
  "bank.cash_out": def("bnk", "sequenced", SALE),
  "bank.no_sale": def("bnk", "sequenced", SALE),
  "bank.reprint": def("bnk", "sequenced", SALE),
  "bank.counted": def("bnk", "sequenced", SALE),
  "bank.closed": def("bnk", "sequenced", SALE),
  "bank.taken_over": def("bnk", "sequenced", SALE),
  // Tip pool — sequenced (V1.1, prompt 21)
  "tip.pool_opened": def("tip", "sequenced", ["till", "office"]),
  "tip.added": def("tip", "sequenced", ["till", "office"]),
  "tip.member_set": def("tip", "sequenced", ["till", "office"]),
  "tip.closed": def("tip", "sequenced", ["till", "office"]),
  "tip.adjusted": def("tip", "sequenced", ["till", "office"]),
  // Movements
  "machine.reading": def("mch", "movement", FLOOR),
  "machine.off_till": def("mch", "movement", SALE),
  "stock.counted": def("itm", "movement", FLOOR),
  "stock.received": def("itm", "movement", FLOOR),
  "stock.wasted": def("itm", "movement", FLOOR),
  "stock.adjusted": def("itm", "movement", FLOOR),
  "kredi.repaid": def("cus", "movement", SALE),
  "staff.clock": def("stf", "movement", ["till", "phone", "station"]),
  "receipts.block_reserved": def("blk", "movement", ["cloud"]),
  "receipts.block_abandoned": def("blk", "movement", ["cloud"]),
  "invoice.issued": def("inv", "movement", ["cloud"]),
  // a bank's Z by the device that holds the bank; the day Z by the cloud only (it knows the open dead letters)
  "z.closed": def(["bnk", "tnt"], "movement", ["till", "phone", "cloud"], { bnk: ["till", "phone"], tnt: ["cloud"] }),
  // Marks (marks.js)
  "catalog.category_set": def("cat", "mark", ["office"]),
  "catalog.product_set": def("prd", "mark", ["office"]),
  "catalog.product_availability": def("prd", "mark", ["till", "phone", "screen", "office"]),
  "catalog.modifier_group_set": def("mod", "mark", ["office"]),
  "catalog.recipe_set": def("prd", "mark", ["office"]),
  "catalog.set_menu_set": def("prd", "mark", ["office"]),
  "stock.item_set": def("itm", "mark", ["office"]),
  "staff.set": def("stf", "mark", ["office"]),
  "staff.pin_set": def("stf", "mark", FLOOR),
  "zone.set": def("zon", "mark", ["office"]),
  "table.set": def("tbl", "mark", ["office"]),
  "table.mark": def("tbl", "mark", SALE),
  "kitchen.status": def("ord", "mark", ["screen", "till", "phone"]),
  "settings.set": def("tnt", "mark", ["office"]),
  "device.set": def("dev", "mark", ["office", "cloud"]),
  "day.closed": def("tnt", "mark", ["till", "office"]),
  "deadletter.resolved": def("uuid", "mark", ["till", "office"]),
});

/** @param {string} code @param {string} message */
function fail(code, message) {
  return new EventError(code, message);
}

/**
 * @typedef {object} EventEnvelope
 * @property {string} id
 * @property {string} type
 * @property {string} entity
 * @property {number | null} seq
 * @property {string} device
 * @property {string | null} staff
 * @property {number} at
 * @property {Record<string, any>} data
 * @property {number} v
 */

/**
 * @param {string} type
 * @returns {TypeInfo}
 */
export function typeInfo(type) {
  const info = typeof type === "string" && Object.hasOwn(EVENT_TYPES, type) ? EVENT_TYPES[type] : undefined;
  if (!info) throw fail("E_BAD_EVENT", `unknown event type ${type}`);
  return info;
}

/** @param {unknown} v */
function isWriter(v) {
  return v === CLOUD_DEVICE || isEntityId(v, "dev");
}

/**
 * Checks the envelope of docs/03 §4 and the type's entity and seq rules. Throws an EventError coded E_BAD_EVENT,
 * E_TOO_LARGE (data above 16 KB) or E_BAD_DATA. Returns the event (typed) when valid.
 * @param {unknown} input
 * @returns {EventEnvelope}
 */
export function validateEnvelope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("E_BAD_EVENT", "event must be an object");
  const ev = /** @type {Record<string, any>} */ (input);
  if (!isUuidv7(ev.id)) throw fail("E_BAD_EVENT", "id must be a UUIDv7");
  if (typeof ev.type !== "string") throw fail("E_BAD_EVENT", "type is required");
  const info = typeInfo(ev.type);
  const entityOk = info.prefixes.some((p) => (p === "uuid" ? isUuidv7(ev.entity) : isEntityId(ev.entity, p)));
  if (!entityOk) throw fail("E_BAD_EVENT", `${ev.type} needs an entity ${info.prefixes.join(" or ")}_…, got ${String(ev.entity)}`);
  if (info.kind === "sequenced") {
    if (!Number.isSafeInteger(ev.seq) || ev.seq < 1) throw fail("E_BAD_EVENT", "seq must be a positive integer");
  } else if (ev.seq !== null) {
    throw fail("E_BAD_EVENT", `${info.kind} events have seq null`);
  }
  if (!isWriter(ev.device)) throw fail("E_BAD_EVENT", "device must be dev_… or dev_cloud");
  if (!(ev.staff === null || isEntityId(ev.staff, "stf") || isEntityId(ev.staff, "own"))) {
    throw fail("E_BAD_EVENT", "staff must be stf_…, own_… or null");
  }
  if (!Number.isSafeInteger(ev.at) || ev.at <= 0) throw fail("E_BAD_EVENT", "at must be Unix milliseconds");
  if (!ev.data || typeof ev.data !== "object" || Array.isArray(ev.data)) throw fail("E_BAD_EVENT", "data must be an object");
  if (ev.v !== ENVELOPE_VERSION) throw fail("E_BAD_EVENT", `v must be ${ENVELOPE_VERSION}`);
  const extra = Object.keys(ev).filter((k) => !ENVELOPE_KEYS.has(k));
  if (extra.length) throw fail("E_BAD_EVENT", `unknown envelope field ${extra.join(", ")}`);
  let size;
  try {
    size = new TextEncoder().encode(JSON.stringify(ev.data)).length;
  } catch {
    throw fail("E_BAD_DATA", "data must be JSON");
  }
  if (size > MAX_DATA_BYTES) throw fail("E_TOO_LARGE", `data is ${size} bytes; the limit is ${MAX_DATA_BYTES}`);
  return /** @type {EventEnvelope} */ (ev);
}

const ENVELOPE_KEYS = new Set(["id", "type", "entity", "seq", "device", "staff", "at", "data", "v"]);

/**
 * Whether a device kind may write a type (docs/04 §2: "the type is allowed for the device kind").
 * @param {string} type
 * @param {DeviceKind} kind
 */
export function canWrite(type, kind) {
  return typeInfo(type).writers.includes(kind);
}

/**
 * Throws E_FORBIDDEN_TYPE when the device kind may not write the type. A Station relaying a device's event is checked
 * against the device's kind, not its own.
 * @param {EventEnvelope} ev
 * @param {DeviceKind} kind
 */
export function assertCanWrite(ev, kind) {
  if (!DEVICE_KINDS.includes(kind)) throw fail("E_BAD_DATA", `unknown device kind ${kind}`);
  const info = typeInfo(ev.type);
  const writers = info.writersByPrefix?.[ev.entity.slice(0, ev.entity.indexOf("_"))] ?? info.writers;
  if (!writers.includes(kind)) throw fail("E_FORBIDDEN_TYPE", `a ${kind} cannot write ${ev.type} on ${ev.entity}`);
  if ((kind === "office" || kind === "cloud") !== (ev.device === CLOUD_DEVICE)) {
    throw fail("E_FORBIDDEN_TYPE", `${kind} events are written as ${kind === "office" || kind === "cloud" ? CLOUD_DEVICE : "the device itself"}`);
  }
  if (kind === "office" && !isEntityId(ev.staff, "own")) throw fail("E_FORBIDDEN_TYPE", "office events carry the owner account (own_…)");
  if (kind === "cloud" && ev.staff !== null) throw fail("E_FORBIDDEN_TYPE", "cloud events have no staff");
  if (kind !== "office" && kind !== "cloud" && isEntityId(ev.staff, "own")) {
    throw fail("E_FORBIDDEN_TYPE", "a paired device writes with the PIN session's stf_…, not an owner account");
  }
}

/** @param {string} message */
function badData(message) {
  return fail("E_BAD_DATA", message);
}

/** @param {unknown} v @param {string} what @param {{ min?: number, nonZero?: boolean }} [o] */
function int(v, what, o = {}) {
  if (!Number.isSafeInteger(v)) throw badData(`${what} must be an integer`);
  if (o.min !== undefined && /** @type {number} */ (v) < o.min) throw badData(`${what} must be ≥ ${o.min}`);
  if (o.nonZero && v === 0) throw badData(`${what} cannot be 0`);
  return /** @type {number} */ (v);
}

/** @param {unknown} v @param {string} what */
function money(v, what) {
  try {
    assertCentimes(v, what);
  } catch (e) {
    throw badData(/** @type {Error} */ (e).message);
  }
  return /** @type {number} */ (v);
}

/** @param {unknown} v */
function isDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
}

/**
 * Validates the payload of a movement (docs/03 §5 movements table; docs/04 §2 "movements and marks: schema only").
 * Throws an EventError coded E_BAD_DATA. Events are never edited (D20): a bad movement must be refused before it is
 * stored.
 * @param {EventEnvelope} ev
 */
export function validateMovement(ev) {
  if (typeInfo(ev.type).kind !== "movement") throw fail("E_BAD_EVENT", `${ev.type} is not a movement`);
  const d = ev.data;
  switch (ev.type) {
    case "machine.reading":
      int(d.reading, "reading", { min: 0 });
      if (!["open", "close", "check"].includes(d.kind)) throw badData("kind must be open, close or check");
      if (!isDate(d.businessDate)) throw badData("businessDate must be a real YYYY-MM-DD date");
      break;
    case "machine.off_till":
      int(d.doses, "doses", { min: 1 });
      if (!["test", "staff", "offered", "purge"].includes(d.reason)) throw badData("reason must be test, staff, offered or purge");
      break;
    case "stock.counted":
    case "stock.received":
    case "stock.wasted":
      int(d.qtyMilli, "qtyMilli", { min: 0 });
      if (ev.type === "stock.received" && d.costCentimes != null && money(d.costCentimes, "costCentimes") < 0) throw badData("cost cannot be negative");
      if (ev.type === "stock.wasted" && (typeof d.reason !== "string" || !d.reason)) throw badData("a reason is required");
      break;
    case "stock.adjusted":
      int(d.qtyMilli, "qtyMilli", { nonZero: true });
      if (typeof d.reason !== "string" || !d.reason) throw badData("a reason is required");
      break;
    case "kredi.repaid":
      money(d.amountCentimes, "amountCentimes");
      if (d.amountCentimes === 0) throw badData("amount cannot be 0");
      if (!TENDERS.includes(d.tender) || d.tender === "credit") throw badData("tender must be a real tender, not credit");
      if (d.tender === "cash" && !isEntityId(d.bankId, "bnk")) throw badData("a cash repayment names the open bank (bankId)");
      if (d.amountCentimes < 0 && !d.approvedBy) throw badData("money given back needs approvedBy");
      break;
    case "staff.clock":
      if (d.kind !== "in" && d.kind !== "out") throw badData("kind must be in or out");
      break;
    case "receipts.block_reserved":
      if (!isEntityId(d.deviceId, "dev")) throw badData("deviceId must be dev_…");
      if (typeof d.prefix !== "string" || !/^T?[CS]\d{1,3}$/.test(d.prefix)) throw badData("prefix must be C1, S1…");
      if (int(d.end, "end", { min: 1 }) < int(d.start, "start", { min: 1 })) throw badData("end must be ≥ start");
      break;
    case "receipts.block_abandoned":
      int(d.from, "from", { min: 1 });
      break;
    case "z.closed":
      if (!isDate(d.businessDate)) throw badData("businessDate must be a real YYYY-MM-DD date");
      if (!d.totals || typeof d.totals !== "object") throw badData("totals are required");
      if (typeof d.hash !== "string" || !/^[0-9a-f]{64}$/.test(d.hash)) throw badData("hash must be a SHA-256");
      break;
    default:
      break;
  }
  return ev;
}

/** @param {string} type */
export function isSequenced(type) {
  return typeInfo(type).kind === "sequenced";
}

/**
 * Sort key that every store agrees on for events of one aggregate or for marks: (at, device, id).
 * @param {{ at: number, device: string, id: string }} a
 * @param {{ at: number, device: string, id: string }} b
 */
export function compareEvents(a, b) {
  if (a.at !== b.at) return a.at - b.at;
  if (a.device !== b.device) return a.device < b.device ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
