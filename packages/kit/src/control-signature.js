// @ts-check
/**
 * Signed calls from admin.brandhub.ma (or tools/admin.mjs until admin exists) to the product's
 * control API (Master Spec §5). Three headers: timestamp (±5 minutes), request id (the same id twice
 * changes nothing) and an Ed25519 signature, plus the key id for rotation.
 *
 * String to sign: METHOD \n PATH \n TIMESTAMP \n REQUEST_ID \n SHA256_HEX(BODY)
 */

import { sha256Hex, signText, verifyText } from "./crypto.js";

export const HEADERS = Object.freeze({
  timestamp: "x-bh-timestamp",
  requestId: "x-bh-request-id",
  signature: "x-bh-signature",
  keyId: "x-bh-key-id",
});

export const MAX_SKEW_SECONDS = 300;

/**
 * @param {{ method: string, path: string, timestamp: number, requestId: string, body: string }} r
 */
export async function stringToSign(r) {
  return [r.method.toUpperCase(), r.path, String(r.timestamp), r.requestId, await sha256Hex(r.body ?? "")].join("\n");
}

/**
 * Build the headers for a signed call.
 * @param {{ method: string, path: string, body: string, requestId: string, keyId: string, privateKey: CryptoKey, nowSeconds?: number }} r
 */
export async function signRequest(r) {
  const timestamp = r.nowSeconds ?? Math.floor(Date.now() / 1000);
  const sts = await stringToSign({ method: r.method, path: r.path, timestamp, requestId: r.requestId, body: r.body });
  return {
    [HEADERS.timestamp]: String(timestamp),
    [HEADERS.requestId]: r.requestId,
    [HEADERS.keyId]: r.keyId,
    [HEADERS.signature]: await signText(r.privateKey, sts),
  };
}

/**
 * Verify a signed call. The caller must also refuse a request id it has already processed
 * (store ids for 24 hours) and return the stored response instead.
 * @param {{ method: string, path: string, body: string, headers: Record<string, string | null | undefined>, publicKeysByKid: Record<string, CryptoKey>, nowSeconds?: number }} r
 * @returns {Promise<{ ok: true, requestId: string, keyId: string } | { ok: false, reason: string }>}
 */
export async function verifyRequest(r) {
  const h = (/** @type {string} */ name) => r.headers[name] ?? r.headers[name.toLowerCase()] ?? null;
  const ts = Number(h(HEADERS.timestamp));
  const requestId = h(HEADERS.requestId);
  const keyId = h(HEADERS.keyId);
  const signature = h(HEADERS.signature);
  if (!Number.isInteger(ts) || !requestId || !keyId || !signature) return { ok: false, reason: "missing_headers" };
  const now = r.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale_timestamp" };
  const key = r.publicKeysByKid[keyId];
  if (!key) return { ok: false, reason: "unknown_key" };
  const sts = await stringToSign({ method: r.method, path: r.path, timestamp: ts, requestId, body: r.body });
  if (!(await verifyText(key, sts, signature))) return { ok: false, reason: "bad_signature" };
  return { ok: true, requestId, keyId };
}
