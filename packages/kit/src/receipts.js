// @ts-check
/**
 * Gapless receipt numbers that work offline (docs/03-domain-model.md §7).
 *
 * Each till has its own series ("C1", "C2", …). The server (cloud store, or the Station while the
 * internet is down) hands out blocks of consecutive numbers per till. The till consumes a block
 * locally and asks for the next one when it runs low. Numbers are assigned only when an order
 * closes; a voided order never consumes a number.
 *
 * If a till is reset and loses unsynced tickets, the unused end of its current block is declared
 * abandoned (event receipts.block_abandoned) so the gap is explained in the journal.
 */

export const DEFAULT_BLOCK_SIZE = 500;
export const DEFAULT_LOW_WATER = 150;

/**
 * Server side: the ledger of one till's series.
 * @typedef {{ prefix: string, lastEnd: number, blocks: { blockId: string, start: number, end: number, abandonedFrom: number | null }[] }} SeriesLedger
 */

/**
 * @param {string} prefix
 * @returns {SeriesLedger}
 */
export function newSeries(prefix) {
  if (!/^[A-Z][A-Z0-9]{0,3}$/.test(prefix)) throw new RangeError("prefix must be 1–4 capital letters or digits, starting with a letter");
  return { prefix, lastEnd: 0, blocks: [] };
}

/**
 * Reserve the next block of a series. Pure: returns the new ledger and the block.
 * @param {SeriesLedger} ledger
 * @param {string} blockId
 * @param {number} [size]
 */
export function reserveBlock(ledger, blockId, size = DEFAULT_BLOCK_SIZE) {
  if (!Number.isInteger(size) || size < 10 || size > 10000) throw new RangeError("block size must be 10..10000");
  if (ledger.blocks.some((b) => b.blockId === blockId)) {
    const existing = /** @type {SeriesLedger["blocks"][number]} */ (ledger.blocks.find((b) => b.blockId === blockId));
    return { ledger, block: { ...existing, prefix: ledger.prefix } }; // idempotent retry
  }
  const block = { blockId, start: ledger.lastEnd + 1, end: ledger.lastEnd + size, abandonedFrom: null };
  return { ledger: { ...ledger, lastEnd: block.end, blocks: [...ledger.blocks, block] }, block: { ...block, prefix: ledger.prefix } };
}

/**
 * Mark the unused end of a block as abandoned (after a till reset).
 * @param {SeriesLedger} ledger
 * @param {string} blockId
 * @param {number} lastUsed last number known to be used (0 if none)
 */
export function abandonBlockRest(ledger, blockId, lastUsed) {
  const blocks = ledger.blocks.map((b) => {
    if (b.blockId !== blockId) return b;
    const from = Math.max(b.start, lastUsed + 1);
    if (from > b.end) return b;
    return { ...b, abandonedFrom: from };
  });
  return { ...ledger, blocks };
}

/**
 * Device side: the blocks a till holds.
 * @typedef {{ prefix: string, blocks: { blockId: string, start: number, end: number }[], next: number | null }} TillNumbering
 */

/**
 * @param {string} prefix
 * @returns {TillNumbering}
 */
export function newTillNumbering(prefix) {
  return { prefix, blocks: [], next: null };
}

/**
 * Add a block received from the server. Blocks must arrive in order.
 * @param {TillNumbering} t
 * @param {{ blockId: string, start: number, end: number, prefix: string }} block
 * @returns {TillNumbering}
 */
export function addBlock(t, block) {
  if (block.prefix !== t.prefix) throw new RangeError("block belongs to another series");
  if (t.blocks.some((b) => b.blockId === block.blockId)) return t;
  const last = t.blocks[t.blocks.length - 1];
  if (last && block.start <= last.end) throw new RangeError("blocks must not overlap");
  const blocks = [...t.blocks, { blockId: block.blockId, start: block.start, end: block.end }];
  // Once every held number is used, `next` points past the old block; a block that does not follow it (the rest of a
  // block was abandoned, docs/04 §10 scenario 8) starts at its own first number.
  const holdsNext = t.next !== null && blocks.some((b) => t.next !== null && t.next >= b.start && t.next <= b.end);
  return { ...t, blocks, next: holdsNext ? t.next : block.start };
}

/**
 * Numbers left before the till needs a new block.
 * @param {TillNumbering} t
 */
export function remaining(t) {
  if (t.next === null) return 0;
  let n = 0;
  for (const b of t.blocks) {
    if (b.end < t.next) continue;
    n += b.end - Math.max(b.start, t.next) + 1;
  }
  return n;
}

/**
 * @param {TillNumbering} t
 * @param {number} [lowWater]
 */
export function needsBlock(t, lowWater = DEFAULT_LOW_WATER) {
  return remaining(t) < lowWater;
}

/**
 * Take the next number. Returns the formatted receipt number and the new state.
 * Throws when no number is left: the till must not close an order without one.
 * @param {TillNumbering} t
 */
export function takeNumber(t) {
  if (t.next === null || remaining(t) === 0) throw new RangeError("no receipt number left; connect to the Station or the internet");
  const current = t.blocks.find((b) => t.next !== null && t.next >= b.start && t.next <= b.end);
  if (!current) throw new RangeError("no receipt number left; connect to the Station or the internet");
  const n = /** @type {number} */ (t.next);
  let next = n + 1;
  if (next > current.end) {
    const following = t.blocks.find((b) => b.start > current.end);
    next = following ? following.start : next;
  }
  const blocks = t.blocks.filter((b) => b.end >= next);
  return { receiptNo: formatReceiptNo(t.prefix, n), number: n, numbering: { ...t, blocks, next } };
}

/**
 * @param {string} prefix
 * @param {number} n
 */
export function formatReceiptNo(prefix, n) {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

/**
 * B2B invoice numbers are a separate yearly series per client, issued online only: F-2027-000123.
 * @param {number} year
 * @param {number} n
 */
export function formatInvoiceNo(year, n) {
  return `F-${year}-${String(n).padStart(6, "0")}`;
}
