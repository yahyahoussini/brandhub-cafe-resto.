// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMarks, emptyMarks, markKey, setting, settingsDefaults, validateMark } from "../src/marks.js";
import { CLOUD_DEVICE } from "../src/events.js";
import { newId, uuidv7 } from "../src/ids.js";
import { seeded } from "./helpers.js";

const TNT = newId("tnt");
const OWNER = newId("own");
const TILL = newId("dev");
const SCREEN = newId("dev");

/**
 * @param {string} type @param {string} entity @param {Record<string, any>} data @param {number} at
 * @param {string} [device] @param {string | null} [staff]
 */
const mark = (type, entity, data, at, device = CLOUD_DEVICE, staff = OWNER) => ({ id: uuidv7(at), type, entity, seq: null, device, staff, at, data, v: 1 });

test("settings start from the docs/03 §8 defaults, per product", () => {
  const cafe = emptyMarks("cafe");
  assert.equal(setting(cafe, "service.mode"), "both");
  assert.equal(setting(cafe, "hours.businessDayCutoff"), "05:00");
  assert.deepEqual(setting(cafe, "reports.thresholds"), { cashGapCentimes: 2000, dose: { minDoses: 5, relativeBp: 300 } });
  assert.equal(setting(cafe, "printing.barTicketOnPayment"), true);
  const resto = emptyMarks("resto");
  assert.equal(setting(resto, "service.mode"), "waiter");
  assert.deepEqual(setting(resto, "service.zones"), ["salle"]);
  assert.equal(setting(resto, "printing.barTicketOnPayment"), false);
  assert.deepEqual(setting(cafe, "taxes.byMode"), { takeaway: null, delivery: null }, "VAT by mode waits for the accountant");
  assert.equal(Object.keys(settingsDefaults("cafe")).length, Object.keys(settingsDefaults("resto")).length);
});

test("settings.set wins per path, the latest by (at, device, id)", () => {
  const s = applyMarks(emptyMarks("cafe"), [
    mark("settings.set", TNT, { path: "receipt.width", value: 32 }, 2000),
    mark("settings.set", TNT, { path: "receipt.width", value: 48 }, 1000),
    mark("settings.set", TNT, { path: "hours.businessDayCutoff", value: "04:00" }, 1500),
  ]);
  assert.equal(setting(s, "receipt.width"), 32);
  assert.equal(setting(s, "hours.businessDayCutoff"), "04:00", "another path is not overwritten");
});

test("ties on `at` are broken by device, then id", () => {
  const a = mark("table.mark", newId("tbl"), { state: "cleaning" }, 1000, newId("dev"));
  const b = { ...a, id: uuidv7(1000), device: a.device.replace(/.$/, (c) => (c === "f" ? "e" : "f")), data: { state: "free" } };
  const winner = a.device > b.device ? a : b;
  for (const order of [[a, b], [b, a]]) assert.equal(applyMarks(emptyMarks("cafe"), order).tableMarks[a.entity].state, winner.data.state);
});

test("staff.set and staff.pin_set never overwrite each other", () => {
  const stf = newId("stf");
  const s = applyMarks(emptyMarks("cafe"), [
    mark("staff.set", stf, { displayName: "Sara", role: "cashier", canApprove: false, active: true, lang: "fr" }, 1000),
    mark("staff.pin_set", stf, { pinHash: "h", pinSalt: "s", iterations: 100000 }, 2000, TILL, stf),
    mark("staff.set", stf, { displayName: "Sara B.", role: "cashier", canApprove: false, active: true, lang: "ar" }, 3000),
  ]);
  assert.equal(s.staff.profiles[stf].displayName, "Sara B.");
  assert.equal(s.staff.pins[stf].pinHash, "h");
});

test("kitchen.status is kept per sent event and station", () => {
  const ord = newId("ord");
  const sentA = uuidv7(1);
  const sentB = uuidv7(2);
  const s = applyMarks(emptyMarks("resto"), [
    mark("kitchen.status", ord, { sentEventId: sentA, station: "chaud", status: "ready" }, 3000, SCREEN, null),
    mark("kitchen.status", ord, { sentEventId: sentA, station: "froid", status: "preparing" }, 2000, SCREEN, null),
    mark("kitchen.status", ord, { sentEventId: sentB, station: "chaud", status: "new" }, 2500, SCREEN, null),
  ]);
  assert.equal(Object.keys(s.kitchen).length, 3);
  assert.equal(s.kitchen[`${ord}|${sentA}|chaud`].status, "ready");
});

test("an 86 from the till and the catalog's own availability: the later one decides", () => {
  const prd = newId("prd");
  const set = mark("catalog.product_set", prd, { name: { fr: "Msemen", ar: "مسمن" }, priceCentimes: 500, vatBp: 1000, available: true }, 1000);
  const out = mark("catalog.product_availability", prd, { available: false }, 2000, TILL, newId("stf"));
  assert.equal(applyMarks(emptyMarks("cafe"), [set, out]).catalog.products[prd].available, false);
  const back = mark("catalog.product_set", prd, { ...set.data, priceCentimes: 600 }, 3000);
  assert.equal(applyMarks(emptyMarks("cafe"), [set, out, back]).catalog.products[prd].available, true);
});

test("day.closed is kept per business day", () => {
  const s = applyMarks(emptyMarks("cafe"), [
    mark("day.closed", TNT, { businessDate: "2026-11-30" }, 1000, TILL, newId("stf")),
    mark("day.closed", TNT, { businessDate: "2026-12-01" }, 2000, TILL, newId("stf")),
  ]);
  assert.deepEqual(Object.keys(s.daysClosed).sort(), ["2026-11-30", "2026-12-01"]);
});

test("mark payloads are checked", () => {
  const bad = (/** @type {any} */ ev) => assert.throws(() => validateMark(ev), (/** @type {any} */ e) => e.code === "E_BAD_DATA");
  bad(mark("settings.set", TNT, { path: "nope", value: 1 }, 1));
  bad(mark("settings.set", TNT, { path: "hours.businessDayCutoff", value: "25:00" }, 1));
  bad(mark("table.mark", newId("tbl"), { state: "dirty" }, 1));
  bad(mark("staff.set", newId("stf"), { displayName: "X", role: "boss" }, 1));
  bad(mark("catalog.category_set", newId("cat"), { name: { fr: "Cafés", ar: "القهوة" }, taxClass: "alcohol" }, 1));
  bad(mark("catalog.product_set", newId("prd"), { name: { fr: "A", ar: "ب" }, priceCentimes: 9.5 }, 1));
  assert.ok(validateMark(mark("catalog.category_set", newId("cat"), { name: { fr: "Cafés", ar: "القهوة" }, station: "bar", taxClass: "drink", course: 1 }, 1)));
  assert.ok(validateMark(mark("catalog.product_set", newId("prd"), { name: { fr: "A", ar: "ب" }, priceCentimes: null, vatBp: null }, 1)), "a template product has no price yet");
});

test("settings values outside docs/03 §8 are refused", () => {
  const bad = (/** @type {string} */ path, /** @type {unknown} */ value) =>
    assert.throws(() => validateMark(mark("settings.set", TNT, { path, value }, 1)), (/** @type {any} */ e) => e.code === "E_BAD_DATA", `${path}=${JSON.stringify(value)}`);
  bad("taxes.defaultVatBp", 5000);
  bad("receipt.width", 33);
  bad("service.mode", "self");
  bad("lock.tillSeconds", -5);
  bad("approvals.discountCapBp", { cashier: "20%" });
  bad("approvals.freeReprints", "deux");
  bad("approvals.freeReprints", 2.5);
  bad("permissions", { fly: {} });
  bad("permissions", { discount: { capBp: { manager: "max" } } });
  bad("reports.thresholds", { cashGapCentimes: "x" });
  bad("__proto__", { x: 1 });
  bad("toString", 1);
  assert.throws(() => setting(emptyMarks("cafe"), "toString"), RangeError);
});

test("catalog, staff and day payloads keep money whole and flags boolean", () => {
  const bad = (/** @type {any} */ ev) => assert.throws(() => validateMark(ev), (/** @type {any} */ e) => e.code === "E_BAD_DATA", ev.type);
  bad(mark("catalog.product_set", newId("prd"), { name: { fr: "A", ar: "ب" }, priceCentimes: 500, priceByZone: { zon_x: 12.5 } }, 1));
  bad(mark("catalog.product_set", newId("prd"), { name: { fr: "A", ar: "ب" }, priceCentimes: 500, available: "false" }, 1));
  bad(mark("catalog.modifier_group_set", newId("mod"), { name: { fr: "Sucre", ar: "سكر" }, options: [{ id: "o", priceCentimes: 2.5 }] }, 1));
  bad(mark("stock.item_set", newId("itm"), { name: "Café", costCentimes: 0.3 }, 1));
  bad(mark("staff.set", newId("stf"), { displayName: "Ali", role: "waiter", active: 0 }, 1));
  bad(mark("day.closed", TNT, { businessDate: "2026-02-31" }, 1));
});

test("every catalog mark reaches its projection", () => {
  const mod = newId("mod");
  const prd = newId("prd");
  const itm = newId("itm");
  const s = applyMarks(emptyMarks("resto"), [
    mark("catalog.modifier_group_set", mod, { name: { fr: "Sucre", ar: "سكر" }, min: 0, max: 1, options: [{ id: "o1", name: { fr: "Sans", ar: "بدون" }, priceCentimes: 0 }] }, 1),
    mark("catalog.set_menu_set", prd, { steps: [], priceCentimes: 9000 }, 1),
    mark("catalog.recipe_set", prd, { lines: [], yieldMilli: 1000, effectiveFrom: 1 }, 1),
    mark("stock.item_set", itm, { name: "Café", unit: "g", costCentimes: 25 }, 1),
  ]);
  assert.equal(s.catalog.modifierGroups[mod].max, 1);
  assert.equal(s.catalog.setMenus[prd].priceCentimes, 9000);
  assert.equal(s.catalog.recipes[prd].yieldMilli, 1000);
  assert.equal(s.catalog.stockItems[itm].unit, "g");
});

test("a mark's data never overrides its entity id", () => {
  const prd = newId("prd");
  const s = applyMarks(emptyMarks("cafe"), [mark("catalog.product_set", prd, { id: "prd_other", name: { fr: "A", ar: "ب" }, priceCentimes: 1 }, 1)]);
  assert.equal(s.catalog.products[prd].id, prd);
});

test("property: any order and any batching of marks gives the same state", () => {
  const rng = seeded(7);
  const entities = { tbl: [newId("tbl"), newId("tbl")], prd: [newId("prd"), newId("prd")], stf: [newId("stf")] };
  const devices = [newId("dev"), newId("dev"), CLOUD_DEVICE];
  for (let round = 0; round < 40; round++) {
    /** @type {any[]} */
    const events = [];
    for (let i = 0; i < 30; i++) {
      const at = 1000 + rng.int(20); // many ties on purpose
      const device = devices[rng.int(devices.length)];
      const pick = rng.int(5);
      if (pick === 0) events.push(mark("table.mark", entities.tbl[rng.int(2)], { state: rng.int(2) ? "free" : "cleaning" }, at, device));
      else if (pick === 1) events.push(mark("settings.set", TNT, { path: rng.int(2) ? "receipt.width" : "approvals.freeReprints", value: rng.int(4) }, at, device));
      else if (pick === 2) events.push(mark("catalog.product_set", entities.prd[rng.int(2)], { name: { fr: "P", ar: "ب" }, priceCentimes: rng.int(9) * 100, available: true }, at, device));
      else if (pick === 3) events.push(mark("catalog.product_availability", entities.prd[rng.int(2)], { available: rng.int(2) === 1 }, at, device));
      else events.push(mark("staff.set", entities.stf[0], { displayName: `S${rng.int(9)}`, role: "waiter" }, at, device));
    }
    const reference = applyMarks(emptyMarks("cafe"), events);
    const shuffled = rng.shuffle(events);
    const cut = rng.int(shuffled.length);
    const batched = applyMarks(applyMarks(emptyMarks("cafe"), shuffled.slice(0, cut)), shuffled.slice(cut));
    const strip = (/** @type {any} */ s) => ({ ...s, winners: Object.fromEntries(Object.entries(s.winners).sort()) });
    assert.deepEqual(strip(batched), strip(reference), `round ${round}`);
  }
});

test("markKey separates what docs/03 §1 separates", () => {
  const a = mark("settings.set", TNT, { path: "receipt.width", value: 32 }, 1);
  const b = mark("settings.set", TNT, { path: "receipt.footer", value: [] }, 1);
  assert.notEqual(markKey(a), markKey(b));
});
