// @ts-check
/**
 * Prompt 04 step 4, inside workerd: the TenantStore Durable Object over RPC, reached through `jurisdictionStore` as the
 * products' Workers reach it.
 * - (b) the café acceptance day of docs/01 §6, built by the kit's own fixture (packages/kit/test/acceptance-day-events.js)
 *   and pushed by its till and its phone in the batches they would send, gives the kit's daily report, deep-equal;
 * - (a) two clients are isolated: B's pull, verify, rebuild and day never see A's events;
 * - (c) a duplicate batch is acknowledged without new rows;
 * - (d) a tampered row makes `verify` fail at exactly its position;
 * - (e) `rebuild()` gives identical projections and leaves the log as it was;
 * - (f) refused events land in the dead letters with their code (docs/04 §5), and nowhere else.
 * The rules one by one are covered on node:sqlite by store.test.js (the same code); test/tenant-store.spec.js covers
 * the schema at start and a restart.
 */
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { newId, uuidv7 } from "@brandhub/kit/ids";
import { buildDay } from "@brandhub/kit/reports";
import { localDate } from "@brandhub/kit/timezone";
import { cafeAcceptanceDay } from "../../kit/test/acceptance-day-events.js";
import { LOG_TABLES, PROJECTION_TABLES } from "../src/projections.js";
import { MAX_BATCH_BYTES, MAX_BATCH_EVENTS } from "../src/sync-rules.js";
import { PRODUCTS, venue } from "./fixtures.js";
import { OFFICE, addOwner, api, codes, count, dump, officeEvent, rows, storeOf } from "./workerd.js";

/** @typedef {import("@brandhub/kit/events").EventEnvelope} EventEnvelope */
/** @typedef {import("../src/sync-rules.js").Caller} Caller */
/** @typedef {import("./workerd.js").Stub} Stub */
/** @typedef {{ caller: Caller, events: EventEnvelope[] }} Push */

/**
 * The business day of the specs: three days ago. The kit's own test uses 2026-11-30, which is ahead of the server's
 * clock here; the store would flag those events (docs/04 §6) and count them at their reception time.
 */
const pastDate = () => localDate(Date.now() - 3 * 86_400_000);

/**
 * The day's events in the batches its devices push: a device pushes what it has just written, so a batch is a run of
 * consecutive events of one device on one aggregate (a sale, a bank operation, a dose reading).
 * @param {EventEnvelope[]} events
 * @param {Record<string, Caller>} callers device id → caller
 * @returns {Push[]}
 */
function pushesOf(events, callers) {
  /** @type {Push[]} */
  const out = [];
  for (const ev of events) {
    const last = out.at(-1);
    if (last && last.caller.device === ev.device && last.events[last.events.length - 1].entity === ev.entity)
      last.events.push(ev);
    else out.push({ caller: callers[ev.device], events: [ev] });
  }
  return out;
}

/**
 * A new client whose back office pairs the acceptance day's till (C1) and phone (S1) and adds its three staff members
 * (device.set / staff.set, as prompt 05 will write them), then the day pushed batch by batch.
 * @param {{ date?: string, pushes?: number }} [o] `pushes`: push only the first n batches
 */
async function acceptanceDayStore(o = {}) {
  const date = o.date ?? pastDate();
  const day = cafeAcceptanceDay({ date });
  const { TILL, PHONE, SARA, ALI, KARIM } = day.ids;
  const tenant = newId("tnt");
  const owner = newId("own");
  const stub = storeOf(tenant);
  await addOwner(stub, owner);

  const t0 = day.at(6, 0);
  const setup = [
    officeEvent(owner, "device.set", TILL, { name: "Caisse 1", kind: "till", prefix: "C1" }, t0),
    officeEvent(owner, "device.set", PHONE, { name: "Serveur 1", kind: "phone", prefix: "S1" }, t0 + 1),
    officeEvent(
      owner,
      "staff.set",
      SARA,
      { displayName: "Sara", role: "cashier", canApprove: false, active: true },
      t0 + 2,
    ),
    officeEvent(
      owner,
      "staff.set",
      ALI,
      { displayName: "Ali", role: "waiter", canApprove: false, active: true },
      t0 + 3,
    ),
    officeEvent(
      owner,
      "staff.set",
      KARIM,
      { displayName: "Karim", role: "manager", canApprove: true, active: true },
      t0 + 4,
    ),
  ];
  const registered = await api(stub).append(setup, OFFICE);
  expect(registered).toMatchObject({ accepted: setup.map((e) => e.id), duplicates: [], rejected: [] });

  const events = day.events();
  /** @type {Record<string, Caller>} */
  const callers = { [TILL]: { device: TILL, kind: "till" }, [PHONE]: { device: PHONE, kind: "phone" } };
  const pushes = pushesOf(events, callers).slice(0, o.pushes);
  for (const p of pushes) {
    const r = await api(stub).append(p.events, p.caller);
    expect(r.rejected).toEqual([]);
    expect(r.accepted).toEqual(p.events.map((e) => e.id));
  }
  const pushed = pushes.flatMap((p) => p.events);
  return { stub, tenant, date, day, setup, events, pushes, pushed, kit: buildDay(pushed, { businessDate: date }) };
}

/** @param {Stub} stub @param {string[]} ids */
const storedAmong = async (stub, ids) =>
  (
    await rows(
      stub,
      "SELECT COUNT(*) AS n FROM events WHERE id IN (SELECT value FROM json_each(?))",
      JSON.stringify(ids),
    )
  )[0].n;

describe("TenantStore (prompt 04 step 4)", () => {
  it("(b) the café acceptance day, pushed by its till and phone, gives the kit's daily report", async () => {
    const s = await acceptanceDayStore();
    // several batches, from both devices, the whole day
    expect(s.pushes.length).toBeGreaterThan(10);
    expect(new Set(s.pushes.map((p) => p.caller.kind))).toEqual(new Set(["till", "phone"]));
    expect(s.pushed).toEqual(s.events);
    // the Z numbers of docs/01 §6 (acceptance-day.test.js asserts them on the kit): the comparison is not between two
    // empty days
    expect(s.kit).toMatchObject({
      revenueCentimes: 10600,
      vatCentimes: 963,
      averageTicketCentimes: 2650,
      tickets: { count: 4 },
      tenders: { cash: 5500, card_external: 2700, maroc_pay: 2400 },
      noSales: 1,
      doses: { machineDoses: 8, sold: 5, offTill: 1, gapDoses: 2 },
    });
    expect(s.kit.banks.find((b) => b.id === s.day.ids.TILL_BANK)).toMatchObject({
      expectedCentimes: 52500,
      gapCentimes: -500,
    });

    // computed from the projections on the first call (the day is dirty), then read back from the daily projection
    expect(await api(s.stub).dailyReport(s.date)).toStrictEqual(s.kit);
    expect(await api(s.stub).dailyReport(s.date)).toStrictEqual(s.kit);
    expect(await rows(s.stub, "SELECT revenue, tickets, dirty FROM daily WHERE business_date = ?", s.date)).toEqual([
      { revenue: 10600, tickets: 4, dirty: 0 },
    ]);

    // every event stored once, in push order, none refused, none flagged for its clock, the chain intact
    const log = await rows(s.stub, "SELECT pos, id FROM events ORDER BY pos");
    expect(log.map((r) => r.id)).toEqual([...s.setup, ...s.events].map((e) => e.id));
    expect(log.map((r) => r.pos)).toEqual(log.map((_r, i) => i + 1));
    expect(await count(s.stub, "deadletter")).toBe(0);
    expect(await rows(s.stub, "SELECT COUNT(*) AS n FROM events WHERE clock_skew <> 0")).toEqual([{ n: 0 }]);
    expect(await api(s.stub).verify()).toEqual({ ok: true });
  });

  it("(a) keeps two clients apart: B's pull, verify, rebuild and day never see A's events", async () => {
    const a = await acceptanceDayStore();
    const b = await acceptanceDayStore({ date: a.date, pushes: 3 }); // the till's bank, its first reading and C1-000001
    expect(a.stub.id.equals(b.stub.id)).toBe(false);
    expect(storeOf(a.tenant).id.equals(a.stub.id)).toBe(true);

    const idsA = [...a.setup, ...a.events].map((e) => e.id);
    const idsB = [...b.setup, ...b.pushed].map((e) => e.id);
    expect((await api(a.stub).pull(0, "office")).events.map((e) => e.id)).toEqual(idsA);
    expect((await api(b.stub).pull(0, "office")).events.map((e) => e.id)).toEqual(idsB);
    for (const kind of /** @type {const} */ (["till", "phone", "screen", "station", "cloud"])) {
      const pulled = (await api(b.stub).pull(0, kind)).events.map((e) => e.id);
      expect(
        pulled.filter((id) => idsA.includes(id)),
        kind,
      ).toEqual([]);
    }

    // inside B's database: none of A's events, orders or banks; B numbers its own log from 1
    expect(await storedAmong(b.stub, idsA)).toBe(0);
    const entitiesA = JSON.stringify([...new Set(a.events.map((e) => e.entity))]);
    for (const table of ["orders", "banks", "payments", "machine_readings"]) {
      const column = table === "payments" ? "order_id" : table === "machine_readings" ? "event_id" : "id";
      const values = table === "machine_readings" ? JSON.stringify(idsA) : entitiesA;
      const found = await rows(
        b.stub,
        `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} IN (SELECT value FROM json_each(?))`,
        values,
      );
      expect(found, table).toEqual([{ n: 0 }]);
    }
    expect(await rows(b.stub, "SELECT MIN(pos) AS lo, MAX(pos) AS hi FROM events")).toEqual([
      { lo: 1, hi: idsB.length },
    ]);

    // verify and rebuild walk B's own log only; B's day is the kit over B's events only
    expect(await api(b.stub).verify()).toEqual({ ok: true });
    expect(await api(b.stub).rebuild()).toMatchObject({ events: idsB.length });
    const dayB = await api(b.stub).dailyReport(a.date);
    expect(dayB).toStrictEqual(b.kit);
    expect(dayB).toMatchObject({ revenueCentimes: 2500, tickets: { count: 1 } });
    expect(await api(a.stub).dailyReport(a.date)).toStrictEqual(a.kit);
  });

  it("(c) acknowledges a duplicate batch without new rows", async () => {
    const s = await acceptanceDayStore();
    await api(s.stub).refresh();
    const head = await count(s.stub, "events");
    const before = await dump(s.stub, [...LOG_TABLES, ...PROJECTION_TABLES]);

    // every batch of the day pushed again (a device that never received the answers), and the back office's batch
    for (const p of [{ caller: OFFICE, events: s.setup }, ...s.pushes]) {
      const r = await api(s.stub).append(p.events, p.caller);
      expect(r).toMatchObject({ accepted: [], duplicates: p.events.map((e) => e.id), rejected: [], last: head });
    }
    // nothing changed: not a row of the log, the dead letters or any projection
    expect(await dump(s.stub, [...LOG_TABLES, ...PROJECTION_TABLES])).toEqual(before);

    // the same event twice in one batch: stored once, acknowledged once
    const { TILL, SARA } = s.day.ids;
    const at = s.day.at(15, 30);
    /** @type {EventEnvelope} */
    const twice = {
      id: uuidv7(at),
      type: "table.mark",
      entity: newId("tbl"),
      seq: null,
      device: TILL,
      staff: SARA,
      at,
      data: { state: "free" },
      v: 1,
    };
    const r = await api(s.stub).append([twice, twice], { device: TILL, kind: "till" });
    expect(r).toMatchObject({ accepted: [twice.id], duplicates: [twice.id], rejected: [], last: head + 1 });
    expect(await count(s.stub, "events")).toBe(head + 1);
    expect(await count(s.stub, "deadletter")).toBe(0);
    expect(await api(s.stub).dailyReport(s.date)).toStrictEqual(s.kit);
  });

  it("(d) a tampered row makes verify fail at exactly its position", async () => {
    const s = await acceptanceDayStore();
    const card = s.events.find((e) => e.type === "payment.added" && e.data.tender === "card_external");
    if (!card) throw new Error("the acceptance day has a card payment");
    const [{ pos }] = await rows(s.stub, "SELECT pos FROM events WHERE id = ?", card.id);
    const last = await count(s.stub, "events");
    expect(pos).toBeGreaterThan(1);
    expect(pos).toBeLessThan(last);
    expect(await api(s.stub).verify()).toEqual({ ok: true });

    // the log refuses edits (D20): tampering means dropping the guard first
    await expect(rows(s.stub, "UPDATE events SET data = '{}' WHERE pos = ?", pos)).rejects.toThrow(/never updated/);
    await runInDurableObject(s.stub, (_i, state) => {
      state.storage.sql.exec("DROP TRIGGER events_no_update");
      const data = JSON.parse(
        /** @type {string} */ (state.storage.sql.exec("SELECT data FROM events WHERE pos = ?", pos).one().data),
      );
      data.amountCentimes = 270; // 2,70 instead of 27,00
      state.storage.sql.exec("UPDATE events SET data = ? WHERE pos = ?", JSON.stringify(data), pos);
    });

    expect(await api(s.stub).verify()).toEqual({ ok: false, pos, reason: "hash_mismatch" });
    expect(await api(s.stub).verify(pos, pos)).toEqual({ ok: false, pos, reason: "hash_mismatch" });
    expect(await api(s.stub).verify(1, pos - 1)).toEqual({ ok: true });
    // the rows after it still chain from the hash stored at that position: the break is at that row and no other
    expect(await api(s.stub).verify(pos + 1)).toEqual({ ok: true });
  });

  it("(e) rebuild() gives identical projections and leaves the log as it was", async () => {
    const s = await acceptanceDayStore();
    await api(s.stub).refresh();
    const before = await dump(s.stub, PROJECTION_TABLES);
    const log = await dump(s.stub, LOG_TABLES);
    // the projections the day fills are not empty (the comparison is not between empty tables)
    for (const t of ["orders", "payments", "sales_lines", "banks", "staff", "devices", "machine_readings", "daily"])
      expect(before[t].length, t).toBeGreaterThan(0);

    const rebuilt = await api(s.stub).rebuild();
    expect(rebuilt.events).toBe(s.setup.length + s.events.length);
    expect(await dump(s.stub, PROJECTION_TABLES)).toEqual(before);
    expect(await dump(s.stub, LOG_TABLES)).toEqual(log);

    // a damaged projection is repaired by a rebuild
    await rows(s.stub, "DELETE FROM sales_lines");
    await rows(s.stub, "UPDATE banks SET expected = 0, variance = 0");
    await rows(s.stub, "DELETE FROM daily");
    await api(s.stub).rebuild();
    expect(await dump(s.stub, PROJECTION_TABLES)).toEqual(before);
    expect(await api(s.stub).dailyReport(s.date)).toStrictEqual(s.kit);
  });

  it("(f) refused events land in the dead letters with their code, and nowhere else", async () => {
    const v = venue();
    const { till, phone, screen, sara, ali, karim, drinks, tenant } = v.ids;
    const stub = storeOf(tenant);
    await addOwner(stub, v.ids.owner);
    expect(codes(await api(stub).append(v.setup(), v.callers.office))).toEqual([]);
    const tillBank = newId("bnk");
    const phoneBank = newId("bnk");
    const openTill = v.ev({
      device: till,
      staff: sara,
      type: "bank.opened",
      entity: tillBank,
      data: { kind: "till", holder: sara, floatCentimes: 50000 },
    });
    const openPhone = v.ev({
      device: phone,
      staff: ali,
      type: "bank.opened",
      entity: phoneBank,
      data: { kind: "waiter", holder: ali, floatCentimes: 0 },
    });
    expect(codes(await api(stub).append([openTill], v.callers.till))).toEqual([]);
    expect(codes(await api(stub).append([openPhone], v.callers.phone))).toEqual([]);

    /** @type {Map<string, string>} the dead letters expected: event id → code */
    const expected = new Map();
    /** @type {Map<string, string>} event id → the device that pushed it (the authenticated writer) */
    const pushedBy = new Map();
    /**
     * Pushes a batch; `refused` lists the events it must refuse, with their codes, in order.
     * @param {EventEnvelope[]} events
     * @param {Caller} caller
     * @param {[EventEnvelope, string][]} refused
     */
    async function push(events, caller, refused) {
      const r = await api(stub).append(events, caller);
      expect(r.rejected.map((x) => [x.id, x.code])).toEqual(refused.map(([e, code]) => [e.id, code]));
      const refusedIds = refused.map(([e]) => e.id);
      expect(r.accepted).toEqual(events.map((e) => e.id).filter((id) => !refusedIds.includes(id)));
      for (const [e, code] of refused) {
        expected.set(e.id, code);
        pushedBy.set(e.id, caller.device);
      }
    }

    // a till's event pushed by the phone: the caller is not the device that signed it
    const noSale = v.ev({
      device: till,
      staff: sara,
      type: "bank.no_sale",
      entity: tillBank,
      data: { reason: "monnaie", approvedBy: karim },
    });
    await push([noSale], v.callers.phone, [[noSale, "E_WRONG_DEVICE"]]);

    // a type the device kind may not write: a bar screen opening an order, a waiter phone changing the settings
    const screenOrder = v.ev({
      device: screen,
      staff: null,
      type: "order.opened",
      entity: newId("ord"),
      data: { mode: "counter", tableId: null },
    });
    await push([screenOrder], v.callers.screen, [[screenOrder, "E_FORBIDDEN_TYPE"]]);
    const phoneSettings = v.ev({
      device: phone,
      staff: ali,
      type: "settings.set",
      entity: tenant,
      data: { path: "receipt.width", value: 32 },
    });
    await push([phoneSettings], v.callers.phone, [[phoneSettings, "E_FORBIDDEN_TYPE"]]);

    // a gap in an order's seq (a crash) refuses that event and blocks the order's later events in the batch;
    // another aggregate of the same batch goes on
    const gap = newId("ord");
    const opened = v.ev({
      device: till,
      staff: sara,
      type: "order.opened",
      entity: gap,
      data: { mode: "counter", tableId: null },
    });
    const skipped = v.ev({
      device: till,
      staff: sara,
      type: "line.added",
      entity: gap,
      seq: 3,
      data: { lineId: newId("lin"), ...PRODUCTS.noir, category: drinks, qtyMilli: 1000 },
    });
    const blocked = v.ev({
      device: till,
      staff: sara,
      type: "line.added",
      entity: gap,
      seq: 4,
      data: { lineId: newId("lin"), ...PRODUCTS.noir, category: drinks, qtyMilli: 1000 },
    });
    const otherAggregate = v.ev({
      device: till,
      staff: sara,
      type: "table.mark",
      entity: newId("tbl"),
      data: { state: "free" },
    });
    await push([opened, skipped, blocked, otherAggregate], v.callers.till, [
      [skipped, "E_SEQ"],
      [blocked, "E_SEQ_BLOCKED"],
    ]);

    // a move split across two batches: each half is refused (a move is one pair, in one batch)
    const t1 = v.sale({
      device: phone,
      staff: ali,
      mode: "table",
      tableId: newId("tbl"),
      lines: [["noir", 2]],
      send: true,
    });
    const t2 = v.sale({
      device: phone,
      staff: ali,
      mode: "table",
      tableId: newId("tbl"),
      lines: [["the", 1]],
      send: true,
    });
    await push([...t1.events, ...t2.events], v.callers.phone, []);
    const sentAt = /** @type {EventEnvelope} */ (t1.events.find((e) => e.type === "lines.sent")).at;
    const moveId = newId("lin");
    const movedOut = t1.next("lines.moved_out", { moveId, toOrderId: t2.id, lineIds: t1.lineIds });
    const movedIn = t2.next("lines.moved_in", {
      moveId,
      fromOrderId: t1.id,
      lines: [
        {
          lineId: t1.lineIds[0],
          ...PRODUCTS.noir,
          category: drinks,
          qtyMilli: 2000,
          sent: true,
          held: false,
          sentAt,
          firedAt: sentAt,
        },
      ],
    });
    await push([movedOut], v.callers.phone, [[movedOut, "E_MOVE_PAIR"]]);
    await push([movedIn], v.callers.phone, [[movedIn, "E_MOVE_PAIR"]]);

    // a credit note refunding more than its ticket
    const ticket = v.sale({
      device: till,
      staff: sara,
      bank: tillBank,
      lines: [["noir", 2]],
      pay: { tender: "cash", amount: 2000 },
      receiptNo: "C1-000001",
    });
    await push(ticket.events, v.callers.till, []);
    const note = v.sale({
      device: till,
      staff: sara,
      bank: tillBank,
      lines: [["noir", -3]],
      pay: { tender: "cash", amount: -3000 },
      receiptNo: "C1-000002",
      refundOf: { orderId: ticket.id, receiptNo: "C1-000001", restock: false },
    });
    const [, noteLine, notePay, noteClose] = note.events;
    await push(note.events, v.callers.till, [
      [noteLine, "E_REFUND_EXCEEDS"],
      [notePay, "E_SEQ_BLOCKED"],
      [noteClose, "E_SEQ_BLOCKED"],
    ]);

    // money into a bank another device holds (assertBankAccepts): the phone cashing into the till's drawer
    const intoTill = v.sale({
      device: phone,
      staff: ali,
      bank: tillBank,
      lines: [["the", 1]],
      pay: { tender: "cash", amount: 800 },
      receiptNo: "S1-000001",
    });
    const [, , wrongPay, wrongClose] = intoTill.events;
    await push(intoTill.events, v.callers.phone, [
      [wrongPay, "E_NOT_OWNER"],
      [wrongClose, "E_SEQ_BLOCKED"],
    ]);

    // an event whose data is over 16 KB
    const big = v.ev({
      device: till,
      staff: sara,
      type: "table.mark",
      entity: newId("tbl"),
      data: { state: "free", note: "x".repeat(17 * 1024) },
    });
    await push([big], v.callers.till, [[big, "E_TOO_LARGE"]]);

    // a whole batch over 200 events or 512 KB is refused before any event is looked at (docs/03 §9): nothing stored,
    // nothing dead-lettered; the device splits it and pushes again
    const stored = await count(stub, "events");
    const dead = await count(stub, "deadletter");
    const mark = () =>
      v.ev({ device: till, staff: sara, type: "table.mark", entity: newId("tbl"), data: { state: "free" } });
    const tooMany = Array.from({ length: MAX_BATCH_EVENTS + 1 }, mark);
    const tooHeavy = Array.from({ length: 40 }, () => ({
      ...mark(),
      data: { state: "free", note: "x".repeat(15 * 1024) },
    }));
    expect(JSON.stringify(tooHeavy).length).toBeGreaterThan(MAX_BATCH_BYTES);
    for (const batch of [tooMany, tooHeavy]) {
      const err = await api(stub)
        .append(batch, v.callers.till)
        .then(
          () => null,
          (/** @type {any} */ e) => e,
        );
      expect(err).toMatchObject({ name: "BatchError", code: "E_TOO_LARGE" });
    }
    expect(await count(stub, "events")).toBe(stored);
    expect(await count(stub, "deadletter")).toBe(dead);

    // the dead letters: exactly the refused events, with their code, the device that pushed them (not the device an
    // event claims: the phone pushed the till's no-sale) and the event as pushed
    const letters = await rows(stub, "SELECT id, device, received_at, code, event, resolved_at FROM deadletter");
    expect(Object.fromEntries(letters.map((d) => [d.id, d.code]))).toEqual(Object.fromEntries(expected));
    for (const d of letters) {
      const ev = JSON.parse(/** @type {string} */ (d.event));
      expect(ev.id).toBe(d.id);
      expect(d.device).toBe(pushedBy.get(d.id));
      expect(d.received_at).toBeTypeOf("number");
      expect(d.resolved_at).toBeNull();
    }
    expect(letters.find((d) => d.id === noSale.id)?.device).toBe(phone);
    expect(new Set(expected.values())).toEqual(
      new Set([
        "E_WRONG_DEVICE",
        "E_FORBIDDEN_TYPE",
        "E_SEQ",
        "E_SEQ_BLOCKED",
        "E_MOVE_PAIR",
        "E_REFUND_EXCEEDS",
        "E_NOT_OWNER",
        "E_TOO_LARGE",
      ]),
    );
    // none of them is in the log, and the log is intact
    expect(await storedAmong(stub, [...expected.keys()])).toBe(0);
    expect(await api(stub).verify()).toEqual({ ok: true });
  });
});
