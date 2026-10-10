// @ts-check
/**
 * How the Café Worker reaches a client's store (D19, docs/02 §4): only through `jurisdictionStore`, which asks the
 * STORE binding of wrangler.jsonc for the EU jurisdiction, by the client's tenant id. Local workerd has no
 * jurisdictions, so the helper falls back there only because ENVIRONMENT is "local"; with the staging or production
 * value it never does. The lint rule `bh/store-through-jurisdiction` keeps every other read of `env.STORE` out of the
 * Worker's source, index.js included.
 */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CLOUD_DEVICE } from "@brandhub/kit/events";
import { newId, uuidv7 } from "@brandhub/kit/ids";
import { LOCAL_JURISDICTION_ERROR, jurisdictionStore } from "@brandhub/kit-worker/jurisdiction";
import { LATEST_VERSION } from "@brandhub/kit-worker/migrations";
import { CafeStore } from "../src/cafe-store.js";

const PRODUCT = "cafe";

const testEnv = /** @type {import("@brandhub/kit-worker/env").ProductEnv} */ (/** @type {unknown} */ (env));

/**
 * The store's RPC methods used here, typed from Store (the Workers RPC stub types are too deep for these results).
 * @typedef {{
 *   append(events: unknown[], caller: import("@brandhub/kit-worker/sync-rules").Caller): Promise<import("@brandhub/kit-worker/store").AppendResult>,
 *   pull(after?: number, kind?: import("@brandhub/kit/events").DeviceKind): Promise<import("@brandhub/kit-worker/store").PullResult>,
 *   verify(): Promise<{ ok: true } | { ok: false, pos: number, reason: string }>,
 * }} StoreRpc
 */

/** @param {string} tenantId @returns {StoreRpc} */
const storeRpc = (tenantId) => /** @type {StoreRpc} */ (/** @type {unknown} */ (jurisdictionStore(testEnv, tenantId)));

describe("the client's store (CafeStore)", () => {
  it("is reached through jurisdictionStore with the Worker's STORE binding, named by the tenant id", async () => {
    const tenant = newId("tnt");
    const stub = jurisdictionStore(testEnv, tenant);
    const seen = await runInDurableObject(stub, (instance, state) => ({
      store: instance instanceof CafeStore,
      product: instance.product,
      name: state.id.name,
      version: state.storage.sql.exec("SELECT version FROM _schema").one().version,
    }));
    expect(seen).toEqual({ store: true, product: PRODUCT, name: tenant, version: LATEST_VERSION });
    expect(jurisdictionStore(testEnv, tenant).id.equals(stub.id)).toBe(true);
    expect(jurisdictionStore(testEnv, newId("tnt")).id.equals(stub.id)).toBe(false);
  });

  it("asks for the EU jurisdiction first; only local workerd's missing jurisdictions let it fall back", () => {
    expect(testEnv.ENVIRONMENT).toBe("local");
    expect(() => testEnv.STORE.jurisdiction("eu").idFromName(newId("tnt"))).toThrow(LOCAL_JURISDICTION_ERROR);
    for (const ENVIRONMENT of ["staging", "production"]) {
      const deployed = { STORE: testEnv.STORE, ENVIRONMENT };
      expect(() => jurisdictionStore(deployed, newId("tnt")), ENVIRONMENT).toThrow(LOCAL_JURISDICTION_ERROR);
    }
  });

  it("stores, chains and serves one client's events over RPC; another client's store stays empty", async () => {
    const tenant = newId("tnt");
    const store = storeRpc(tenant);
    const till = newId("dev");
    const at = Date.now() - 60_000;
    const paired = {
      id: uuidv7(at),
      type: "device.set",
      entity: till,
      seq: null,
      device: CLOUD_DEVICE,
      staff: null,
      at,
      data: { name: "Caisse 1", kind: "till", prefix: "C1" },
      v: 1,
    };
    const r = await store.append([paired], { device: CLOUD_DEVICE, kind: "cloud" });
    expect(r).toMatchObject({ accepted: [paired.id], duplicates: [], rejected: [], last: 1 });
    expect((await store.pull(0, "office")).events.map((e) => e.id)).toEqual([paired.id]);
    expect(await store.verify()).toEqual({ ok: true });
    expect((await storeRpc(newId("tnt")).pull(0, "office")).events).toEqual([]);
    expect((await storeRpc(tenant).pull(0, "office")).last).toBe(1);
  });
});
