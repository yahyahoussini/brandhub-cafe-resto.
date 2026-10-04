// @ts-check
/**
 * Identifiers created on the device, offline, without coordination.
 *
 * - Event ids are plain UUIDv7 (RFC 9562): 48-bit Unix milliseconds + random bits.
 * - Entity ids are "<prefix>_<uuidv7>" so a log line tells what it points to.
 */

/** Prefixes allowed for entity ids. Keep in sync with docs/03-domain-model.md §2. */
export const PREFIXES = Object.freeze([
  "tnt", // tenant (a client business)
  "own", // owner or manager account
  "dev", // paired device (till, handheld, kitchen screen, Station)
  "stf", // staff member (PIN user)
  "ord", // order
  "lin", // order line
  "pay", // payment
  "bnk", // cash bank (till drawer or a waiter's cash)
  "kit", // kitchen ticket
  "prd", // product
  "cat", // category
  "mod", // modifier
  "zon", // zone (salle, terrasse)
  "tbl", // table
  "itm", // stock item
  "sup", // supplier
  "mch", // coffee machine (dose counter)
  "cus", // customer (Kredi, loyalty)
  "inv", // B2B invoice
  "blk", // receipt number block
  "sit", // site (one per venue; multi-site comes in V2)
  "prt", // printer
  "rsv", // reservation
  "tip", // tip pool of a shift (Borsat)
  "evn", // event night (Mode Match)
  "pur", // purchase order to a supplier (Resto, prompt 33)
  "bok", // order-book entry: a future order with a deposit (prompt 40)
  "trf", // stock transfer between sites (multi-site, prompt 44)
]);

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

/**
 * @param {number} [nowMs] Unix milliseconds
 * @param {Uint8Array} [random] 10 random bytes (tests pass their own)
 * @returns {string}
 */
export function uuidv7(nowMs = Date.now(), random = globalThis.crypto.getRandomValues(new Uint8Array(10))) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 0xffffffffffff) throw new RangeError("bad timestamp");
  if (!(random instanceof Uint8Array) || random.length !== 10) throw new TypeError("random must be 10 bytes");
  const b = new Uint8Array(16);
  let t = nowMs;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b.set(random, 6);
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 9562 variant
  let h = "";
  for (let i = 0; i < 16; i++) h += HEX[b[i]];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** @param {unknown} s */
export function isUuidv7(s) {
  return typeof s === "string" && UUIDV7_RE.test(s);
}

/**
 * Milliseconds encoded in a UUIDv7.
 * @param {string} id
 */
export function uuidv7Time(id) {
  if (!isUuidv7(id)) throw new TypeError("not a uuidv7");
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}

/**
 * @param {string} prefix one of PREFIXES
 * @param {number} [nowMs]
 */
export function newId(prefix, nowMs) {
  if (!PREFIXES.includes(prefix)) throw new RangeError(`unknown id prefix: ${prefix}`);
  return `${prefix}_${uuidv7(nowMs)}`;
}

/**
 * @param {unknown} id
 * @param {string} [prefix] expected prefix
 */
export function isEntityId(id, prefix) {
  if (typeof id !== "string") return false;
  const i = id.indexOf("_");
  if (i < 1) return false;
  const p = id.slice(0, i);
  if (!PREFIXES.includes(p)) return false;
  if (prefix && p !== prefix) return false;
  return isUuidv7(id.slice(i + 1));
}

/**
 * Short, human code for an order or a report ("7F3K-2Q"): the last 6 base-32 characters of the id.
 * Used on pre-bills and in WhatsApp messages. Not unique across a year; always shown with the date.
 * @param {string} id
 */
export function shortCode(id) {
  const hex = id.replace(/[^0-9a-f]/g, "").slice(-8);
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base 32
  let n = parseInt(hex, 16);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out = alphabet[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
