// @ts-check
/**
 * Small WebCrypto helpers shared by the licence, the control API and the journal.
 * WebCrypto exists in Node 22, Cloudflare Workers and Chrome; Ed25519 is supported in all three
 * (docs/08-security.md §5 explains the fallback for old Android Chrome versions).
 */

const enc = new TextEncoder();

/** @param {Uint8Array} bytes */
export function base64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {string} s */
export function fromBase64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new RangeError("not base64url");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** @param {Uint8Array} bytes */
export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** @param {string | Uint8Array} data */
export async function sha256Hex(data) {
  const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

/**
 * JSON with object keys sorted at every level and no whitespace, so the same value always
 * gives the same bytes (used for signatures and the chained journal).
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  if (typeof value === "object") {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  throw new TypeError(`cannot serialise ${typeof value}`);
}

/** Generate an Ed25519 key pair (admin tool and tests). */
export async function generateSigningKeys() {
  return /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]));
}

/**
 * Import a raw 32-byte Ed25519 public key given as base64url.
 * @param {string} b64
 */
export async function importPublicKey(b64) {
  return crypto.subtle.importKey("raw", fromBase64url(b64), { name: "Ed25519" }, false, ["verify"]);
}

/** @param {CryptoKey} key */
export async function exportPublicKey(key) {
  return base64url(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

/**
 * @param {CryptoKey} privateKey
 * @param {string} message
 */
export async function signText(privateKey, message) {
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

/**
 * @param {CryptoKey} publicKey
 * @param {string} message
 * @param {string} signatureB64
 */
export async function verifyText(publicKey, message, signatureB64) {
  let sig;
  try {
    sig = fromBase64url(signatureB64);
  } catch {
    return false;
  }
  return crypto.subtle.verify({ name: "Ed25519" }, publicKey, sig, enc.encode(message));
}
