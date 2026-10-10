// @ts-check
/**
 * The TenantStore's logic (src/store.js, the same code the Durable Object runs) on node:sqlite: the push rules of
 * docs/04 §2, pull filters (§3), the chain (`verify`), `rebuild()` and the day's numbers against the kit's buildDay.
 * The workerd specs (tenant-store.spec.js) run the Durable Object itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildDay } from "@brandhub/kit/reports";
import { CLOUD_DEVICE } from "@brandhub/kit/events";
import { newId } from "@brandhub/kit/ids";
import { businessDate } from "@brandhub/kit/timezone";
import { Store } from "../src/store.js";
import { BatchError, MAX_BATCH_EVENTS } from "../src/sync-rules.js";
import { PROJECTION_TABLES } from "../src/projections.js";
import { nodeStorage } from "./node-storage.js";
import { PRODUCTS, venue } from "./fixtures.js";

/** @typedef {ReturnType<typeof venue>} Venue */

/**
 * A store on a fresh node:sqlite database, with the venue's owner account (the table prompt 05 fills).
 * @param {Venue} v
 * @param {"cafe" | "resto"} [product]
 */
function open(v, product = "cafe") {
  const storage = nodeStorage();
  const store = new Store(storage, product, { tenantId: () => v.ids.tenant });
  storage.db
    .prepare("INSERT INTO owners (id, email, role, created_at) VALUES (?, ?, 'owner', ?)")
    .run(v.ids.owner, "proprietaire@example.test", Date.now());
  /** @param {string} q @param {...any} b */
  const all = (q, ...b) =>
    storage.db
      .prepare(q)
      .all(...b)
      .map((r) => ({ ...r }));
  const count = () => /** @type {number} */ (all("SELECT COUNT(*) AS n FROM events")[0].n);
  return { storage, store, all, count };
}

/**
 * A store with the venue set up (devices, staff, categories) and the till's bank open with a 500,00 float.
 * @param {Venue} [v]
 */
async function ready(v = venue()) {
  const s = open(v);
  const r = await s.store.append(v.setup(), v.callers.office);
  assert.equal(r.rejected.length, 0, JSON.stringify(r.rejected));
  const tillBank = newId("bnk");
  const opened = await s.store.append(
    [
      v.ev({
        device: v.ids.till,
        staff: v.ids.sara,
        type: "bank.opened",
        entity: tillBank,
        data: { kind: "till", holder: v.ids.sara, floatCentimes: 50000 },
      }),
    ],
    v.callers.till,
  );
  assert.equal(opened.rejected.length, 0, JSON.stringify(opened.rejected));
  return { v, ...s, tillBank };
}

/** @param {{ rejected: { id: string | null, code: string }[] }} r */
const codes = (r) => r.rejected.map((x) => x.code);

test("a sale is stored in order, with positions, a chain that verifies and its projections", async () => {
  const { v, store, all, tillBank } = await ready();
  const sale = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [
      ["noir", 2],
      ["msemen", 1],
    ],
    pay: { tender: "cash", amount: 2500, tendered: 5000 },
    receiptNo: "C1-000001",
  });
  const r = await store.append(sale.events, v.callers.till);
  assert.deepEqual(
    r.accepted,
    sale.events.map((e) => e.id),
  );
  assert.deepEqual([r.duplicates, r.rejected], [[], []]);
  assert.equal(r.last, 10 + sale.events.length);
  assert.ok(Math.abs(r.serverTime - Date.now()) < 5000);
  assert.deepEqual(await store.verify(), { ok: true });

  const [order] = all(
    "SELECT status, receipt_no, total, paid, discount, business_date, owner FROM orders WHERE id = ?",
    sale.id,
  );
  assert.deepEqual(order, {
    status: "closed",
    receipt_no: "C1-000001",
    total: 2500,
    paid: 2500,
    discount: 0,
    business_date: v.businessDay,
    owner: v.ids.till,
  });
  assert.deepEqual(all("SELECT tender, amount, voided, bank_id FROM payments"), [
    { tender: "cash", amount: 2500, voided: 0, bank_id: tillBank },
  ]);
  assert.deepEqual(all("SELECT expected, counted, variance, status FROM banks"), [
    { expected: 52500, counted: null, variance: null, status: "open" },
  ]);
  const lines = all(
    "SELECT product_id, tax_class, qty_milli, net_ttc, vat_bp, vat, staff, device, business_date FROM sales_lines ORDER BY product_id",
  );
  assert.deepEqual(lines, [
    {
      product_id: PRODUCTS.noir.productId,
      tax_class: "drink",
      qty_milli: 2000,
      net_ttc: 2000,
      vat_bp: 1000,
      vat: 182,
      staff: v.ids.sara,
      device: v.ids.till,
      business_date: v.businessDay,
    },
    {
      product_id: PRODUCTS.msemen.productId,
      tax_class: "food",
      qty_milli: 1000,
      net_ttc: 500,
      vat_bp: 1000,
      vat: 45,
      staff: v.ids.sara,
      device: v.ids.till,
      business_date: v.businessDay,
    },
  ]);
  assert.deepEqual(all("SELECT prefix, last_used FROM receipt_series"), [{ prefix: "C1", last_used: 1 }]);
  const stored = all("SELECT pos, clock_skew, relayed_by, recv_at FROM events ORDER BY pos");
  assert.deepEqual(
    stored.map((e) => e.pos),
    stored.map((_, i) => i + 1),
  );
  assert.ok(stored.every((e) => e.clock_skew === 0 && e.relayed_by === null));
});

test("a duplicate batch is acknowledged and nothing is stored twice", async () => {
  const { v, store, count, tillBank } = await ready();
  const sale = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["the", 3]],
    pay: { tender: "cash", amount: 2400 },
    receiptNo: "C1-000001",
  });
  const first = await store.append(sale.events, v.callers.till);
  const before = count();
  const again = await store.append(sale.events, v.callers.till);
  assert.deepEqual(again.accepted, []);
  assert.deepEqual(
    again.duplicates,
    sale.events.map((e) => e.id),
  );
  assert.deepEqual(again.rejected, []);
  assert.equal(again.last, first.last);
  assert.equal(count(), before);
  // the same event twice in one batch is stored once
  const e = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "table.mark",
    entity: newId("tbl"),
    data: { state: "free" },
  });
  const twice = await store.append([e, e], v.callers.till);
  assert.deepEqual([twice.accepted, twice.duplicates], [[e.id], [e.id]]);
  assert.equal(count(), before + 1);
});

test("the writer must be a device or a member of this client, signing as the caller", async () => {
  const { v, store, all } = await ready();
  const table = () => newId("tbl");
  const mark = (/** @type {string} */ device, /** @type {string | null} */ staff) =>
    v.ev({ device, staff, type: "table.mark", entity: table(), data: { state: "free" } });
  const stranger = newId("dev");
  assert.deepEqual(codes(await store.append([mark(stranger, null)], { device: stranger, kind: "till" })), [
    "E_UNKNOWN_DEVICE",
  ]);
  // the till pushes an event signed by the phone
  assert.deepEqual(codes(await store.append([mark(v.ids.phone, v.ids.ali)], v.callers.till)), ["E_WRONG_DEVICE"]);
  // the till's token, but it says it is a phone
  assert.deepEqual(codes(await store.append([mark(v.ids.till, v.ids.sara)], { device: v.ids.till, kind: "phone" })), [
    "E_WRONG_DEVICE",
  ]);
  // a Station relays a phone's event only when it says it relays
  const relayed = mark(v.ids.phone, v.ids.ali);
  assert.deepEqual(codes(await store.append([relayed], v.callers.station)), ["E_WRONG_DEVICE"]);
  const ok = await store.append([relayed], v.callers.relay);
  assert.deepEqual(ok.accepted, [relayed.id]);
  assert.deepEqual(all("SELECT relayed_by FROM events WHERE id = ?", relayed.id), [{ relayed_by: v.ids.station }]);
  // unknown staff, an owner account on a paired device, a device kind that may not write the type
  assert.deepEqual(codes(await store.append([mark(v.ids.till, newId("stf"))], v.callers.till)), ["E_UNKNOWN_STAFF"]);
  assert.deepEqual(codes(await store.append([mark(v.ids.till, v.ids.owner)], v.callers.till)), ["E_FORBIDDEN_TYPE"]);
  assert.deepEqual(codes(await store.append([mark(v.ids.screen, null)], v.callers.screen)), ["E_FORBIDDEN_TYPE"]);
  // the back office writes as dev_cloud with a known owner account
  const setting = (/** @type {string | null} */ staff) =>
    v.ev({
      device: "dev_cloud",
      staff,
      type: "settings.set",
      entity: v.ids.tenant,
      data: { path: "receipt.width", value: 32 },
    });
  assert.deepEqual(codes(await store.append([setting(newId("own"))], v.callers.office)), ["E_UNKNOWN_STAFF"]);
  assert.deepEqual(codes(await store.append([setting(v.ids.sara)], v.callers.office)), ["E_FORBIDDEN_TYPE"]);
  assert.deepEqual(codes(await store.append([{ ...setting(v.ids.owner), device: v.ids.till }], v.callers.office)), [
    "E_WRONG_DEVICE",
  ]);
  // another client's tenant id
  assert.deepEqual(codes(await store.append([{ ...setting(v.ids.owner), entity: newId("tnt") }], v.callers.office)), [
    "E_ENTITY",
  ]);
  assert.equal((await store.append([setting(v.ids.owner)], v.callers.office)).accepted.length, 1);
  // tip pools wait for V1.1
  const tip = v.ev({ device: v.ids.till, staff: v.ids.sara, type: "tip.pool_opened", entity: newId("tip"), data: {} });
  assert.deepEqual(codes(await store.append([tip], v.callers.till)), ["E_BAD_EVENT"]);
  // a malformed caller is the Worker's bug: it throws
  await assert.rejects(() => store.append([], /** @type {any} */ ({ device: v.ids.till, kind: "office" })), TypeError);
  await assert.rejects(
    () => store.append([], /** @type {any} */ ({ device: v.ids.till, kind: "till", relaying: true })),
    TypeError,
  );
});

test("a refused sequenced event blocks its aggregate for the rest of the batch; other aggregates go on", async () => {
  const { v, store, all, tillBank } = await ready();
  const a = newId("ord");
  const b = newId("ord");
  const opened = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "order.opened",
    entity: a,
    data: { mode: "counter" },
  });
  const gap = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "line.added",
    entity: a,
    seq: 3,
    data: { lineId: newId("lin"), ...PRODUCTS.noir, qtyMilli: 1000 },
  });
  const after = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "line.added",
    entity: a,
    seq: 2,
    data: { lineId: newId("lin"), ...PRODUCTS.noir, qtyMilli: 1000 },
  });
  const other = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "order.opened",
    entity: b,
    data: { mode: "counter" },
  });
  const r = await store.append([opened, gap, after, other], v.callers.till);
  assert.deepEqual(r.accepted, [opened.id, other.id]);
  assert.deepEqual(
    r.rejected.map((x) => [x.id, x.code]),
    [
      [gap.id, "E_SEQ"],
      [after.id, "E_SEQ_BLOCKED"],
    ],
  );
  const dead = all("SELECT id, code, device, event FROM deadletter ORDER BY code");
  assert.deepEqual(
    dead.map((d) => [d.id, d.code, d.device]),
    [
      [gap.id, "E_SEQ"],
      [after.id, "E_SEQ_BLOCKED"],
    ].map(([id, code]) => [id, code, v.ids.till]),
  );
  assert.deepEqual(JSON.parse(/** @type {string} */ (dead[0].event)), gap);
  // a refused event pushed again is refused again, with one dead letter
  assert.deepEqual(codes(await store.append([gap], v.callers.till)), ["E_SEQ"]);
  assert.equal(all("SELECT COUNT(*) AS n FROM deadletter WHERE id = ?", gap.id)[0].n, 1);
  void tillBank;
});

test("money lands only in an open bank held by the writing device (assertBankAccepts)", async () => {
  const { v, store, all, tillBank } = await ready();
  const aliBank = newId("bnk");
  await store.append(
    [
      v.ev({
        device: v.ids.phone,
        staff: v.ids.ali,
        type: "bank.opened",
        entity: aliBank,
        data: { kind: "waiter", holder: v.ids.ali, floatCentimes: 0 },
      }),
    ],
    v.callers.phone,
  );
  // the phone takes cash into the till's drawer
  const wrong = v.sale({
    device: v.ids.phone,
    staff: v.ids.ali,
    bank: tillBank,
    lines: [["noir", 1]],
    pay: { tender: "cash", amount: 1000 },
  });
  assert.deepEqual(codes(await store.append(wrong.events, v.callers.phone)), ["E_NOT_OWNER"]);
  const unknown = v.sale({
    device: v.ids.phone,
    staff: v.ids.ali,
    bank: newId("bnk"),
    lines: [["noir", 1]],
    pay: { tender: "cash", amount: 1000 },
  });
  assert.deepEqual(codes(await store.append(unknown.events, v.callers.phone)), ["E_BANK_UNKNOWN"]);
  // a Kredi repayment in cash goes into the collector's own open bank and counts in its expected cash
  const customer = newId("cus");
  const repay = (/** @type {string} */ bankId) =>
    v.ev({
      device: v.ids.phone,
      staff: v.ids.ali,
      type: "kredi.repaid",
      entity: customer,
      data: { amountCentimes: 1500, tender: "cash", bankId },
    });
  assert.deepEqual(codes(await store.append([repay(tillBank)], v.callers.phone)), ["E_NOT_OWNER"]);
  assert.deepEqual((await store.append([repay(aliBank)], v.callers.phone)).rejected, []);
  assert.deepEqual(all("SELECT expected FROM banks WHERE id = ?", aliBank), [{ expected: 1500 }]);
  assert.deepEqual(all("SELECT id FROM customers"), [{ id: customer }]);
  // once counted, the bank takes no more money
  await store.append(
    [
      v.ev({
        device: v.ids.phone,
        staff: v.ids.ali,
        type: "bank.counted",
        entity: aliBank,
        data: { countedCentimes: 1400 },
      }),
    ],
    v.callers.phone,
  );
  assert.deepEqual(all("SELECT status, expected, counted, variance FROM banks WHERE id = ?", aliBank), [
    { status: "counted", expected: 1500, counted: 1400, variance: -100 },
  ]);
  const late = v.sale({
    device: v.ids.phone,
    staff: v.ids.ali,
    bank: aliBank,
    lines: [["noir", 1]],
    pay: { tender: "cash", amount: 1000 },
  });
  assert.deepEqual(codes(await store.append(late.events, v.callers.phone)), ["E_BANK_CLOSED"]);
});

/**
 * Two table orders on the phone (table 2: two sent coffees; table 4: one), ready to merge.
 * @param {Awaited<ReturnType<typeof ready>>} s
 */
async function tables(s) {
  const { v, store } = s;
  const src = v.sale({
    device: v.ids.phone,
    staff: v.ids.ali,
    mode: "table",
    tableId: newId("tbl"),
    lines: [
      ["noir", 1],
      ["creme", 1],
    ],
    send: true,
  });
  const dst = v.sale({
    device: v.ids.phone,
    staff: v.ids.ali,
    mode: "table",
    tableId: newId("tbl"),
    lines: [["the", 1]],
    send: true,
  });
  const r = await store.append([...src.events, ...dst.events], v.callers.phone);
  assert.deepEqual(r.rejected, []);
  const source = /** @type {import("@brandhub/kit/order").OrderState} */ (store.projections.order(src.id));
  const target = /** @type {import("@brandhub/kit/order").OrderState} */ (store.projections.order(dst.id));
  const snaps = source.lines.map(({ movedTo, movedFrom, voided, voidReason, totalCentimes, ...rest }) => rest);
  const moveId = newId("lin");
  // explicit seqs: a refused attempt does not use up its seq (the device writes the next attempt with the same one)
  /** @param {number} [extra] */
  const out = (extra = 0) =>
    v.ev({
      device: v.ids.phone,
      staff: v.ids.ali,
      type: "lines.moved_out",
      entity: src.id,
      seq: source.seq + 1 + extra,
      data: { moveId, toOrderId: dst.id, lineIds: source.lines.map((l) => l.lineId) },
    });
  /** @param {any[]} [lines] @param {number} [extra] */
  const inn = (lines = snaps, extra = 0) =>
    v.ev({
      device: v.ids.phone,
      staff: v.ids.ali,
      type: "lines.moved_in",
      entity: dst.id,
      seq: target.seq + 1 + extra,
      data: { moveId, fromOrderId: src.id, lines },
    });
  return { src, dst, snaps, out, inn };
}

test("a move is kept whole: both events in one batch, the same lines, or both refused (E_MOVE_PAIR)", async () => {
  const s = await ready();
  const { v, store } = s;
  const { src, dst, snaps, out, inn } = await tables(s);
  // a lone lines.moved_out
  const lone = out();
  assert.deepEqual(codes(await store.append([lone], v.callers.phone)), ["E_MOVE_PAIR"]);
  // a lines.moved_in that reprices a line: both refused, and the source's next event is blocked
  const repriced = [out(), inn(snaps.map((l, i) => (i === 0 ? { ...l, unitCentimes: 1 } : l)))];
  const covers = v.ev({
    device: v.ids.phone,
    staff: v.ids.ali,
    type: "order.covers_set",
    entity: src.id,
    seq: /** @type {number} */ (repriced[0].seq) + 1,
    data: { covers: 2 },
  });
  const r1 = await store.append([...repriced, covers], v.callers.phone);
  assert.deepEqual(codes(r1), ["E_MOVE_PAIR", "E_MOVE_PAIR", "E_SEQ_BLOCKED"]);
  // a lines.moved_in that changes a line's category (its tax class, docs/11 §6) or its kitchen: both refused
  const relabeled = [out(), inn(snaps.map((l, i) => (i === 0 ? { ...l, category: v.ids.food, station: "cuisine" } : l)))];
  assert.deepEqual(codes(await store.append(relabeled, v.callers.phone)), ["E_MOVE_PAIR", "E_MOVE_PAIR"]);
  // the valid move
  const pair = [out(), inn()];
  const ok = await store.append(pair, v.callers.phone);
  assert.deepEqual(
    ok.accepted,
    pair.map((e) => e.id),
    JSON.stringify(ok.rejected),
  );
  const a = /** @type {any} */ (store.projections.order(src.id));
  const b = /** @type {any} */ (store.projections.order(dst.id));
  assert.equal(a.totals.totalCentimes, 0);
  assert.equal(b.totals.totalCentimes, 1000 + 1200 + 800);
  assert.ok(b.lines.filter((/** @type {any} */ l) => l.movedFrom === src.id).every((/** @type {any} */ l) => l.sent));
});

test("a lines.moved_out kept on the first pass is refused when its lines.moved_in is refused", async () => {
  const s = await ready();
  const { v, store } = s;
  const { dst, out, inn } = await tables(s);
  // the target is voided first (by an earlier event of the same batch): the lines.moved_in breaks on E_STATUS
  const voidDst = dst.next("order.voided", { reason: "erreur", approvedBy: v.ids.karim });
  const pair = [out(), inn(undefined, 1)];
  const r = await store.append([voidDst, ...pair], v.callers.phone);
  assert.deepEqual(r.accepted, [voidDst.id]);
  assert.deepEqual(
    r.rejected.map((x) => [x.id, x.code]),
    [
      [pair[0].id, "E_MOVE_PAIR"],
      [pair[1].id, "E_STATUS"],
    ],
  );
});

test("lines never move between a TEST order and a real one (E_MOVE_PAIR)", async () => {
  const { v, store } = await ready();
  const real = v.sale({
    device: v.ids.phone,
    staff: v.ids.ali,
    mode: "table",
    tableId: newId("tbl"),
    lines: [
      ["noir", 2],
      ["creme", 1],
    ],
    send: true,
  });
  const training = v.sale({
    device: v.ids.phone,
    staff: v.ids.ali,
    mode: "table",
    tableId: newId("tbl"),
    training: true,
    lines: [["the", 1]],
    send: true,
  });
  assert.deepEqual((await store.append([...real.events, ...training.events], v.callers.phone)).rejected, []);
  /** @param {{ id: string }} from @param {{ id: string }} to */
  const move = (from, to) => {
    const source = /** @type {import("@brandhub/kit/order").OrderState} */ (store.projections.order(from.id));
    const target = /** @type {import("@brandhub/kit/order").OrderState} */ (store.projections.order(to.id));
    const snaps = source.lines.map(({ movedTo, movedFrom, voided, voidReason, totalCentimes, ...rest }) => rest);
    const moveId = newId("lin");
    return [
      v.ev({
        device: v.ids.phone,
        staff: v.ids.ali,
        type: "lines.moved_out",
        entity: from.id,
        seq: source.seq + 1,
        data: { moveId, toOrderId: to.id, lineIds: source.lines.map((l) => l.lineId) },
      }),
      v.ev({
        device: v.ids.phone,
        staff: v.ids.ali,
        type: "lines.moved_in",
        entity: to.id,
        seq: target.seq + 1,
        data: { moveId, fromOrderId: from.id, lines: snaps },
      }),
    ];
  };
  // sent real lines into a TEST order would leave every report with no void after sending (D13)
  assert.deepEqual(codes(await store.append(move(real, training), v.callers.phone)), ["E_MOVE_PAIR", "E_MOVE_PAIR"]);
  assert.deepEqual(codes(await store.append(move(training, real), v.callers.phone)), ["E_MOVE_PAIR", "E_MOVE_PAIR"]);
  const kept = /** @type {import("@brandhub/kit/order").OrderState} */ (store.projections.order(real.id));
  assert.equal(kept.totals.totalCentimes, 2 * 1000 + 1200);
  assert.ok(kept.lines.every((l) => l.movedTo === null));
});

test("an id twice in a batch is decided once: a later copy of a refused event is not stored", async () => {
  const { v, store, all } = await ready();
  const cat = newId("cat");
  const refused = v.office("catalog.category_set", cat, { name: { fr: "Alcools", ar: "كحول" }, taxClass: "alcohol" });
  const again = { ...refused, data: { ...refused.data, taxClass: "food" } };
  const r = await store.append([refused, again], v.callers.office);
  assert.deepEqual([r.accepted, r.duplicates], [[], []]);
  assert.deepEqual(
    r.rejected.map((x) => [x.id, x.code]),
    [[refused.id, "E_BAD_DATA"]],
  );
  assert.deepEqual(all("SELECT COUNT(*) AS n FROM events WHERE id = ?", refused.id), [{ n: 0 }]);
  // cash refused for a bank not open yet stays refused when the batch repeats it after the opening
  const aliBank = newId("bnk");
  const repay = v.ev({
    device: v.ids.phone,
    staff: v.ids.ali,
    type: "kredi.repaid",
    entity: newId("cus"),
    data: { amountCentimes: 1500, tender: "cash", bankId: aliBank },
  });
  const opened = v.ev({
    device: v.ids.phone,
    staff: v.ids.ali,
    type: "bank.opened",
    entity: aliBank,
    data: { kind: "waiter", holder: v.ids.ali, floatCentimes: 0 },
  });
  const money = await store.append([repay, opened, repay], v.callers.phone);
  assert.deepEqual(money.accepted, [opened.id]);
  assert.deepEqual(
    money.rejected.map((x) => [x.id, x.code]),
    [[repay.id, "E_BANK_UNKNOWN"]],
  );
  assert.deepEqual(all("SELECT expected FROM banks WHERE id = ?", aliBank), [{ expected: 0 }]);
  const letters = all("SELECT id FROM deadletter WHERE id IN (?, ?) AND resolved_at IS NULL", refused.id, repay.id);
  assert.equal(letters.length, 2, "one dead letter each, for events that are not in the log");
  assert.deepEqual(all("SELECT COUNT(*) AS n FROM events WHERE id = ?", repay.id), [{ n: 0 }]);
});

test("a move whose events are repeated in the batch is kept once; the copies are acknowledged", async () => {
  for (const repeat of ["out", "in"]) {
    const s = await ready();
    const { v, store } = s;
    const { out, inn } = await tables(s);
    const [o, i] = [out(), inn()];
    const batch = repeat === "out" ? [o, o, i] : [o, i, i];
    const r = await store.append(batch, v.callers.phone);
    assert.deepEqual(r.rejected, [], repeat);
    assert.deepEqual(r.accepted, [o.id, i.id], repeat);
    assert.deepEqual(r.duplicates, [repeat === "out" ? o.id : i.id], repeat);
    const retry = await store.append([o, i], v.callers.phone);
    assert.deepEqual([retry.accepted, retry.duplicates, retry.rejected], [[], [o.id, i.id], []], repeat);
  }
});

test("a credit note never refunds more than what is left of its ticket", async () => {
  const { v, store, tillBank } = await ready();
  const ticket = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["noir", 3]],
    pay: { tender: "cash", amount: 3000 },
    receiptNo: "C1-000001",
  });
  await store.append(ticket.events, v.callers.till);
  const refund = (/** @type {number} */ qty, /** @type {string} */ no) =>
    v.sale({
      device: v.ids.till,
      staff: v.ids.sara,
      bank: tillBank,
      lines: [["noir", -qty]],
      pay: { tender: "cash", amount: -1000 * qty },
      receiptNo: no,
      refundOf: { orderId: ticket.id, receiptNo: "C1-000001" },
    });
  const first = refund(2, "C1-000002");
  assert.deepEqual((await store.append(first.events, v.callers.till)).rejected, []);
  const second = refund(2, "C1-000003");
  const r = await store.append(second.events, v.callers.till);
  assert.deepEqual(codes(r), ["E_REFUND_EXCEEDS", "E_SEQ_BLOCKED", "E_SEQ_BLOCKED"]);
  assert.equal(r.accepted.length, 1, "the credit note's opening is kept; its line is not");
  const last = refund(1, "C1-000004");
  assert.deepEqual((await store.append(last.events, v.callers.till)).rejected, []);
  // a credit note of an unknown ticket
  const ghost = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    lines: [["noir", -1]],
    refundOf: { orderId: newId("ord"), receiptNo: "C1-000009" },
  });
  assert.deepEqual(codes(await store.append(ghost.events, v.callers.till)), ["E_REFUND_EXCEEDS", "E_SEQ_BLOCKED"]);
});

test("a receipt number is used once, in the closing device's own series", async () => {
  const { v, store, tillBank } = await ready();
  const one = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["noir", 1]],
    pay: { tender: "card_external", amount: 1000, reference: "1234" },
    receiptNo: "C1-000001",
  });
  const two = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["noir", 1]],
    pay: { tender: "card_external", amount: 1000, reference: "1235" },
    receiptNo: "C1-000001",
  });
  const r = await store.append([...one.events, ...two.events], v.callers.till);
  assert.deepEqual(codes(r), ["E_DUP_RECEIPT"]);
  const other = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["noir", 1]],
    pay: { tender: "card_external", amount: 1000, reference: "1236" },
    receiptNo: "S1-000001",
  });
  assert.deepEqual(codes(await store.append(other.events, v.callers.till)), ["E_BAD_DATA"]);
  const training = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    training: true,
    lines: [["noir", 1]],
    pay: { tender: "card_external", amount: 1000, reference: "1237" },
    receiptNo: "TC1-000001",
  });
  assert.deepEqual((await store.append(training.events, v.callers.till)).rejected, []);
  // a TEST order never takes a real number, and a real sale never a training one (docs/03 §5)
  const testAsReal = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    training: true,
    lines: [["noir", 1]],
    pay: { tender: "card_external", amount: 1000, reference: "1238" },
    receiptNo: "C1-000002",
  });
  assert.deepEqual(codes(await store.append(testAsReal.events, v.callers.till)), ["E_BAD_DATA"]);
  const realAsTest = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["noir", 1]],
    pay: { tender: "card_external", amount: 1000, reference: "1239" },
    receiptNo: "TC1-000002",
  });
  assert.deepEqual(codes(await store.append(realAsTest.events, v.callers.till)), ["E_BAD_DATA"]);
  // a device paired without a prefix closes nothing, so it cannot take another device's numbers (docs/03 §7)
  const bare = newId("dev");
  /** @type {import("../src/sync-rules.js").Caller} */
  const bareCaller = { device: bare, kind: "phone" };
  const bareBank = newId("bnk");
  assert.deepEqual(
    (await store.append([v.office("device.set", bare, { name: "Serveur 2", kind: "phone" })], v.callers.office))
      .rejected,
    [],
  );
  const opened = v.ev({
    device: bare,
    staff: v.ids.ali,
    type: "bank.opened",
    entity: bareBank,
    data: { kind: "waiter", holder: v.ids.ali, floatCentimes: 0 },
  });
  assert.deepEqual((await store.append([opened], bareCaller)).rejected, []);
  const borrowed = v.sale({
    device: bare,
    staff: v.ids.ali,
    bank: bareBank,
    lines: [["noir", 1]],
    pay: { tender: "cash", amount: 1000 },
    receiptNo: "C1-000002",
  });
  assert.deepEqual(codes(await store.append(borrowed.events, bareCaller)), ["E_BAD_DATA"]);
  // the till's own next numbers are still free, in both of its series
  const next = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["noir", 1]],
    pay: { tender: "card_external", amount: 1000, reference: "1240" },
    receiptNo: "C1-000002",
  });
  const nextTraining = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    training: true,
    lines: [["noir", 1]],
    pay: { tender: "card_external", amount: 1000, reference: "1241" },
    receiptNo: "TC1-000002",
  });
  assert.deepEqual((await store.append([...next.events, ...nextTraining.events], v.callers.till)).rejected, []);
  assert.deepEqual(store.dailyReport(v.businessDay).tickets.count, 2, "only the two real sales count");
});

test("a three-digit prefix and its training series are kept like any other (newSeries agrees with the blocks)", async () => {
  const { v, store, all, tillBank } = await ready();
  const renamed = v.office("device.set", v.ids.till, { name: "Caisse 1", kind: "till", prefix: "C999" });
  assert.deepEqual((await store.append([renamed], v.callers.office)).rejected, []);
  // the cloud reserves the till's training block before its first TEST sale
  const block = v.ev({
    device: CLOUD_DEVICE,
    staff: null,
    type: "receipts.block_reserved",
    entity: newId("blk"),
    data: { deviceId: v.ids.till, prefix: "TC999", start: 1, end: 500 },
  });
  assert.deepEqual((await store.append([block], v.callers.cloud)).rejected, []);
  const real = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["noir", 1]],
    pay: { tender: "cash", amount: 1000 },
    receiptNo: "C999-000001",
  });
  const training = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    training: true,
    lines: [["noir", 1]],
    pay: { tender: "cash", amount: 1000 },
    receiptNo: "TC999-000001",
  });
  const r = await store.append([...real.events, ...training.events], v.callers.till);
  assert.deepEqual(r.rejected, []);
  assert.equal(r.accepted.length, real.events.length + training.events.length);
  assert.deepEqual(all("SELECT prefix, last_end, last_used FROM receipt_series ORDER BY prefix"), [
    { prefix: "C999", last_end: 0, last_used: 1 },
    { prefix: "TC999", last_end: 500, last_used: 1 },
  ]);
  // a prefix outside docs/03 §7 is refused at pairing
  const odd = v.office("device.set", v.ids.phone, { name: "Serveur 1", kind: "phone", prefix: "ABCD" });
  assert.deepEqual(codes(await store.append([odd], v.callers.office)), ["E_BAD_DATA"]);
});

test("a revoked device keeps what it wrote before its revocation; later events are refused", async () => {
  const { v, store, storage } = await ready();
  const revokedAt = v.at(12, 0);
  storage.db
    .prepare("INSERT INTO device_access (device_id, token_hash, paired_at, revoked_at) VALUES (?, ?, ?, ?)")
    .run(v.ids.phone, "0".repeat(64), v.at(6, 0), revokedAt);
  const mark = (/** @type {number} */ at) =>
    v.ev({
      device: v.ids.phone,
      staff: v.ids.ali,
      type: "table.mark",
      entity: newId("tbl"),
      data: { state: "free" },
      at,
    });
  const before = mark(v.at(11, 59));
  const after = mark(v.at(12, 0));
  const r = await store.append([before, after], v.callers.phone);
  assert.deepEqual(r.accepted, [before.id]);
  assert.deepEqual(codes(r), ["E_DEVICE_REVOKED"]);
  // a revoked Station relays nothing
  storage.db
    .prepare("INSERT INTO device_access (device_id, token_hash, paired_at, revoked_at) VALUES (?, ?, ?, ?)")
    .run(v.ids.station, "1".repeat(64), v.at(6, 0), v.at(9, 0));
  const relayed = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "table.mark",
    entity: newId("tbl"),
    data: { state: "free" },
  });
  assert.deepEqual(codes(await store.append([relayed], v.callers.relay)), ["E_DEVICE_REVOKED"]);
});

test("clock skew is flagged (docs/04 §6) and the day counts it at the server's time", async () => {
  const { v, store, all, tillBank } = await ready();
  const fine = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "table.mark",
    entity: newId("tbl"),
    data: { state: "free" },
    at: v.at(10, 0),
  });
  const rolled = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "table.mark",
    entity: newId("tbl"),
    data: { state: "free", clock: "rolled_back" },
    at: v.at(10, 1),
  });
  const ahead = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "table.mark",
    entity: newId("tbl"),
    data: { state: "free" },
    at: Date.now() + 10 * 60_000,
  });
  const r = await store.append([ahead, rolled, fine], v.callers.till);
  assert.equal(r.accepted.length, 3);
  const flags = all("SELECT id, clock_skew, recv_at FROM events WHERE id IN (?, ?, ?)", ahead.id, rolled.id, fine.id);
  assert.deepEqual(Object.fromEntries(flags.map((f) => [f.id, f.clock_skew])), {
    [ahead.id]: 1,
    [rolled.id]: 1,
    [fine.id]: 0,
  });
  assert.ok(flags.every((f) => f.recv_at === r.serverTime));
  // a till whose clock is two days ahead sells into the bank it opened on an earlier day: the sale counts on the
  // server's business day, not on the day its wrong clock shows
  const ahead2 = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    when: Date.now() + 2 * 86_400_000,
    lines: [["noir", 1]],
    pay: { tender: "cash", amount: 1000 },
    receiptNo: "C1-000001",
  });
  const sold = await store.append(ahead2.events, v.callers.till);
  assert.deepEqual(sold.rejected, []);
  const serverDay = businessDate(sold.serverTime, { cutoff: "05:00" });
  assert.notEqual(serverDay, v.businessDay, "the bank was opened on an earlier day");
  assert.deepEqual(all("SELECT business_at, business_date FROM orders WHERE id = ?", ahead2.id), [
    { business_at: sold.serverTime, business_date: serverDay },
  ]);
  assert.ok(
    all("SELECT clock_skew, recv_at FROM events WHERE entity = ?", ahead2.id).every(
      (e) => e.clock_skew === 1 && e.recv_at === sold.serverTime,
    ),
  );
  const report = store.dailyReport(serverDay);
  assert.equal(report.revenueCentimes, 1000);
  assert.equal(report.tickets.count, 1);
  assert.deepEqual(report, buildDay(store.pull(0, "office").events, { businessDate: serverDay, cutoff: "05:00" }));
});

test("a batch over 200 events or 512 KB is refused whole, nothing stored", async () => {
  const { v, store, count } = await ready();
  const before = count();
  const many = Array.from({ length: MAX_BATCH_EVENTS + 1 }, () =>
    v.ev({ device: v.ids.till, staff: v.ids.sara, type: "table.mark", entity: newId("tbl"), data: { state: "free" } }),
  );
  await assert.rejects(
    () => store.append(many, v.callers.till),
    (e) => e instanceof BatchError && e.code === "E_TOO_LARGE",
  );
  const big = Array.from({ length: 40 }, () =>
    v.ev({
      device: v.ids.till,
      staff: v.ids.sara,
      type: "table.mark",
      entity: newId("tbl"),
      data: { state: "free", pad: "x".repeat(15_000) },
    }),
  );
  await assert.rejects(
    () => store.append(big, v.callers.till),
    (e) => e instanceof BatchError && e.code === "E_TOO_LARGE",
  );
  assert.equal(count(), before);
  // one event over 16 KB of data is refused alone
  const fat = v.ev({
    device: v.ids.till,
    staff: v.ids.sara,
    type: "table.mark",
    entity: newId("tbl"),
    data: { state: "free", pad: "x".repeat(17_000) },
  });
  assert.deepEqual(codes(await store.append([fat], v.callers.till)), ["E_TOO_LARGE"]);
});

test("verify finds a tampered, removed or reordered row at its position", async () => {
  const { v, store, storage, tillBank } = await ready();
  const sale = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    lines: [["noir", 2]],
    pay: { tender: "cash", amount: 2000 },
    receiptNo: "C1-000001",
  });
  await store.append(sale.events, v.callers.till);
  assert.deepEqual(await store.verify(), { ok: true });
  assert.deepEqual(await store.verify(3, 7), { ok: true });
  // the log refuses edits; a tamperer has to drop the guard first
  assert.throws(() => storage.db.exec("UPDATE events SET data = '{}' WHERE pos = 13"), /never updated/);
  storage.db.exec("DROP TRIGGER events_no_update");
  const row = /** @type {{ data: string }} */ (storage.db.prepare("SELECT data FROM events WHERE pos = 13").get());
  const data = JSON.parse(row.data);
  data.amountCentimes = 200;
  storage.db.prepare("UPDATE events SET data = ? WHERE pos = 13").run(JSON.stringify(data));
  assert.deepEqual(await store.verify(), { ok: false, pos: 13, reason: "hash_mismatch" });
  assert.deepEqual(await store.verify(1, 12), { ok: true });
  assert.deepEqual(await store.verify(14), { ok: true }, "after the broken row the chain holds from its stored hash");
  storage.db.exec("DROP TRIGGER events_no_delete");
  storage.db.exec("DELETE FROM events WHERE pos = 5");
  assert.deepEqual(await store.verify(1, 12), { ok: false, pos: 5, reason: "gap_in_positions" });
});

/**
 * Every projection table's rows, sorted, for comparisons.
 * @param {(q: string) => Record<string, unknown>[]} all
 */
function snapshot(all) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const t of PROJECTION_TABLES)
    out[t] = all(`SELECT * FROM ${t}`)
      .map((r) => JSON.stringify(r))
      .sort();
  return out;
}

/**
 * A day of a café with waiters (docs/01 §6 style): two banks, counter and table sales, a discount, a void after
 * sending, a voided order, a TEST order, a credit note, a merge, Kredi cash, the dose counter, cash in and out, an
 * opening without sale, a reprint, a sale after midnight, then the counts and closings.
 * @param {Venue} v
 * @param {string} tillBank
 */
function cafeDay(v, tillBank) {
  const { ids, at, ev } = v;
  const aliBank = newId("bnk");
  const machine = newId("mch");
  /** @type {{ caller: import("../src/sync-rules.js").Caller, events: import("@brandhub/kit/events").EventEnvelope[] }[]} */
  const pushes = [];
  const till = (/** @type {any[]} */ events) => pushes.push({ caller: v.callers.till, events });
  const phone = (/** @type {any[]} */ events) => pushes.push({ caller: v.callers.phone, events });

  till([
    ev({
      device: ids.till,
      staff: ids.karim,
      type: "machine.reading",
      entity: machine,
      data: { reading: 18400, kind: "open", businessDate: v.businessDay },
      at: at(7, 1),
    }),
  ]);
  phone([
    ev({
      device: ids.phone,
      staff: ids.ali,
      type: "bank.opened",
      entity: aliBank,
      data: { kind: "waiter", holder: ids.ali, floatCentimes: 0 },
      at: at(7, 5),
    }),
  ]);
  till(
    v.sale({
      device: ids.till,
      staff: ids.sara,
      bank: tillBank,
      when: at(8, 0),
      lines: [
        ["noir", 2],
        ["msemen", 1],
      ],
      pay: { tender: "cash", amount: 2500, tendered: 5000 },
      receiptNo: "C1-000001",
    }).events,
  );
  const c2 = v.sale({
    device: ids.till,
    staff: ids.sara,
    bank: tillBank,
    when: at(9, 0),
    lines: [
      ["creme", 1],
      ["the", 1],
    ],
    pay: { tender: "card_external", amount: 2000, reference: "4411" },
    receiptNo: "C1-000002",
  });
  till(c2.events);
  // a 10 % discount approved by Karim
  const disc = v.sale({
    device: ids.till,
    staff: ids.sara,
    bank: tillBank,
    when: at(10, 0),
    lines: [
      ["the", 3],
      ["msemen", 2],
    ],
  });
  till([
    ...disc.events,
    disc.next("discount.set", { kind: "percent", value: 1000, reason: "habitué", approvedBy: ids.karim }),
    disc.next("payment.added", {
      paymentId: newId("pay"),
      tender: "maroc_pay",
      amountCentimes: 3060,
      reference: "MP-1",
      bankId: tillBank,
    }),
    disc.next("order.closed", { receiptNo: "C1-000003" }),
  ]);
  // table orders on the phone, a void after sending, a merge, cash into Ali's bank
  const t2 = v.sale({
    device: ids.phone,
    staff: ids.ali,
    when: at(12, 0),
    mode: "table",
    tableId: newId("tbl"),
    lines: [
      ["noir", 2],
      ["msemen", 1],
    ],
    send: true,
  });
  const t4 = v.sale({
    device: ids.phone,
    staff: ids.ali,
    when: at(12, 10),
    mode: "table",
    tableId: newId("tbl"),
    lines: [["creme", 1]],
    send: true,
  });
  phone([...t2.events, ...t4.events]);
  phone([t2.next("line.voided", { lineId: t2.lineIds[1], reason: "renvoyé", approvedBy: ids.karim })]);
  return { pushes, aliBank, machine, t2, t4, moveId: newId("lin"), c2 };
}

test("rebuild() gives identical projections, and the day's numbers equal the kit's buildDay", async () => {
  const s = await ready();
  const { v, store, all } = s;
  const { pushes, aliBank, machine, t2, t4, moveId, c2 } = cafeDay(v, s.tillBank);
  for (const p of pushes) {
    const r = await store.append(p.events, p.caller);
    assert.deepEqual(r.rejected, [], JSON.stringify(r.rejected));
  }
  const { ids, at, ev } = v;
  // merge table 2's two coffees into table 4 (the snapshots are the lines as the source holds them)
  const source = /** @type {any} */ (store.projections.order(t2.id));
  /** @type {import("@brandhub/kit/order").Line[]} */
  const moved = source.lines.filter((/** @type {any} */ l) => !l.voided);
  const snaps = moved.map(({ movedTo, movedFrom, voided, voidReason, totalCentimes, ...rest }) => rest);
  const lineIds = moved.map((/** @type {any} */ l) => l.lineId);
  const pairAndRest = [
    t2.next("lines.moved_out", { moveId, toOrderId: t4.id, lineIds }),
    t4.next("lines.moved_in", { moveId, fromOrderId: t2.id, lines: snaps }),
    t2.next("order.voided", { reason: "fusion" }),
    t4.next("payment.added", {
      paymentId: newId("pay"),
      tender: "cash",
      amountCentimes: 3200,
      tenderedCentimes: 4000,
      bankId: aliBank,
    }),
    t4.next("order.closed", { receiptNo: "S1-000001" }),
  ];
  const customer = newId("cus");
  const rest = [
    { caller: v.callers.phone, events: pairAndRest },
    // a voided order (nothing sent), a TEST order, a credit note of C1-000002's tea, Kredi cash
    {
      caller: v.callers.till,
      events: (() => {
        const o = v.sale({ device: ids.till, staff: ids.sara, when: at(14, 0), lines: [["noir", 1]] });
        return [...o.events, o.next("order.voided", { reason: "erreur" })];
      })(),
    },
    {
      caller: v.callers.till,
      events: v.sale({
        device: ids.till,
        staff: ids.sara,
        bank: s.tillBank,
        when: at(14, 30),
        training: true,
        lines: [["creme", 2]],
        pay: { tender: "cash", amount: 2400 },
        receiptNo: "TC1-000001",
      }).events,
    },
    {
      caller: v.callers.till,
      events: v.sale({
        device: ids.till,
        staff: ids.sara,
        bank: s.tillBank,
        when: at(15, 0),
        lines: [["the", -1]],
        pay: { tender: "cash", amount: -800 },
        receiptNo: "C1-000004",
        refundOf: { orderId: c2.id, receiptNo: "C1-000002", restock: false },
      }).events,
    },
    {
      caller: v.callers.till,
      events: [
        ev({
          device: ids.till,
          staff: ids.sara,
          type: "kredi.repaid",
          entity: customer,
          data: { amountCentimes: 4500, tender: "cash", bankId: s.tillBank },
          at: at(16, 0),
        }),
      ],
    },
    {
      caller: v.callers.till,
      events: [
        ev({
          device: ids.till,
          staff: ids.sara,
          type: "machine.off_till",
          entity: machine,
          data: { doses: 2, reason: "staff" },
          at: at(16, 30),
        }),
      ],
    },
    {
      caller: v.callers.till,
      events: [
        ev({
          device: ids.till,
          staff: ids.sara,
          type: "bank.cash_in",
          entity: s.tillBank,
          data: { amountCentimes: 10000, reason: "monnaie" },
          at: at(17, 0),
        }),
        ev({
          device: ids.till,
          staff: ids.sara,
          type: "bank.cash_out",
          entity: s.tillBank,
          data: { amountCentimes: 5000, reason: "fournisseur", approvedBy: ids.karim },
          at: at(17, 5),
        }),
        ev({
          device: ids.till,
          staff: ids.sara,
          type: "bank.no_sale",
          entity: s.tillBank,
          data: { reason: "monnaie", approvedBy: ids.karim },
          at: at(17, 10),
        }),
        ev({
          device: ids.till,
          staff: ids.sara,
          type: "bank.reprint",
          entity: s.tillBank,
          data: { orderId: c2.id, receiptNo: "C1-000002" },
          at: at(17, 15),
        }),
      ],
    },
    // a sale at 01:30 the next morning still belongs to the day (cut-off 05:00)
    {
      caller: v.callers.till,
      events: v.sale({
        device: ids.till,
        staff: ids.sara,
        bank: s.tillBank,
        when: at(25, 30),
        lines: [["noir", 1]],
        pay: { tender: "cash", amount: 1000 },
        receiptNo: "C1-000005",
      }).events,
    },
    {
      caller: v.callers.till,
      events: [
        ev({
          device: ids.till,
          staff: ids.karim,
          type: "machine.reading",
          entity: machine,
          data: { reading: 18460, kind: "close", businessDate: v.businessDay },
          at: at(25, 40),
        }),
        ev({
          device: ids.till,
          staff: ids.sara,
          type: "bank.counted",
          entity: s.tillBank,
          data: { countedCentimes: 106000 },
          at: at(25, 45),
        }),
        ev({ device: ids.till, staff: ids.sara, type: "bank.closed", entity: s.tillBank, data: {}, at: at(25, 46) }),
      ],
    },
    {
      caller: v.callers.phone,
      events: [
        ev({
          device: ids.phone,
          staff: ids.ali,
          type: "bank.counted",
          entity: aliBank,
          data: { countedCentimes: 3200 },
          at: at(23, 0),
        }),
        ev({ device: ids.phone, staff: ids.ali, type: "bank.closed", entity: aliBank, data: {}, at: at(23, 1) }),
      ],
    },
  ];
  for (const p of rest) {
    const r = await store.append(p.events, p.caller);
    assert.deepEqual(r.rejected, [], JSON.stringify(r.rejected));
  }
  assert.deepEqual(await store.verify(), { ok: true });

  // the day's numbers: the store's daily projection equals the kit over the same events
  const everything = store.pull(0, "office", 500);
  assert.equal(everything.more, false);
  const kit = buildDay(everything.events, { businessDate: v.businessDay, cutoff: "05:00" });
  const report = store.dailyReport(v.businessDay);
  assert.deepEqual(report, kit);
  assert.ok(
    kit.revenueCentimes > 0 && kit.tickets.count === 5 && kit.creditNotes.count === 1,
    JSON.stringify(kit.tickets),
  );
  assert.equal(kit.banks.length, 2);
  assert.equal(kit.doses.machineDoses, 60);
  const [daily] = all("SELECT * FROM daily WHERE business_date = ?", v.businessDay);
  assert.deepEqual(
    {
      revenue: daily.revenue,
      tickets: daily.tickets,
      covers: daily.covers,
      noSales: daily.no_sales,
      reprints: daily.reprints,
      dirty: daily.dirty,
    },
    {
      revenue: kit.revenueCentimes,
      tickets: kit.tickets.count,
      covers: kit.covers,
      noSales: kit.noSales,
      reprints: kit.reprints,
      dirty: 0,
    },
  );
  assert.deepEqual(JSON.parse(/** @type {string} */ (daily.vat)), kit.vat);
  assert.deepEqual(JSON.parse(/** @type {string} */ (daily.report)), JSON.parse(JSON.stringify(kit)));
  // the bank rows hold the kit's expected cash and variance
  for (const b of kit.banks) {
    assert.deepEqual(all("SELECT expected, counted, variance FROM banks WHERE id = ?", b.id), [
      { expected: b.expectedCentimes, counted: b.countedCentimes, variance: b.gapCentimes },
    ]);
  }
  // the sales lines add up to the revenue (TEST order left out, credit note negative)
  assert.equal(
    all("SELECT SUM(net_ttc) AS n FROM sales_lines WHERE business_date = ?", v.businessDay)[0].n,
    kit.revenueCentimes,
  );
  assert.equal(
    all("SELECT SUM(vat) AS n FROM sales_lines WHERE business_date = ?", v.businessDay)[0].n,
    kit.vatCentimes,
  );

  // rebuild: the same projections, the log untouched
  store.refresh();
  const before = snapshot(all);
  const log = all("SELECT * FROM events ORDER BY pos");
  const rebuilt = await store.rebuild();
  assert.equal(rebuilt.events, log.length);
  assert.deepEqual(snapshot(all), before);
  assert.deepEqual(all("SELECT * FROM events ORDER BY pos"), log);
  // a damaged projection is repaired by a rebuild
  s.storage.db.exec("DELETE FROM orders; UPDATE banks SET expected = 0");
  await store.rebuild();
  assert.deepEqual(snapshot(all), before);
  assert.deepEqual(store.dailyReport(v.businessDay), JSON.parse(JSON.stringify(kit)));
});

test("pull sends each device kind its part of the log (docs/04 §3)", async () => {
  const { v, store, tillBank } = await ready();
  // a counter order paid and sent a few minutes ago (the screen rule looks at the server's clock)
  const closed = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    when: Date.now() - 10 * 60_000,
    lines: [["noir", 1]],
    send: true,
    pay: { tender: "cash", amount: 1000 },
    receiptNo: "C1-000001",
  });
  const open = v.sale({
    device: v.ids.phone,
    staff: v.ids.ali,
    mode: "table",
    tableId: newId("tbl"),
    lines: [["the", 2]],
    send: true,
  });
  await store.append(closed.events, v.callers.till);
  await store.append(open.events, v.callers.phone);
  const all = store.pull(0, "office");
  assert.equal(all.events.length, all.last);
  assert.equal(all.more, false);
  assert.deepEqual(Object.keys(all.events[0]).sort(), [
    "at",
    "clockSkew",
    "data",
    "device",
    "entity",
    "id",
    "pos",
    "recvAt",
    "relayedBy",
    "seq",
    "staff",
    "type",
    "v",
  ]);

  const till = store.pull(0, "till");
  const types = (/** @type {{ events: { type: string, entity: string }[] }} */ p, /** @type {string} */ entity) =>
    p.events.filter((e) => e.entity === entity).map((e) => e.type);
  assert.deepEqual(types(till, closed.id), ["order.closed"], "a closed order: only how it ended");
  assert.deepEqual(
    types(till, open.id),
    open.events.map((e) => e.type),
    "an open order: everything",
  );
  assert.ok(till.events.some((e) => e.type === "staff.set") && till.events.some((e) => e.type === "device.set"));
  assert.deepEqual(types(till, tillBank), ["bank.opened"], "an open bank");
  assert.equal(till.last, all.last, "the filtered tail is skipped");

  const screen = store.pull(0, "screen");
  assert.ok(
    types(screen, closed.id).includes("lines.sent"),
    "a counter order paid before it is made still reaches the bar",
  );
  assert.ok(!types(screen, closed.id).includes("payment.added"));
  assert.ok(!screen.events.some((e) => e.type === "staff.set" || e.type === "bank.opened"));

  // pages: `more` and `last`
  const page = store.pull(0, "office", 5);
  assert.equal(page.events.length, 5);
  assert.equal(page.more, true);
  assert.equal(page.last, 5);
  const next = store.pull(page.last, "office", 500);
  assert.equal(next.events[0].pos, 6);
  assert.throws(() => store.pull(-1, "office"), TypeError);
  assert.throws(() => store.pull(0, /** @type {any} */ ("printer")), TypeError);
  assert.equal(store.pull(0, "office", 10_000).events.length, all.events.length);
});

test("appends started together are serialised: one chain, consecutive positions", async () => {
  const { v, store } = await ready();
  const batches = Array.from({ length: 5 }, () => [
    v.ev({ device: v.ids.till, staff: v.ids.sara, type: "table.mark", entity: newId("tbl"), data: { state: "free" } }),
    v.ev({
      device: v.ids.till,
      staff: v.ids.sara,
      type: "table.mark",
      entity: newId("tbl"),
      data: { state: "cleaning" },
    }),
  ]);
  const results = await Promise.all(batches.map((b) => store.append(b, v.callers.till)));
  assert.deepEqual(
    results.map((r) => r.last),
    [12, 14, 16, 18, 20],
  );
  assert.deepEqual(await store.verify(), { ok: true });
});

test("marks keep the last writer by (at, device, id), whatever the arrival order", async () => {
  const { v, store, all } = await ready();
  const later = v.office("settings.set", v.ids.tenant, { path: "reports.eveningTime", value: "22:00" }, v.at(9, 0));
  const earlier = v.office("settings.set", v.ids.tenant, { path: "reports.eveningTime", value: "21:00" }, v.at(8, 0));
  await store.append([later], v.callers.office);
  await store.append([earlier], v.callers.office);
  assert.deepEqual(all("SELECT value FROM settings WHERE path = 'reports.eveningTime'"), [{ value: '"22:00"' }]);
  // kitchen status per (order, sent event, station)
  const sale = v.sale({ device: v.ids.till, staff: v.ids.sara, lines: [["noir", 1]], send: true });
  await store.append(sale.events, v.callers.till);
  const sent = sale.events.find((e) => e.type === "lines.sent");
  const status = (/** @type {string} */ st, /** @type {number} */ at) =>
    v.ev({
      device: v.ids.screen,
      staff: null,
      type: "kitchen.status",
      entity: sale.id,
      data: { sentEventId: sent?.id, station: "bar", status: st },
      at,
    });
  await store.append([status("ready", v.at(10, 5)), status("preparing", v.at(10, 1))], v.callers.screen);
  assert.deepEqual(all("SELECT station, status, held FROM kitchen_tickets WHERE order_id = ?", sale.id), [
    { station: "bar", status: "ready", held: 0 },
  ]);
});

test("a day's numbers are recomputed when an event changes them, a bank of the day before included", async () => {
  const { v, store, all, tillBank } = await ready();
  const first = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    when: v.at(10, 0),
    lines: [["noir", 1]],
    pay: { tender: "cash", amount: 1000 },
    receiptNo: "C1-000001",
  });
  await store.append(first.events, v.callers.till);
  const day = v.businessDay;
  assert.equal(store.dailyReport(day).revenueCentimes, 1000);
  assert.deepEqual(all("SELECT dirty FROM daily WHERE business_date = ?", day), [{ dirty: 0 }]);
  // the next morning after the cut-off: a new business day, paid by card into the bank opened the day before
  const next = v.sale({
    device: v.ids.till,
    staff: v.ids.sara,
    bank: tillBank,
    when: v.at(29, 0),
    lines: [["creme", 1]],
    pay: { tender: "card_external", amount: 1200, reference: "77" },
    receiptNo: "C1-000002",
  });
  await store.append(next.events, v.callers.till);
  assert.deepEqual(
    all("SELECT dirty FROM daily WHERE business_date = ?", day),
    [{ dirty: 1 }],
    "the bank's day is dirty too",
  );
  const report = store.dailyReport(day);
  const kit = buildDay(store.pull(0, "office").events, { businessDate: day, cutoff: "05:00" });
  assert.deepEqual(report, kit);
  assert.equal(report.revenueCentimes, 1000, "the card sale belongs to the next day");
  assert.deepEqual(report.banks[0].tenders, { cash: 1000, card_external: 1200 }, "but the bank's Z lists it");
  const nextDay = all("SELECT business_date FROM orders WHERE id = ?", next.id)[0].business_date;
  assert.notEqual(nextDay, day);
  assert.equal(store.dailyReport(/** @type {string} */ (nextDay)).revenueCentimes, 1200);
  assert.throws(() => store.dailyReport("2026-02-30"), RangeError);
});

test("the store's SQL binds plain ? placeholders, which node:sqlite binds from Node 22.13 (package.json engines)", () => {
  const src = new URL("../src/", import.meta.url);
  for (const file of readdirSync(src).filter((f) => f.endsWith(".js"))) {
    const numbered = readFileSync(new URL(file, src), "utf8").match(/\?\d+\b/g);
    assert.equal(numbered, null, `${file}: numbered placeholders ${numbered}`);
  }
});
