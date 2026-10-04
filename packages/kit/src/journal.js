// @ts-check
/**
 * Tamper-evident journal: every event stored by a client's store carries the SHA-256 of the
 * previous event's hash and its own canonical content (docs/11-compliance.md §3).
 * Changing, removing or reordering one stored event breaks every hash after it.
 *
 * This is an internal integrity control, not a tax certification (Morocco has no POS certification
 * scheme as of September 2026; never write "certifié DGI").
 */

import { canonicalJson, sha256Hex } from "./crypto.js";

export const GENESIS = "0".repeat(64);

/** Fields of a stored event that are covered by the hash. */
const HASHED_FIELDS = ["id", "type", "entity", "seq", "device", "staff", "at", "data", "pos", "recvAt"];

/**
 * @param {Record<string, unknown>} event
 */
function hashedContent(event) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of HASHED_FIELDS) out[k] = event[k] === undefined ? null : event[k];
  return canonicalJson(out);
}

/**
 * @param {string} prevHash
 * @param {Record<string, unknown>} event stored event (with pos and recvAt)
 */
export async function chainHash(prevHash, event) {
  if (!/^[0-9a-f]{64}$/.test(prevHash)) throw new RangeError("prevHash must be 64 hex characters");
  return sha256Hex(`${prevHash}\n${hashedContent(event)}`);
}

/**
 * Verify a run of stored events in pos order. Each event has prevHash and hash.
 * @param {(Record<string, unknown> & { prevHash: string, hash: string, pos: number })[]} events
 * @param {string} [startHash] hash before the first event (GENESIS for a full check)
 * @returns {Promise<{ ok: true, lastHash: string } | { ok: false, brokenAtPos: number, reason: string }>}
 */
export async function verifyChain(events, startHash = GENESIS) {
  let prev = startHash;
  let lastPos = null;
  for (const ev of events) {
    if (lastPos !== null && ev.pos !== lastPos + 1) return { ok: false, brokenAtPos: ev.pos, reason: "gap_in_positions" };
    if (ev.prevHash !== prev) return { ok: false, brokenAtPos: ev.pos, reason: "prev_hash_mismatch" };
    const expected = await chainHash(prev, ev);
    if (ev.hash !== expected) return { ok: false, brokenAtPos: ev.pos, reason: "hash_mismatch" };
    prev = ev.hash;
    lastPos = ev.pos;
  }
  return { ok: true, lastHash: prev };
}
