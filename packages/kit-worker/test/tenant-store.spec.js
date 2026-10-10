// @ts-check
/**
 * The TenantStore Durable Object inside workerd, over RPC (prompt 04): the schema comes from the migrations at start,
 * two clients are isolated, a duplicate batch stores nothing, a tampered row breaks `verify` at its position, `rebuild()`
 * gives the same projections, a whole-batch refusal keeps its code across RPC, and the store survives a restart.
 * The rules themselves are covered on node:sqlite by store.test.js (the same code).
 */
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { newId } from "@brandhub/kit/ids";
import { LATEST_VERSION } from "../src/migrations.js";
import { PROJECTION_TABLES } from "../src/projections.js";
import { venue } from "./fixtures.js";
import { addOwner, api, dump, rows, storeOf } from "./workerd.js";

/**
 * The store of a new client, with its owner account (prompt 05 fills that table) and the venue set up.
 * @param {ReturnType<typeof venue>} v
 */
async function client(v) {
  const stub = storeOf(v.ids.tenant);
  await addOwner(stub, v.ids.owner);
  const r = await api(stub).append(v.setup(), v.callers.office);
  expect(r.rejected).toEqual([]);
  return stub;
}

/** @param {import("./workerd.js").Stub} stub */
const projections = (stub) => dump(stub, PROJECTION_TABLES);

describe("TenantStore in workerd", () => {
  it("starts on the migrated schema, its version in _schema (PRAGMA user_version is refused here)", async () => {
    const v = venue();
    const stub = await client(v);
    expect(await rows(stub, "SELECT version FROM _schema")).toEqual([{ version: LATEST_VERSION }]);
    const tables = (await rows(stub, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'")).length;
    expect(tables).toBe(1);
    await expect(rows(stub, "PRAGMA user_version")).rejects.toThrow(/SQLITE_AUTH|not authorized/);
  });

  it("keeps two clients apart: a store never sees the other's events", async () => {
    const a = venue();
    const b = venue();
    const storeA = await client(a);
    const storeB = await client(b);
    const bank = newId("bnk");
    const opened = a.ev({
      device: a.ids.till,
      staff: a.ids.sara,
      type: "bank.opened",
      entity: bank,
      data: { kind: "till", holder: a.ids.sara, floatCentimes: 50000 },
    });
    expect((await api(storeA).append([opened], a.callers.till)).accepted).toEqual([opened.id]);
    // B does not know A's till, staff or event
    const refused = await api(storeB).append([opened], a.callers.till);
    expect(refused.rejected.map((r) => r.code)).toEqual(["E_UNKNOWN_DEVICE"]);
    const inA = (await api(storeA).pull(0, "office")).events.map((e) => e.id);
    const inB = (await api(storeB).pull(0, "office")).events.map((e) => e.id);
    expect(inA).toContain(opened.id);
    expect(inB).not.toContain(opened.id);
    expect(inB.some((id) => inA.includes(id))).toBe(false);
    // an event naming another client's tenant id is refused (the store knows its own from idFromName)
    const foreign = a.office("settings.set", b.ids.tenant, { path: "receipt.width", value: 32 });
    expect((await api(storeA).append([foreign], a.callers.office)).rejected.map((r) => r.code)).toEqual(["E_ENTITY"]);
  });

  it("acknowledges a duplicate batch and stores nothing twice", async () => {
    const v = venue();
    const stub = await client(v);
    const bank = newId("bnk");
    const opened = v.ev({
      device: v.ids.till,
      staff: v.ids.sara,
      type: "bank.opened",
      entity: bank,
      data: { kind: "till", holder: v.ids.sara, floatCentimes: 50000 },
    });
    await api(stub).append([opened], v.callers.till);
    const sale = v.sale({
      device: v.ids.till,
      staff: v.ids.sara,
      bank,
      lines: [["noir", 2]],
      pay: { tender: "cash", amount: 2000 },
      receiptNo: "C1-000001",
    });
    const first = await api(stub).append(sale.events, v.callers.till);
    const [{ n }] = await rows(stub, "SELECT COUNT(*) AS n FROM events");
    const again = await api(stub).append(sale.events, v.callers.till);
    expect(again).toMatchObject({
      accepted: [],
      duplicates: sale.events.map((e) => e.id),
      rejected: [],
      last: first.last,
    });
    expect(await rows(stub, "SELECT COUNT(*) AS n FROM events")).toEqual([{ n }]);
  });

  it("fails verify at the position of a tampered row, and rebuild() gives identical projections", async () => {
    const v = venue();
    const stub = await client(v);
    const bank = newId("bnk");
    await api(stub).append(
      [
        v.ev({
          device: v.ids.till,
          staff: v.ids.sara,
          type: "bank.opened",
          entity: bank,
          data: { kind: "till", holder: v.ids.sara, floatCentimes: 50000 },
        }),
      ],
      v.callers.till,
    );
    for (const n of [1, 2, 3]) {
      const sale = v.sale({
        device: v.ids.till,
        staff: v.ids.sara,
        bank,
        lines: [
          ["noir", n],
          ["msemen", 1],
        ],
        send: true,
        pay: { tender: "cash", amount: 1000 * n + 500 },
        receiptNo: `C1-00000${n}`,
      });
      expect((await api(stub).append(sale.events, v.callers.till)).rejected).toEqual([]);
    }
    expect(await api(stub).verify()).toEqual({ ok: true });
    expect(await api(stub).dailyReport(v.businessDay)).toMatchObject({ revenueCentimes: 7500, tickets: { count: 3 } });

    await api(stub).refresh();
    const before = await projections(stub);
    const rebuilt = await api(stub).rebuild();
    expect(rebuilt.events).toBe((await rows(stub, "SELECT COUNT(*) AS n FROM events"))[0].n);
    expect(await projections(stub)).toEqual(before);

    // the log refuses edits; tampering means dropping the guard first
    await expect(rows(stub, "UPDATE events SET data = '{}' WHERE pos = 15")).rejects.toThrow(/never updated/);
    await runInDurableObject(stub, (_i, state) => {
      state.storage.sql.exec("DROP TRIGGER events_no_update");
      const [row] = state.storage.sql.exec("SELECT data FROM events WHERE pos = 15").toArray();
      const data = JSON.parse(/** @type {string} */ (row.data));
      data.amountCentimes = 1;
      state.storage.sql.exec("UPDATE events SET data = ? WHERE pos = 15", JSON.stringify(data));
    });
    expect(await api(stub).verify()).toEqual({ ok: false, pos: 15, reason: "hash_mismatch" });
    expect(await api(stub).verify(1, 14)).toEqual({ ok: true });
  });

  it("refuses a batch over 200 events whole, with its code across RPC", async () => {
    const v = venue();
    const stub = await client(v);
    const many = Array.from({ length: 201 }, () =>
      v.ev({
        device: v.ids.till,
        staff: v.ids.sara,
        type: "table.mark",
        entity: newId("tbl"),
        data: { state: "free" },
      }),
    );
    const err = await api(stub)
      .append(many, v.callers.till)
      .then(
        () => null,
        (/** @type {any} */ e) => e,
      );
    expect(err).toMatchObject({ name: "BatchError", code: "E_TOO_LARGE" });
    expect(await rows(stub, "SELECT COUNT(*) AS n FROM events")).toEqual([{ n: 9 }]);
  });

  it("keeps its log and chain across a restart, and appends after it", async () => {
    const v = venue();
    const stub = await client(v);
    await evictDurableObject(stub);
    const mark = v.ev({
      device: v.ids.till,
      staff: v.ids.sara,
      type: "table.mark",
      entity: newId("tbl"),
      data: { state: "free" },
    });
    expect(await api(stub).append([mark], v.callers.till)).toMatchObject({ accepted: [mark.id], last: 10 });
    expect(await api(stub).verify()).toEqual({ ok: true });
    expect(await rows(stub, "SELECT version FROM _schema")).toEqual([{ version: LATEST_VERSION }]);
  });
});
