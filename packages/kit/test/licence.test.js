import { test } from "node:test";
import assert from "node:assert/strict";
import { accessStatus, hasModule, signLicence, tillPermissions, trustedNow, verifyLicence } from "../src/licence.js";
import { generateSigningKeys } from "../src/crypto.js";
import { zonedToUtc } from "../src/timezone.js";

const base = {
  v: 1,
  kid: "lic-2026",
  tenant: "tnt_cafe_atlas",
  product: "cafe",
  plan: "cafe",
  limits: { sites: 1, tills: 1, handhelds: 5, screens: 1, stations: 1 },
  modules: ["till", "waiter_banking", "dose_counter", "evening_report"],
  valid_until: "2026-12-31",
  grace_until: "2027-01-15",
  suspended: false,
  issued_at: Date.UTC(2026, 10, 30),
};

test("a licence signed by admin verifies on the device", async () => {
  const keys = await generateSigningKeys();
  const token = await signLicence(base, keys.privateKey);
  const r = await verifyLicence(token, { "lic-2026": keys.publicKey }, { tenant: "tnt_cafe_atlas", product: "cafe" });
  assert.equal(r.ok, true);
  assert.ok(r.ok && hasModule(r.payload, "dose_counter"));
});

test("tampering, another tenant or an unknown key are refused", async () => {
  const keys = await generateSigningKeys();
  const other = await generateSigningKeys();
  const token = await signLicence(base, keys.privateKey);
  const [body, sig] = token.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ ...base, plan: "resto" })).toString("base64url");
  const pk = { "lic-2026": keys.publicKey };
  assert.deepEqual(await verifyLicence(`${forgedBody}.${sig}`, pk, { tenant: base.tenant, product: "cafe" }), { ok: false, reason: "bad_signature" });
  assert.deepEqual(await verifyLicence(token, pk, { tenant: "tnt_other", product: "cafe" }), { ok: false, reason: "wrong_tenant" });
  assert.deepEqual(await verifyLicence(token, { "lic-2027": other.publicKey }, { tenant: base.tenant, product: "cafe" }), { ok: false, reason: "unknown_key" });
  assert.deepEqual(await verifyLicence("nonsense", pk, { tenant: base.tenant, product: "cafe" }), { ok: false, reason: "malformed" });
  assert.equal(body.length > 10, true);
});

test("rotation: the device accepts the old and the new key during the switch", async () => {
  const oldKeys = await generateSigningKeys();
  const newKeys = await generateSigningKeys();
  const tokenNew = await signLicence({ ...base, kid: "lic-2027" }, newKeys.privateKey);
  const r = await verifyLicence(tokenNew, { "lic-2026": oldKeys.publicKey, "lic-2027": newKeys.publicKey }, { tenant: base.tenant, product: "cafe" });
  assert.equal(r.ok, true);
});

test("status follows the dates in Casablanca time", () => {
  const at = (y, m, d, h = 12) => zonedToUtc(y, m, d, h, 0);
  assert.equal(accessStatus(base, at(2026, 12, 31, 23)), "active");
  assert.equal(accessStatus(base, at(2027, 1, 1, 0)), "grace");
  assert.equal(accessStatus(base, at(2027, 1, 15, 23)), "grace");
  assert.equal(accessStatus(base, at(2027, 1, 16, 0)), "readonly");
  assert.equal(accessStatus({ ...base, suspended: true }, at(2026, 12, 1)), "suspended");
});

test("the till never stops during an open shift", () => {
  assert.deepEqual(tillPermissions("readonly", { shiftOpen: true }), { canSell: true, canOpenShift: false, banner: "account_readonly", backOffice: "readonly" });
  assert.equal(tillPermissions("readonly", { shiftOpen: false }).canSell, false);
  assert.equal(tillPermissions("suspended", { shiftOpen: true }).canSell, true);
  assert.equal(tillPermissions("grace", { shiftOpen: false }).canOpenShift, true);
  assert.equal(tillPermissions("active", { shiftOpen: false, clockRolledBack: true, online: false }).canOpenShift, false);
  assert.equal(tillPermissions("active", { shiftOpen: false, clockRolledBack: true, online: true }).canOpenShift, true);
});

test("a clock set backwards cannot extend access", () => {
  const last = Date.UTC(2027, 0, 20);
  assert.deepEqual(trustedNow(Date.UTC(2027, 0, 1), last), { nowMs: last, rolledBack: true });
  assert.deepEqual(trustedNow(last + 1000, last), { nowMs: last + 1000, rolledBack: false });
});
