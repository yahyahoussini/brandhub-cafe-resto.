// @ts-check
/**
 * jurisdictionStore with a fake namespace (node:test): the EU jurisdiction is always asked first, and the plain
 * namespace is used only for workerd's own "not implemented" error with ENVIRONMENT "local". The same rules run against
 * the real workerd in jurisdiction.spec.js.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { JURISDICTION, LOCAL_JURISDICTION_ERROR, jurisdictionStore } from "../src/jurisdiction.js";

const TENANT = "tnt_0196f4c1-2b3c-7d4e-8f50-6a7b8c9d0e1f";

/** @param {Error} [throwOnJurisdiction] */
function fakeNamespace(throwOnJurisdiction) {
  /** @type {string[]} */
  const calls = [];
  /** @param {string} scope */
  const scoped = (scope) => ({
    /** @param {string} name */
    idFromName(name) {
      calls.push(`${scope}.idFromName`);
      return { scope, name };
    },
    /** @param {{ scope: string, name: string }} id */
    get(id) {
      calls.push(`${scope}.get`);
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

test("every environment reaches the store through the EU jurisdiction", () => {
  assert.equal(JURISDICTION, "eu");
  for (const ENVIRONMENT of ["local", "staging", "production", undefined]) {
    const { calls, STORE } = fakeNamespace();
    assert.deepEqual(jurisdictionStore({ STORE, ENVIRONMENT }, TENANT), { stubFor: { scope: "eu", name: TENANT } });
    assert.deepEqual(calls, ["jurisdiction(eu)", "eu.idFromName", "eu.get"]);
  }
});

test("only workerd's local error, only with ENVIRONMENT local, falls back to the plain namespace", () => {
  const { calls, STORE } = fakeNamespace(new Error(LOCAL_JURISDICTION_ERROR));
  assert.deepEqual(jurisdictionStore({ STORE, ENVIRONMENT: "local" }, TENANT), {
    stubFor: { scope: "plain", name: TENANT },
  });
  assert.deepEqual(calls, ["jurisdiction(eu)", "plain.idFromName", "plain.get"]);
});

test("in staging and production (or any other value) the error propagates: nothing is created outside the EU", () => {
  for (const ENVIRONMENT of ["staging", "production", "", "Local", undefined]) {
    const { calls, STORE } = fakeNamespace(new Error(LOCAL_JURISDICTION_ERROR));
    assert.throws(() => jurisdictionStore({ STORE, ENVIRONMENT }, TENANT), { message: LOCAL_JURISDICTION_ERROR });
    assert.deepEqual(calls, ["jurisdiction(eu)"]);
  }
  for (const err of [new Error("jurisdiction unavailable"), new TypeError(LOCAL_JURISDICTION_ERROR.toLowerCase())]) {
    const { calls, STORE } = fakeNamespace(err);
    assert.throws(() => jurisdictionStore({ STORE, ENVIRONMENT: "local" }, TENANT), { message: err.message });
    assert.deepEqual(calls, ["jurisdiction(eu)"]);
  }
});

test("only a tenant id reaches a store", () => {
  const { calls, STORE } = fakeNamespace();
  for (const bad of ["", "tnt_", "tnt_x", "dev_0196f4c1-2b3c-7d4e-8f50-6a7b8c9d0e1f", `${TENANT} `]) {
    assert.throws(() => jurisdictionStore({ STORE, ENVIRONMENT: "local" }, bad), TypeError);
  }
  assert.deepEqual(calls, []);
});
