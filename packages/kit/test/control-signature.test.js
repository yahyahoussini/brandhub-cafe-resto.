// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { HEADERS, signRequest, verifyRequest } from "../src/control-signature.js";
import { generateSigningKeys } from "../src/crypto.js";

test("a signed control call verifies; body, path or time changes break it", async () => {
  const keys = await generateSigningKeys();
  const body = JSON.stringify({ plan: "cafe", valid_until: "2026-12-31", grace_until: "2027-01-15" });
  const path = "/api/control/v1/tenants/tnt_1/subscription";
  const now = 1_790_000_000;
  const headers = await signRequest({ method: "PUT", path, body, requestId: "req-1", keyId: "cmd-2026", privateKey: keys.privateKey, nowSeconds: now });
  const pk = { "cmd-2026": keys.publicKey };
  assert.deepEqual(await verifyRequest({ method: "PUT", path, body, headers, publicKeysByKid: pk, nowSeconds: now + 10 }), { ok: true, requestId: "req-1", keyId: "cmd-2026" });
  assert.equal((await verifyRequest({ method: "PUT", path, body: body + " ", headers, publicKeysByKid: pk, nowSeconds: now })).ok, false);
  assert.equal((await verifyRequest({ method: "PUT", path: path + "x", body, headers, publicKeysByKid: pk, nowSeconds: now })).ok, false);
  assert.deepEqual(await verifyRequest({ method: "PUT", path, body, headers, publicKeysByKid: pk, nowSeconds: now + 301 }), { ok: false, reason: "stale_timestamp" });
  const noSig = { ...headers, [HEADERS.signature]: undefined };
  assert.deepEqual(await verifyRequest({ method: "PUT", path, body, headers: noSig, publicKeysByKid: pk, nowSeconds: now }), { ok: false, reason: "missing_headers" });
});
