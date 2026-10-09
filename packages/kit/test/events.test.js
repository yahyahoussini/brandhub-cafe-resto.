// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOUD_DEVICE, EVENT_TYPES, assertCanWrite, canWrite, validateEnvelope, validateMovement } from "../src/events.js";
import { ORDER_EVENT_TYPES } from "../src/order.js";
import { BANK_EVENT_TYPES } from "../src/bank.js";
import { newId, uuidv7 } from "../src/ids.js";

const good = () => ({
  id: uuidv7(1_764_486_000_000),
  type: "line.added",
  entity: newId("ord"),
  seq: 2,
  device: newId("dev"),
  staff: newId("stf"),
  at: 1_764_486_000_000,
  data: { lineId: "lin_x" },
  v: 1,
});

/** @param {Record<string, any>} patch @param {string} code */
const rejects = (patch, code) =>
  assert.throws(() => validateEnvelope({ ...good(), ...patch }), (/** @type {any} */ e) => e.code === code, JSON.stringify(patch));

test("a well-formed envelope passes", () => {
  const ev = good();
  assert.equal(validateEnvelope(ev), ev);
});

test("envelope fields are checked (docs/03 §4)", () => {
  rejects({ id: "not-a-uuid" }, "E_BAD_EVENT");
  rejects({ type: "order.exploded" }, "E_BAD_EVENT");
  rejects({ entity: newId("bnk") }, "E_BAD_EVENT"); // line.added belongs to an order
  rejects({ seq: 0 }, "E_BAD_EVENT");
  rejects({ seq: null }, "E_BAD_EVENT");
  rejects({ device: "dev_till1" }, "E_BAD_EVENT");
  rejects({ staff: "Sara" }, "E_BAD_EVENT");
  rejects({ at: "2026-11-30" }, "E_BAD_EVENT");
  rejects({ data: [] }, "E_BAD_EVENT");
  rejects({ v: 2 }, "E_BAD_EVENT");
  rejects({ extra: 1 }, "E_BAD_EVENT");
});

test("movements and marks have seq null", () => {
  const base = { ...good(), type: "stock.received", entity: newId("itm"), data: { qtyMilli: 1000 } };
  assert.ok(validateEnvelope({ ...base, seq: null }));
  assert.throws(() => validateEnvelope({ ...base, seq: 1 }), (/** @type {any} */ e) => e.code === "E_BAD_EVENT");
});

test("data above 16 KB is refused with E_TOO_LARGE (docs/04 §2)", () => {
  rejects({ data: { note: "x".repeat(16 * 1024) } }, "E_TOO_LARGE");
  assert.ok(validateEnvelope({ ...good(), data: { note: "x".repeat(16 * 1024 - 20) } }));
});

test("the cloud writes as dev_cloud; office events carry the owner account", () => {
  const office = validateEnvelope({ ...good(), type: "settings.set", entity: newId("tnt"), seq: null, device: CLOUD_DEVICE, staff: newId("own"), data: { path: "receipt.width", value: 32 } });
  assertCanWrite(office, "office");
  const block = validateEnvelope({ ...good(), type: "receipts.block_reserved", entity: newId("blk"), seq: null, device: CLOUD_DEVICE, staff: null, data: {} });
  assertCanWrite(block, "cloud");
  assert.throws(() => assertCanWrite(block, "till"), (/** @type {any} */ e) => e.code === "E_FORBIDDEN_TYPE");
  assert.throws(() => assertCanWrite({ ...office, staff: newId("stf") }, "office"), (/** @type {any} */ e) => e.code === "E_FORBIDDEN_TYPE");
});

test("device kinds write only their types (docs/04 §2)", () => {
  assert.equal(canWrite("line.added", "till"), true);
  assert.equal(canWrite("line.added", "screen"), false);
  assert.equal(canWrite("kitchen.status", "screen"), true);
  assert.equal(canWrite("settings.set", "till"), false);
  assert.equal(canWrite("staff.clock", "station"), true);
  assert.equal(canWrite("invoice.issued", "office"), false);
  const ev = validateEnvelope(good());
  assert.throws(() => assertCanWrite(ev, "screen"), (/** @type {any} */ e) => e.code === "E_FORBIDDEN_TYPE");
});

test("the registry covers every order and bank event of the kit, and every type of docs/03 §5", () => {
  for (const type of [...ORDER_EVENT_TYPES, ...BANK_EVENT_TYPES]) assert.equal(EVENT_TYPES[type]?.kind, "sequenced", type);
  const docs03 = [
    "tip.pool_opened", "tip.added", "tip.member_set", "tip.closed", "tip.adjusted",
    "machine.reading", "machine.off_till", "stock.counted", "stock.received", "stock.wasted", "stock.adjusted",
    "kredi.repaid", "staff.clock", "receipts.block_reserved", "receipts.block_abandoned", "invoice.issued", "z.closed",
    "catalog.category_set", "catalog.product_set", "catalog.product_availability", "catalog.modifier_group_set",
    "catalog.recipe_set", "catalog.set_menu_set", "stock.item_set", "staff.set", "staff.pin_set", "zone.set",
    "table.set", "table.mark", "kitchen.status", "settings.set", "device.set", "day.closed", "deadletter.resolved",
  ];
  for (const type of docs03) assert.ok(EVENT_TYPES[type], type);
  assert.equal(Object.keys(EVENT_TYPES).length, ORDER_EVENT_TYPES.length + BANK_EVENT_TYPES.length + docs03.length);
});

test("type names from Object.prototype are unknown types, with a code", () => {
  for (const type of ["toString", "constructor", "__proto__", "hasOwnProperty"]) rejects({ type }, "E_BAD_EVENT");
});

test("only the cloud writes the day Z; a bank's Z comes from the device that holds the bank", () => {
  const z = { ...good(), type: "z.closed", seq: null, data: { businessDate: "2026-11-30", totals: {}, hash: "0".repeat(64) } };
  const dayZ = validateEnvelope({ ...z, entity: newId("tnt") });
  assert.throws(() => assertCanWrite(dayZ, "till"), (/** @type {any} */ e) => e.code === "E_FORBIDDEN_TYPE");
  assertCanWrite({ ...dayZ, device: CLOUD_DEVICE, staff: null }, "cloud");
  assertCanWrite(validateEnvelope({ ...z, entity: newId("bnk") }), "till");
});

test("a paired device never signs with an owner account", () => {
  const ev = validateEnvelope({ ...good(), staff: newId("own") });
  assert.throws(() => assertCanWrite(ev, "till"), (/** @type {any} */ e) => e.code === "E_FORBIDDEN_TYPE");
});

test("movement payloads are checked before they are stored (E_BAD_DATA)", () => {
  const mv = (/** @type {string} */ type, /** @type {string} */ prefix, /** @type {any} */ data) => ({ ...good(), type, entity: newId(prefix), seq: null, data });
  const bad = (/** @type {any} */ ev) => assert.throws(() => validateMovement(validateEnvelope(ev)), (/** @type {any} */ e) => e.code === "E_BAD_DATA", ev.type);
  bad(mv("kredi.repaid", "cus", { amountCentimes: 12.5, tender: "cash", bankId: newId("bnk") }));
  bad(mv("kredi.repaid", "cus", { amountCentimes: 1000, tender: "cash" }));
  bad(mv("kredi.repaid", "cus", { amountCentimes: -1000, tender: "card_external" }));
  bad(mv("machine.reading", "mch", { reading: -3, kind: "open", businessDate: "2026-11-30" }));
  bad(mv("machine.reading", "mch", { reading: 3, kind: "open", businessDate: "2026-02-31" }));
  bad(mv("stock.received", "itm", { qtyMilli: "500" }));
  bad(mv("stock.wasted", "itm", { qtyMilli: -200, reason: "x" }));
  bad(mv("machine.off_till", "mch", { doses: 0, reason: "test" }));
  assert.ok(validateMovement(validateEnvelope(mv("kredi.repaid", "cus", { amountCentimes: 1000, tender: "cash", bankId: newId("bnk") }))));
  assert.ok(validateMovement(validateEnvelope(mv("stock.adjusted", "itm", { qtyMilli: -200, reason: "recount" }))));
});

test("a dead letter's resolution points at the rejected event's id", () => {
  const ev = { ...good(), type: "deadletter.resolved", entity: uuidv7(1), seq: null, device: CLOUD_DEVICE, staff: newId("own"), data: { how: "re-entered" } };
  assert.ok(validateEnvelope(ev));
});
