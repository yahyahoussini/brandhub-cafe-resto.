// @ts-check
/**
 * Helpers of the kit-worker specs that run inside workerd (`*.spec.js`): the test Worker's STORE binding (a TenantStore
 * subclass, test/worker.js), reached through `jurisdictionStore` like the products' Workers; the store's RPC methods
 * typed from `Store`; SQL reads inside the Durable Object; and dumps of its tables.
 */
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { CLOUD_DEVICE } from "@brandhub/kit/events";
import { uuidv7 } from "@brandhub/kit/ids";
import { jurisdictionStore } from "../src/jurisdiction.js";

/** @typedef {import("./worker.js").TestStore} TestStore */
/** @typedef {import("../src/store.js").Store} Store */
/** @typedef {import("../src/sync-rules.js").Caller} Caller */
/** @typedef {import("@brandhub/kit/events").EventEnvelope} EventEnvelope */
/** @typedef {"append" | "pull" | "verify" | "rebuild" | "dailyReport" | "refresh"} StoreMethod */
/**
 * The store's RPC methods as the stub serves them (async), typed from Store itself: the Workers RPC stub types are
 * too deep for these results.
 * @typedef {{ [K in StoreMethod]: (...args: Parameters<Store[K]>) => Promise<Awaited<ReturnType<Store[K]>>> }} StoreApi
 */
/** @typedef {DurableObjectStub<TestStore>} Stub */

const testEnv = /** @type {{ STORE: DurableObjectNamespace<TestStore>, ENVIRONMENT: string }} */ (
  /** @type {unknown} */ (env)
);

/** The test Worker's TenantStore namespace (vitest.config.js). */
export const STORE = testEnv.STORE;

/**
 * A client's store, reached as the Worker reaches it (EU jurisdiction; the local fallback only because ENVIRONMENT is
 * "local" in vitest.config.js).
 * @param {string} tenantId
 * @returns {Stub}
 */
export const storeOf = (tenantId) => jurisdictionStore(testEnv, tenantId);

/** @param {Stub} stub @returns {StoreApi} */
export const api = (stub) => /** @type {StoreApi} */ (/** @type {unknown} */ (stub));

/**
 * Rows of a query run inside the Durable Object.
 * @param {Stub} stub
 * @param {string} query
 * @param {...any} bindings
 * @returns {Promise<Record<string, any>[]>}
 */
export function rows(stub, query, ...bindings) {
  return runInDurableObject(stub, (_i, state) => state.storage.sql.exec(query, ...bindings).toArray());
}

/**
 * The number of rows of a table.
 * @param {Stub} stub
 * @param {string} table
 * @returns {Promise<number>}
 */
export async function count(stub, table) {
  const [{ n }] = await rows(stub, `SELECT COUNT(*) AS n FROM ${table}`);
  return /** @type {number} */ (n);
}

/**
 * Every row of each table, as sorted JSON strings (a comparison that ignores row order).
 * @param {Stub} stub
 * @param {readonly string[]} tables
 */
export async function dump(stub, tables) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const t of tables) out[t] = (await rows(stub, `SELECT * FROM ${t}`)).map((r) => JSON.stringify(r)).sort();
  return out;
}

/**
 * The client's owner account (prompt 05 creates it at activation; the back office writes with its own_… id).
 * @param {Stub} stub
 * @param {string} ownerId
 */
export function addOwner(stub, ownerId) {
  return runInDurableObject(stub, (_i, state) => {
    state.storage.sql.exec(
      "INSERT INTO owners (id, email, role, created_at) VALUES (?, ?, 'owner', ?)",
      ownerId,
      "proprietaire@example.test",
      Date.now(),
    );
  });
}

/**
 * A back-office event (the owner, writing as dev_cloud).
 * @param {string} ownerId
 * @param {string} type
 * @param {string} entity
 * @param {Record<string, any>} data
 * @param {number} at
 * @returns {EventEnvelope}
 */
export function officeEvent(ownerId, type, entity, data, at) {
  return { id: uuidv7(at), type, entity, seq: null, device: CLOUD_DEVICE, staff: ownerId, at, data, v: 1 };
}

/** The back office as a caller. @type {Caller} */
export const OFFICE = Object.freeze({ device: CLOUD_DEVICE, kind: "office" });

/** @param {{ rejected: { code: string }[] }} r */
export const codes = (r) => r.rejected.map((x) => x.code);
