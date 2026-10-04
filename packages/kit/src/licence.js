// @ts-check
/**
 * Offline licence and access status (Master Spec §5, docs/09-control-api.md).
 *
 * admin.brandhub.ma signs the licence with its licence key (Ed25519) and sends it with
 * PUT /api/control/v1/tenants/{id}/subscription. The product stores it and every device downloads it.
 * Devices hold only the public keys, so a device or a product server cannot forge a licence.
 *
 * Token: base64url(canonical JSON payload) + "." + base64url(signature over the first part).
 */

import { base64url, canonicalJson, fromBase64url, signText, verifyText } from "./crypto.js";
import { endOfLocalDay, DEFAULT_TZ } from "./timezone.js";

/** Access statuses shared with admin (Master Spec state diagram). */
export const STATUSES = Object.freeze(["active", "grace", "readonly", "suspended"]);

/**
 * @typedef {object} LicencePayload
 * @property {1} v
 * @property {string} kid key id, for yearly rotation
 * @property {string} tenant tnt_…
 * @property {"cafe" | "resto"} product
 * @property {string} plan
 * @property {Record<string, number>} limits e.g. { sites: 1, tills: 1, handhelds: 5, screens: 1, stations: 1 } (data/plans.json)
 * @property {string[]} modules module keys switched on (docs/01-products.md §4)
 * @property {string} valid_until YYYY-MM-DD, inclusive, client's local time
 * @property {string} grace_until YYYY-MM-DD, inclusive
 * @property {boolean} suspended
 * @property {number} issued_at Unix ms
 */

const REQUIRED = ["kid", "tenant", "product", "plan", "limits", "modules", "valid_until", "grace_until", "issued_at"];

/**
 * @param {LicencePayload} payload
 * @param {CryptoKey} privateKey
 */
export async function signLicence(payload, privateKey) {
  checkPayload(payload);
  const body = base64url(new TextEncoder().encode(canonicalJson(payload)));
  const sig = await signText(privateKey, body);
  return `${body}.${sig}`;
}

/** @param {any} p */
function checkPayload(p) {
  if (!p || p.v !== 1) throw new RangeError("licence version must be 1");
  for (const k of REQUIRED) if (p[k] === undefined || p[k] === null) throw new RangeError(`licence.${k} is required`);
  if (p.product !== "cafe" && p.product !== "resto") throw new RangeError("licence.product must be cafe or resto");
  for (const k of ["valid_until", "grace_until"]) if (!/^\d{4}-\d{2}-\d{2}$/.test(p[k])) throw new RangeError(`licence.${k} must be YYYY-MM-DD`);
  if (p.grace_until < p.valid_until) throw new RangeError("grace_until cannot be before valid_until");
  if (!Array.isArray(p.modules)) throw new RangeError("licence.modules must be an array");
  if (typeof p.suspended !== "boolean") throw new RangeError("licence.suspended must be a boolean");
}

/**
 * Verify a token against the known public keys (by kid) and the expected tenant/product.
 * @param {string} token
 * @param {Record<string, CryptoKey>} publicKeysByKid
 * @param {{ tenant: string, product: "cafe" | "resto" }} expected
 * @returns {Promise<{ ok: true, payload: LicencePayload } | { ok: false, reason: string }>}
 */
export async function verifyLicence(token, publicKeysByKid, expected) {
  if (typeof token !== "string" || token.split(".").length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = token.split(".");
  /** @type {any} */
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const key = publicKeysByKid[payload && payload.kid];
  if (!key) return { ok: false, reason: "unknown_key" };
  if (!(await verifyText(key, body, sig))) return { ok: false, reason: "bad_signature" };
  try {
    checkPayload(payload);
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  if (payload.tenant !== expected.tenant || payload.product !== expected.product) return { ok: false, reason: "wrong_tenant" };
  return { ok: true, payload };
}

/**
 * The time a device may trust: never earlier than the latest time it has already seen.
 * A clock set backwards by more than 5 minutes is reported, and the next shift opening then
 * requires an online check (Master Spec §5, "changing the date cannot extend access").
 * @param {number} deviceNowMs
 * @param {number} lastSeenMs
 */
export function trustedNow(deviceNowMs, lastSeenMs) {
  const rolledBack = deviceNowMs < lastSeenMs - 5 * 60 * 1000;
  return { nowMs: Math.max(deviceNowMs, lastSeenMs), rolledBack };
}

/**
 * Access status at an instant.
 * @param {{ valid_until: string, grace_until: string, suspended: boolean }} lic
 * @param {number} nowMs
 * @param {string} [tz]
 * @returns {"active" | "grace" | "readonly" | "suspended"}
 */
export function accessStatus(lic, nowMs, tz = DEFAULT_TZ) {
  if (lic.suspended) return "suspended";
  if (nowMs < endOfLocalDay(lic.valid_until, tz)) return "active";
  if (nowMs < endOfLocalDay(lic.grace_until, tz)) return "grace";
  return "readonly";
}

/**
 * What each status allows on the till. The till never stops during an open shift: a status change
 * applies at the next shift opening (DECISIONS.md D14).
 * @param {"active" | "grace" | "readonly" | "suspended"} status
 * @param {{ shiftOpen: boolean, clockRolledBack?: boolean, online?: boolean }} ctx
 */
export function tillPermissions(status, ctx) {
  const canOpenShift = (status === "active" || status === "grace") && !(ctx.clockRolledBack && !ctx.online);
  return {
    canSell: ctx.shiftOpen || canOpenShift,
    canOpenShift,
    banner: status === "grace" ? "renewal_due" : status === "readonly" ? "account_readonly" : status === "suspended" ? "account_suspended" : null,
    backOffice: status === "active" || status === "grace" ? "full" : "readonly",
  };
}

/**
 * Is a module switched on for this licence?
 * @param {LicencePayload} lic
 * @param {string} moduleKey
 */
export function hasModule(lic, moduleKey) {
  return lic.modules.includes(moduleKey);
}
