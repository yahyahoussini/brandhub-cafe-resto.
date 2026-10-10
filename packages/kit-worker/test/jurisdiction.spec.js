// @ts-check
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { JURISDICTION, LOCAL_JURISDICTION_ERROR, jurisdictionStore } from "../src/jurisdiction.js";

const TENANT = "tnt_0196f4c1-2b3c-7d4e-8f50-6a7b8c9d0e1f";
const OTHER = "tnt_0196f4c1-2b3c-7d4e-8f50-6a7b8c9d0e20";

/**
 * A fake namespace that records its calls. `throwOnJurisdiction` makes `jurisdiction()` throw that error.
 * @param {Error} [throwOnJurisdiction]
 */
function fakeNamespace(throwOnJurisdiction) {
  /** @type {string[]} */
  const calls = [];
  /** @param {string} scope */
  const scoped = (scope) => ({
    /** @param {string} name */
    idFromName(name) {
      calls.push(`${scope}.idFromName(${name})`);
      return { scope, name };
    },
    /** @param {{ scope: string, name: string }} id */
    get(id) {
      calls.push(`${scope}.get(${id.scope}:${id.name})`);
      return { stubFor: id };
    },
  });
  const ns = {
    ...scoped("plain"),
    /** @param {string} j */
    jurisdiction(j) {
      calls.push(`jurisdiction(${j})`);
      if (throwOnJurisdiction) throw throwOnJurisdiction;
      return scoped(j);
    },
  };
  return { calls, STORE: /** @type {DurableObjectNamespace<undefined>} */ (/** @type {unknown} */ (ns)) };
}

describe("jurisdictionStore with a fake namespace", () => {
  it("always asks the EU jurisdiction for the id and the stub", () => {
    const { calls, STORE } = fakeNamespace();
    for (const ENVIRONMENT of ["local", "staging", "production", undefined]) {
      calls.length = 0;
      const stub = jurisdictionStore({ STORE, ENVIRONMENT }, TENANT);
      expect(stub).toEqual({ stubFor: { scope: "eu", name: TENANT } });
      expect(calls).toEqual(["jurisdiction(eu)", `eu.idFromName(${TENANT})`, `eu.get(eu:${TENANT})`]);
    }
    expect(JURISDICTION).toBe("eu");
  });

  it("falls back to the plain namespace only for workerd's local error with ENVIRONMENT local", () => {
    const { calls, STORE } = fakeNamespace(new Error(LOCAL_JURISDICTION_ERROR));
    const stub = jurisdictionStore({ STORE, ENVIRONMENT: "local" }, TENANT);
    expect(stub).toEqual({ stubFor: { scope: "plain", name: TENANT } });
    expect(calls).toEqual(["jurisdiction(eu)", `plain.idFromName(${TENANT})`, `plain.get(plain:${TENANT})`]);
  });

  it("propagates the local error outside ENVIRONMENT local, so staging and production never leave the EU", () => {
    for (const ENVIRONMENT of ["staging", "production", "", "LOCAL", undefined]) {
      const { calls, STORE } = fakeNamespace(new Error(LOCAL_JURISDICTION_ERROR));
      expect(() => jurisdictionStore({ STORE, ENVIRONMENT }, TENANT)).toThrow(LOCAL_JURISDICTION_ERROR);
      expect(calls).toEqual(["jurisdiction(eu)"]);
    }
  });

  it("propagates any other error, even locally", () => {
    for (const err of [new Error("jurisdiction unavailable"), new Error(`${LOCAL_JURISDICTION_ERROR} `)]) {
      const { calls, STORE } = fakeNamespace(err);
      expect(() => jurisdictionStore({ STORE, ENVIRONMENT: "local" }, TENANT)).toThrow(err.message);
      expect(calls).toEqual(["jurisdiction(eu)"]);
    }
  });

  it("refuses anything but a tenant id", () => {
    const { calls, STORE } = fakeNamespace();
    for (const bad of ["", "tnt_", "tnt_123", "dev_0196f4c1-2b3c-7d4e-8f50-6a7b8c9d0e1f", ` ${TENANT}`]) {
      expect(() => jurisdictionStore({ STORE, ENVIRONMENT: "local" }, bad)).toThrow(TypeError);
    }
    expect(calls).toEqual([]);
  });
});

describe("jurisdictionStore in workerd", () => {
  const STORE = /** @type {{ STORE: DurableObjectNamespace<import("./worker.js").TestStore> }} */ (
    /** @type {unknown} */ (env)
  ).STORE;

  it("local workerd throws exactly the error the fallback expects", () => {
    expect(() => STORE.jurisdiction("eu").idFromName(TENANT)).toThrow(LOCAL_JURISDICTION_ERROR);
  });

  it("reaches the same store for the same tenant and another for another tenant (ENVIRONMENT local)", async () => {
    const a = await jurisdictionStore({ STORE, ENVIRONMENT: "local" }, TENANT).whoAmI();
    const again = await jurisdictionStore({ STORE, ENVIRONMENT: "local" }, TENANT).whoAmI();
    const b = await jurisdictionStore({ STORE, ENVIRONMENT: "local" }, OTHER).whoAmI();
    expect(a.product).toBe("cafe");
    expect(again.id).toBe(a.id);
    expect(b.id).not.toBe(a.id);
  });

  it("refuses to fall back in workerd when ENVIRONMENT is staging or production", () => {
    for (const ENVIRONMENT of ["staging", "production"]) {
      expect(() => jurisdictionStore({ STORE, ENVIRONMENT }, TENANT)).toThrow(LOCAL_JURISDICTION_ERROR);
    }
  });
});
