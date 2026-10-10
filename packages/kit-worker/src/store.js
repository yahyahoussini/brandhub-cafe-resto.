// @ts-check
/**
 * The TenantStore's logic on its SQLite database, apart from the Durable Object (`./tenant-store.js` wraps it), so the
 * node:test suite runs the very same code on `node:sqlite`. It needs only `storage.sql.exec(...).toArray()` and
 * `storage.transactionSync(fn)`.
 *
 * - `append(events, caller)`: a pushed batch (docs/04 §2), decided by `./sync-rules.js`; under the append lock the
 *   accepted events are hashed in order (`chainHash` is async), then ONE `transactionSync` assigns `pos` and writes the
 *   rows, the hashes, the projections and the dead letters;
 * - `pull(after, kind, limit)`: the events after a position that a device kind receives (docs/04 §3);
 * - `verify(from, to)`: recomputes the chain (journal.js) and names the first broken position;
 * - `rebuild()`: empties the projections and replays the log in `pos` order (the log itself is never touched);
 * - `dailyReport(businessDate)`: the kit's buildDay for that day (docs/10 §1), kept in the `daily` projection;
 * - `refresh()`: recomputes the summaries marked dirty (days, stock levels).
 *
 * The constructor brings the database to the newest schema synchronously (`./migrate.js`).
 */
import { isSequenced } from "@brandhub/kit/events";
import { GENESIS, chainHash, verifyChain } from "@brandhub/kit/journal";
import { migrate } from "./migrate.js";
import { Projections, reduce, storedFromRow } from "./projections.js";
import { MAX_PULL, SCREEN_RECENT_MS, checkBatch, checkCaller, decideBatch, pullScope } from "./sync-rules.js";

/** @typedef {import("./projections.js").StoredEvent} StoredEvent */
/** @typedef {import("./sync-rules.js").Caller} Caller */
/** @typedef {import("@brandhub/kit/events").DeviceKind} DeviceKind */

/**
 * docs/04 §2 push response.
 * @typedef {{ accepted: string[], duplicates: string[], rejected: { id: string | null, code: string, message: string }[],
 *   last: number, serverTime: number }} AppendResult
 */

/** Rows read at a time when the whole log is walked (verify, rebuild). */
const CHUNK = 500;

/** @param {unknown} n @param {string} what @param {number} min */
function wholeNumber(n, what, min) {
  if (!Number.isSafeInteger(n) || /** @type {number} */ (n) < min)
    throw new TypeError(`${what} must be an integer ≥ ${min}`);
  return /** @type {number} */ (n);
}

/**
 * An event as pull sends it (docs/04 §3): the stored event without the chain's hashes. A flat type, so the RPC stub's
 * types stay shallow.
 * @typedef {{ id: string, type: string, entity: string, seq: number | null, device: string, staff: string | null,
 *   at: number, data: Record<string, any>, v: number, pos: number, recvAt: number, relayedBy: string | null,
 *   clockSkew: 0 | 1 }} PulledEvent
 */

/**
 * docs/04 §3 pull response.
 * @typedef {{ events: PulledEvent[], last: number, more: boolean, serverTime: number }} PullResult
 */

/**
 * @param {Record<string, any>} row
 * @returns {PulledEvent}
 */
function pulled(row) {
  const { prevHash, hash, ...ev } = storedFromRow(row);
  return ev;
}

/**
 * The part of `DurableObjectStorage` the store uses (node:sqlite serves the same surface in the tests).
 * @typedef {object} StoreStorage
 * @property {{ exec(query: string, ...bindings: any[]): { toArray(): any[] } }} sql
 * @property {<T>(closure: () => T) => T} transactionSync
 */

export class Store {
  /** @type {StoreStorage} */
  #storage;
  /** @type {Projections} */
  #projections;
  /** @type {() => string | null} */
  #tenantId;
  /** Serialises append and rebuild: crypto awaits do not hold the Durable Object's input gate (docs/04 §2). */
  #lock = Promise.resolve();

  /**
   * @param {StoreStorage} storage
   * @param {import("./env.js").Product} product
   * @param {{ tenantId?: () => string | null }} [o] the client's id when known (an event naming another tnt_ is refused)
   */
  constructor(storage, product, o = {}) {
    migrate(storage);
    this.#storage = storage;
    this.#projections = new Projections(storage.sql, product);
    this.#tenantId = o.tenantId ?? (() => null);
  }

  /** The projections (read access for the store's other APIs and the tests). */
  get projections() {
    return this.#projections;
  }

  /**
   * Runs `fn` after every append or rebuild started before it.
   * @template T
   * @param {() => T | Promise<T>} fn
   * @returns {Promise<T>}
   */
  #exclusive(fn) {
    const run = this.#lock.then(fn);
    this.#lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * docs/04 §2: stores a pushed batch. Throws a BatchError E_TOO_LARGE (nothing stored) when the batch is over 200
   * events or 512 KB, and a TypeError for a malformed caller.
   * @param {unknown[]} events
   * @param {Caller} caller
   * @returns {Promise<AppendResult>}
   */
  async append(events, caller) {
    const who = checkCaller(caller);
    const batch = checkBatch(events);
    return this.#exclusive(() => this.#append(batch, who));
  }

  /**
   * @param {unknown[]} batch
   * @param {Caller} caller
   * @returns {Promise<AppendResult>}
   */
  async #append(batch, caller) {
    const recvAt = Date.now();
    const p = this.#projections;
    const decision = decideBatch(batch, caller, { reader: p, recvAt, tenantId: this.#tenantId() });

    // The chain, in order, before the transaction (chainHash is async; the transaction's callback must not be).
    const head = p.head();
    let prev = head.hash ?? GENESIS;
    let pos = head.pos;
    /** @type {{ event: StoredEvent & { prevHash: string, hash: string }, state: any }[]} */
    const rows = [];
    for (const { event, state } of decision.accepted) {
      pos += 1;
      const stored = { ...event, pos, prevHash: prev, hash: "" };
      stored.hash = await chainHash(prev, stored);
      prev = stored.hash;
      rows.push({ event: stored, state });
    }

    const sql = this.#storage.sql;
    this.#storage.transactionSync(() => {
      for (const { event: e, state } of rows) {
        sql
          .exec(
            `INSERT INTO events (pos, id, type, entity, seq, device, staff, at, recv_at, relayed_by, data, v, prev_hash, hash, clock_skew)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            e.pos,
            e.id,
            e.type,
            e.entity,
            e.seq,
            e.device,
            e.staff,
            e.at,
            e.recvAt,
            e.relayedBy,
            JSON.stringify(e.data),
            e.v,
            e.prevHash,
            e.hash,
            e.clockSkew,
          )
          .toArray();
        p.write(e, state);
      }
      for (const r of decision.rejected) {
        // A dead letter needs the event's id (docs/04 §5); an event without a usable one is only answered.
        if (r.id === null || r.id.length === 0 || r.id.length > 64) continue;
        sql
          .exec(
            `INSERT INTO deadletter (id, device, received_at, code, message, event) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET device = excluded.device, received_at = excluded.received_at, code = excluded.code,
               message = excluded.message, event = excluded.event
             WHERE deadletter.resolved_at IS NULL`,
            r.id,
            r.device,
            recvAt,
            r.code,
            r.message,
            r.event === null ? null : JSON.stringify(r.event),
          )
          .toArray();
      }
    });

    return {
      accepted: rows.map((r) => r.event.id),
      duplicates: decision.duplicates,
      rejected: decision.rejected.map(({ id, code, message }) => ({ id, code, message })),
      last: pos,
      serverTime: recvAt,
    };
  }

  /**
   * docs/04 §3: the events after `after` that a device kind receives, at most `limit`. `last` is the position to ask
   * after next time: the last event sent when there are more, else the end of the log (filtered events included).
   * @param {number} [after]
   * @param {DeviceKind} [kind]
   * @param {number} [limit]
   * @returns {PullResult}
   */
  pull(after = 0, kind = "office", limit = MAX_PULL) {
    wholeNumber(after, "after", 0);
    const max = Math.min(wholeNumber(limit, "limit", 1), MAX_PULL);
    const scope = pullScope(kind);
    const serverTime = Date.now();
    const sql = this.#storage.sql;
    const rows = scope.everything
      ? sql.exec("SELECT * FROM events WHERE pos > ? ORDER BY pos LIMIT ?", after, max + 1).toArray()
      : sql
          .exec(
            `SELECT e.* FROM events e WHERE e.pos > ? AND (
               e.type IN (SELECT value FROM json_each(?))
               OR (e.type IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM orders o WHERE o.id = e.entity AND o.status = 'open'))
               OR (e.type IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM banks b WHERE b.id = e.entity AND b.status <> 'closed'))
               OR (e.type IN (SELECT value FROM json_each(?))
                   AND EXISTS (SELECT 1 FROM orders o WHERE o.id = e.entity AND (o.status = 'open' OR o.business_at >= ?)))
             ) ORDER BY e.pos LIMIT ?`,
            after,
            JSON.stringify(scope.types),
            JSON.stringify(scope.openOrderTypes),
            JSON.stringify(scope.openBankTypes),
            JSON.stringify(scope.recentOrderTypes),
            serverTime - SCREEN_RECENT_MS,
            max + 1,
          )
          .toArray();
    const more = rows.length > max;
    const page = rows.slice(0, max);
    const last = more ? /** @type {number} */ (page[page.length - 1].pos) : this.#projections.head().pos;
    return { events: page.map(pulled), last, more, serverTime };
  }

  /**
   * Recomputes the chain from `from` to `to` (journal.js). The hash stored before `from` is the starting point.
   * @param {number} [from]
   * @param {number} [to] default: the last position
   * @returns {Promise<{ ok: true } | { ok: false, pos: number, reason: string }>}
   */
  async verify(from = 1, to = undefined) {
    wholeNumber(from, "from", 1);
    const end = Math.min(to === undefined ? Infinity : wholeNumber(to, "to", 1), this.#projections.head().pos);
    if (from > end) return { ok: true };
    const sql = this.#storage.sql;
    let prev = GENESIS;
    if (from > 1) {
      const before = sql.exec("SELECT hash FROM events WHERE pos = ?", from - 1).toArray()[0];
      if (!before) return { ok: false, pos: from - 1, reason: "gap_in_positions" };
      prev = /** @type {string} */ (before.hash);
    }
    for (let start = from; start <= end; start += CHUNK) {
      const stop = Math.min(end, start + CHUNK - 1);
      const rows = sql.exec("SELECT * FROM events WHERE pos BETWEEN ? AND ? ORDER BY pos", start, stop).toArray();
      if (rows.length === 0 || rows[0].pos !== start) return { ok: false, pos: start, reason: "gap_in_positions" };
      const checked = await verifyChain(rows.map(storedFromRow), prev);
      if (!checked.ok) {
        // A removed row: name the first missing position, not the row after the hole.
        const i = rows.findIndex((r) => r.pos === checked.brokenAtPos);
        const pos =
          checked.reason === "gap_in_positions" && i > 0
            ? /** @type {number} */ (rows[i - 1].pos) + 1
            : checked.brokenAtPos;
        return { ok: false, pos, reason: checked.reason };
      }
      const lastPos = /** @type {number} */ (rows[rows.length - 1].pos);
      if (lastPos !== stop) return { ok: false, pos: lastPos + 1, reason: "gap_in_positions" };
      prev = checked.lastHash;
    }
    return { ok: true };
  }

  /**
   * Empties every projection and replays the whole log in `pos` order through the same writer as `append`, then
   * recomputes the summaries. One transaction: a failure leaves the projections as they were.
   * @returns {Promise<{ events: number, days: number }>}
   */
  rebuild() {
    return this.#exclusive(() => {
      const p = this.#projections;
      const sql = this.#storage.sql;
      return this.#storage.transactionSync(() => {
        p.clear();
        /** @type {Map<string, any>} */
        const states = new Map();
        let after = 0;
        let events = 0;
        for (;;) {
          const rows = sql.exec("SELECT * FROM events WHERE pos > ? ORDER BY pos LIMIT ?", after, CHUNK).toArray();
          if (rows.length === 0) break;
          for (const row of rows) {
            const ev = storedFromRow(row);
            const state = isSequenced(ev.type) ? reduce(ev, states.get(ev.entity) ?? null) : null;
            if (state) states.set(ev.entity, state);
            p.write(ev, state);
            events += 1;
          }
          after = /** @type {number} */ (rows[rows.length - 1].pos);
        }
        const days = p.refresh();
        return { events, days: days.length };
      });
    });
  }

  /**
   * The day's numbers (docs/10 §1): the kit's buildDay over the day's events, as kept in the `daily` projection.
   * @param {string} businessDate "YYYY-MM-DD"
   */
  dailyReport(businessDate) {
    return this.#storage.transactionSync(() => this.#projections.dailyReport(businessDate));
  }

  /** Recomputes the days and the stock levels that events made dirty. */
  refresh() {
    return this.#storage.transactionSync(() => ({ days: this.#projections.refresh() }));
  }
}
