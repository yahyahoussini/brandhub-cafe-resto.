// @ts-check
/**
 * The TenantStore's projections (docs/03 §6): every table that can be rebuilt from the event log. This module is
 * their only writer. It holds no rule and no money arithmetic of its own: each row comes from a kit function —
 * `applyOrderEvent`/`applyBankEvent` give the aggregate states (the store passes them in), `lineAmounts` the sales
 * lines, `expectedCash`/`cashVariance` the banks, `compareEvents`/`markKey` the mark winners, `stockLevels` the stock,
 * `buildDay` the day's numbers, `effectiveAt`/`businessDate` the business day.
 *
 * `write(event, state)` is called for each stored event in `pos` order, inside the store's transaction, both when an
 * event is appended and when `rebuild()` replays the log, so a rebuild gives the same rows. Rows that depend only on
 * events stored before them (the category in force at closing, for example) read the log up to the event's `pos`.
 *
 * Two summaries are recomputed on demand: `daily` (a row per business day, marked dirty by every event that changes
 * it, recomputed by `dailyReport`) and `stock_levels` (marked stale, recomputed by `refreshStock`); `refresh()` does
 * both, and `rebuild()` ends with it.
 *
 * Runs on a Durable Object's `ctx.storage.sql` and, in the node:test suite, on `node:sqlite` through the same
 * `exec(query, ...bindings).toArray()` surface.
 */
import { BANK_EVENT_TYPES, applyBankEvent, cashVariance, expectedCash } from "@brandhub/kit/bank";
import { compareEvents, typeInfo } from "@brandhub/kit/events";
import { settingsDefaults } from "@brandhub/kit/marks";
import { ORDER_EVENT_TYPES, applyOrderEvent, lineAmounts } from "@brandhub/kit/order";
import { abandonBlockRest, newSeries } from "@brandhub/kit/receipts";
import { buildDay, effectiveAt, normalizeThresholds } from "@brandhub/kit/reports";
import { stockLevels } from "@brandhub/kit/stock";
import { DEFAULT_TZ, businessDate, zoneOffsetMinutes, zonedToUtc } from "@brandhub/kit/timezone";

/** @typedef {import("@brandhub/kit/events").EventEnvelope} EventEnvelope */
/** @typedef {import("@brandhub/kit/order").OrderState} OrderState */
/** @typedef {import("@brandhub/kit/bank").BankState} BankState */
/** @typedef {import("@brandhub/kit/marks").Product} Product */

/**
 * An accepted event (docs/03 §4): the envelope and what the cloud adds when it receives it (docs/04 §6).
 * @typedef {EventEnvelope & { recvAt: number, relayedBy: string | null, clockSkew: 0 | 1 }} ReceivedEvent
 */

/**
 * A stored event: a received event with its position; `prevHash`/`hash` once chained.
 * @typedef {ReceivedEvent & { pos: number, prevHash?: string, hash?: string }} StoredEvent
 */

/**
 * The part of a Durable Object's `SqlStorage` used here (also served by a node:sqlite adapter in the tests).
 * @typedef {{ exec(query: string, ...bindings: any[]): { toArray(): any[] } }} Sql
 */

/** The event log. */
export const LOG_TABLES = Object.freeze(["events", "deadletter"]);

/** Projections: emptied and replayed by `rebuild()`. Every table of schema.sql is in exactly one of these three lists. */
export const PROJECTION_TABLES = Object.freeze([
  "orders",
  "payments",
  "sales_lines",
  "banks",
  "catalog_categories",
  "catalog_products",
  "catalog_availability",
  "catalog_modifier_groups",
  "catalog_recipes",
  "catalog_set_menus",
  "staff",
  "staff_pins",
  "devices",
  "zones",
  "tables",
  "table_marks",
  "settings",
  "days_closed",
  "stock_items",
  "stock_movements",
  "stock_levels",
  "machine_readings",
  "receipt_series",
  "daily",
  "customers",
  "kitchen_tickets",
  "projection_state",
]);

/** Tables outside the log (accounts, credentials, licence, messages, personal data): never touched by a rebuild. */
export const OUTSIDE_TABLES = Object.freeze([
  "owners",
  "sessions",
  "activations",
  "licence",
  "messages",
  "auth_log",
  "heartbeats",
  "device_access",
  "customers_pii",
  "staff_pii",
]);

/** Marks kept as (id, data, at, writer, event_id), one table per type. */
const PLAIN_MARKS = Object.freeze(
  /** @type {Record<string, string>} */ ({
    "catalog.category_set": "catalog_categories",
    "catalog.product_set": "catalog_products",
    "catalog.product_availability": "catalog_availability",
    "catalog.modifier_group_set": "catalog_modifier_groups",
    "catalog.recipe_set": "catalog_recipes",
    "catalog.set_menu_set": "catalog_set_menus",
    "stock.item_set": "stock_items",
    "staff.pin_set": "staff_pins",
    "zone.set": "zones",
    "table.set": "tables",
    "table.mark": "table_marks",
  }),
);

/** Settings that change how the day's numbers are computed: a new value makes every day dirty. */
const REPORT_SETTINGS = new Set(["hours.businessDayCutoff", "reports.thresholds"]);

/** "C1-000123", "TC1-000004" (training series). */
const RECEIPT_NO = /^(T?[A-Z][A-Z0-9]{0,3})-(\d{1,9})$/;

/** @param {string} type */
const isOrderType = (type) => ORDER_EVENT_TYPES.includes(type);
/** @param {string} type */
const isBankType = (type) => BANK_EVENT_TYPES.includes(type);

/**
 * The next state of a sequenced aggregate (order or bank) after an event, from the kit's reducers. Null for the other
 * kinds. Throws the kit's coded errors when the event breaks a rule.
 * @param {EventEnvelope} ev
 * @param {OrderState | BankState | null} prev
 * @returns {OrderState | BankState | null}
 */
export function reduce(ev, prev) {
  if (isOrderType(ev.type)) return applyOrderEvent(/** @type {OrderState | null} */ (prev), /** @type {any} */ (ev));
  if (isBankType(ev.type)) return applyBankEvent(/** @type {BankState | null} */ (prev), /** @type {any} */ (ev));
  return null;
}

/**
 * A stored event from its `events` row.
 * @param {Record<string, any>} row
 * @returns {StoredEvent & { prevHash: string, hash: string }}
 */
export function storedFromRow(row) {
  return {
    id: row.id,
    type: row.type,
    entity: row.entity,
    seq: row.seq ?? null,
    device: row.device,
    staff: row.staff ?? null,
    at: row.at,
    data: JSON.parse(row.data),
    v: row.v,
    pos: row.pos,
    recvAt: row.recv_at,
    relayedBy: row.relayed_by ?? null,
    clockSkew: row.clock_skew ? 1 : 0,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

/**
 * "YYYY-MM-DD" + n days, on the calendar.
 * @param {string} date
 * @param {number} n
 */
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** @param {string} date */
function isDate(date) {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  );
}

export class Projections {
  /** @type {Sql} */
  #sql;
  /** @type {Product} */
  #product;
  /** @type {{ cutoff: string, thresholds: ReturnType<typeof normalizeThresholds> } | null} */
  #settings = null;

  /**
   * @param {Sql} sql
   * @param {Product} product
   * @param {string} [tz] the client's time zone (D26)
   */
  constructor(sql, product, tz = DEFAULT_TZ) {
    this.#sql = sql;
    this.#product = product;
    this.tz = tz;
  }

  // ── SQL helpers ──────────────────────────────────────────────────────────────────────────────────────────────

  /** @param {string} q @param {...any} b @returns {Record<string, any>[]} */
  #all(q, ...b) {
    return this.#sql.exec(q, ...b).toArray();
  }

  /** @param {string} q @param {...any} b @returns {Record<string, any> | null} */
  #one(q, ...b) {
    return this.#sql.exec(q, ...b).toArray()[0] ?? null;
  }

  /** @param {string} q @param {...any} b */
  #run(q, ...b) {
    this.#sql.exec(q, ...b).toArray();
  }

  /**
   * INSERT … ON CONFLICT (key) DO UPDATE every other column. Table and column names are this module's constants.
   * @param {string} table
   * @param {string[]} key
   * @param {Record<string, unknown>} row
   */
  #upsert(table, key, row) {
    const cols = Object.keys(row);
    const rest = cols.filter((c) => !key.includes(c));
    const update = rest.length ? `DO UPDATE SET ${rest.map((c) => `${c} = excluded.${c}`).join(", ")}` : "DO NOTHING";
    this.#run(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT (${key.join(", ")}) ${update}`,
      ...cols.map((c) => row[c] ?? null),
    );
  }

  // ── Reads used by the append rules ──────────────────────────────────────────────────────────────────────────

  /** @param {string} id */
  hasEvent(id) {
    return this.#one("SELECT 1 AS x FROM events WHERE id = ?", id) !== null;
  }

  /** The last stored position and hash (GENESIS-free: pos 0 and null before the first event). */
  head() {
    const row = this.#one("SELECT pos, hash FROM events ORDER BY pos DESC LIMIT 1");
    return row
      ? { pos: /** @type {number} */ (row.pos), hash: /** @type {string} */ (row.hash) }
      : { pos: 0, hash: null };
  }

  /** @param {string} id @returns {OrderState | null} */
  order(id) {
    const row = this.#one("SELECT state FROM orders WHERE id = ?", id);
    return row ? JSON.parse(row.state) : null;
  }

  /** @param {string} id @returns {BankState | null} */
  bank(id) {
    const row = this.#one("SELECT state FROM banks WHERE id = ?", id);
    return row ? JSON.parse(row.state) : null;
  }

  /**
   * The credit notes of a ticket, any status.
   * @param {string} ticketId
   * @returns {OrderState[]}
   */
  creditNotesOf(ticketId) {
    return this.#all("SELECT state FROM orders WHERE refund_of = ?", ticketId).map((r) => JSON.parse(r.state));
  }

  /** @param {string} receiptNo @returns {string | null} the order closed under this number */
  receiptOwner(receiptNo) {
    return this.#one("SELECT id FROM orders WHERE receipt_no = ?", receiptNo)?.id ?? null;
  }

  /** @param {string} paymentId @returns {string | null} the order that holds this payment */
  paymentOrder(paymentId) {
    return this.#one("SELECT order_id FROM payments WHERE payment_id = ?", paymentId)?.order_id ?? null;
  }

  /**
   * A device of the directory (`device.set`).
   * @param {string} id
   * @returns {{ kind: string | null, prefix: string | null, at: number, writer: string, eventId: string } | null}
   */
  device(id) {
    const row = this.#one("SELECT kind, prefix, at, writer, event_id FROM devices WHERE id = ?", id);
    return row
      ? { kind: row.kind ?? null, prefix: row.prefix ?? null, at: row.at, writer: row.writer, eventId: row.event_id }
      : null;
  }

  /** @param {string} id @returns {number | null} when the device was revoked (device_access), null if it is not */
  revokedAt(id) {
    return this.#one("SELECT revoked_at FROM device_access WHERE device_id = ?", id)?.revoked_at ?? null;
  }

  /** @param {string} id a staff member (`staff.set`) */
  staffKnown(id) {
    return this.#one("SELECT 1 AS x FROM staff WHERE id = ?", id) !== null;
  }

  /** @param {string} id an owner, manager or accountant account (owners) */
  ownerKnown(id) {
    return this.#one("SELECT 1 AS x FROM owners WHERE id = ?", id) !== null;
  }

  /** The settings the store's own computations need: the business-day cut-off and the report thresholds. */
  settings() {
    if (this.#settings) return this.#settings;
    const defaults = settingsDefaults(this.#product);
    /** @param {string} path */
    const value = (path) => {
      const row = this.#one("SELECT value FROM settings WHERE path = ?", path);
      return row ? JSON.parse(row.value) : defaults[path];
    };
    const cutoff = value("hours.businessDayCutoff");
    this.#settings = {
      cutoff: typeof cutoff === "string" ? cutoff : /** @type {string} */ (defaults["hours.businessDayCutoff"]),
      thresholds: normalizeThresholds(/** @type {any} */ (value("reports.thresholds"))),
    };
    return this.#settings;
  }

  /** @param {number} at */
  dayOf(at) {
    return businessDate(at, { tz: this.tz, cutoff: this.settings().cutoff });
  }

  // ── Writes ───────────────────────────────────────────────────────────────────────────────────────────────────

  /** Empties every projection (rebuild). The log and the tables outside it are untouched. */
  clear() {
    for (const t of PROJECTION_TABLES) this.#run(`DELETE FROM ${t}`);
    this.#settings = null;
  }

  /**
   * Writes the projections of one stored event, in `pos` order.
   * @param {StoredEvent} ev
   * @param {OrderState | BankState | null} state the aggregate's state after the event (sequenced events), from `reduce`
   */
  write(ev, state) {
    /** @type {Set<string>} business days whose numbers change */
    const days = new Set();
    const kind = typeInfo(ev.type).kind;
    if (isOrderType(ev.type)) this.#writeOrder(ev, /** @type {OrderState} */ (state), days);
    else if (isBankType(ev.type)) this.#writeBank(ev, /** @type {BankState} */ (state), days);
    else if (kind === "movement") this.#writeMovement(ev, days);
    else if (kind === "mark") this.#writeMark(ev);
    for (const d of days) this.#dirty(d);
  }

  /** @param {string} date */
  #dirty(date) {
    this.#run(
      "INSERT INTO daily (business_date, dirty) VALUES (?, 1) ON CONFLICT (business_date) DO UPDATE SET dirty = 1",
      date,
    );
  }

  #stockStale() {
    this.#run(
      "INSERT INTO projection_state (name, stale) VALUES ('stock_levels', 1) ON CONFLICT (name) DO UPDATE SET stale = 1",
    );
  }

  /**
   * @param {StoredEvent} ev
   * @param {OrderState} s
   * @param {Set<string>} days
   */
  #writeOrder(ev, s, days) {
    const prev = this.#one("SELECT business_at, business_date FROM orders WHERE id = ?", s.id);
    // The business day of an order is that of its closing or voiding, else its opening (reports.js), at the server's
    // time for a clock-skewed event (effectiveAt).
    const businessAt = !prev || s.status !== "open" ? effectiveAt(ev) : /** @type {number} */ (prev.business_at);
    const day = this.dayOf(businessAt);
    if (prev && prev.business_date !== day) days.add(prev.business_date);
    days.add(day);
    this.#upsert("orders", ["id"], {
      id: s.id,
      status: s.status,
      mode: s.mode,
      table_id: s.tableId,
      zone_id: s.zoneId,
      covers: s.covers,
      owner: s.owner,
      opened_at: s.openedAt,
      closed_at: s.closedAt,
      business_at: businessAt,
      business_date: day,
      receipt_no: s.receiptNo,
      total: s.totals.totalCentimes,
      paid: s.totals.paidCentimes,
      discount: s.totals.discountCentimes,
      refund_of: s.refundOf?.orderId ?? null,
      state: JSON.stringify(s),
    });
    const d = ev.data;
    switch (ev.type) {
      case "payment.added":
      case "payment.voided": {
        const p = s.payments.find((x) => x.paymentId === d.paymentId);
        if (!p) break;
        this.#upsert("payments", ["payment_id"], {
          payment_id: p.paymentId,
          order_id: s.id,
          bank_id: p.bankId,
          tender: p.tender,
          amount: p.amountCentimes,
          voided: p.voided ? 1 : 0,
          training: s.training ? 1 : 0,
          at: p.at,
        });
        // the bank's Z lists every tender paid into it, and its expected cash moves with cash (bank.js)
        this.#bankMoney(p.bankId, days);
        if (p.tender === "credit" && typeof p.reference === "string" && p.reference.startsWith("cus_"))
          this.#customer(p.reference, ev.at);
        break;
      }
      case "order.closed":
        if (!s.training) this.#salesLines(ev, s, day, businessAt);
        this.#receiptUsed(s);
        this.#stockStale();
        break;
      case "order.customer_set":
        if (typeof d.customerId === "string" && d.customerId) this.#customer(d.customerId, ev.at);
        break;
      case "lines.sent":
        this.#kitchenSent(ev, s);
        break;
      case "lines.fired":
        this.#run(
          `UPDATE kitchen_tickets SET fired_at = ? WHERE order_id = ? AND held = 1 AND fired_at IS NULL
             AND EXISTS (SELECT 1 FROM json_each(kitchen_tickets.line_ids) AS l WHERE l.value IN (SELECT value FROM json_each(?)))`,
          ev.at,
          s.id,
          JSON.stringify(d.lineIds ?? []),
        );
        break;
      default:
        break;
    }
  }

  /**
   * One row per active line of a closed order (docs/03 §6), amounts from the kit's lineAmounts.
   * @param {StoredEvent} ev the order.closed event
   * @param {OrderState} s
   * @param {string} day
   * @param {number} businessAt
   */
  #salesLines(ev, s, day, businessAt) {
    const hour = new Date(businessAt + zoneOffsetMinutes(businessAt, this.tz) * 60_000).getUTCHours();
    /** @type {Map<string, string | null>} */
    const taxClasses = new Map();
    for (const p of lineAmounts(s)) {
      const l = p.line;
      const category = typeof l.category === "string" ? l.category : null;
      if (category !== null && !taxClasses.has(category))
        taxClasses.set(category, this.#taxClassAt(category, /** @type {number} */ (s.closedAt), ev.pos));
      this.#upsert("sales_lines", ["order_id", "line_id"], {
        order_id: s.id,
        line_id: l.lineId,
        product_id: l.productId,
        category,
        tax_class: category === null ? null : (taxClasses.get(category) ?? null),
        station: l.station,
        qty_milli: l.qtyMilli,
        net_ttc: p.netCentimes,
        vat_bp: l.vatBp,
        vat: p.vatCentimes,
        doses: l.doses,
        zone_id: s.zoneId,
        staff: s.openedBy,
        device: s.owner,
        business_date: day,
        hour,
      });
    }
  }

  /**
   * The category's taxClass in force at closing (docs/11 §6): the winning `catalog.category_set` among those written
   * at or before the closing, from the events stored before the closing (so a rebuild finds the same); if none was
   * written by then, the latest one stored before it.
   * @param {string} categoryId
   * @param {number} closedAt
   * @param {number} pos
   */
  #taxClassAt(categoryId, closedAt, pos) {
    const marks = this.#all(
      "SELECT id, at, device, data FROM events WHERE entity = ? AND type = 'catalog.category_set' AND pos < ?",
      categoryId,
      pos,
    );
    /** @param {Record<string, any>[]} list */
    const winner = (list) =>
      list.reduce(
        (w, m) => (!w || compareEvents(/** @type {any} */ (w), /** @type {any} */ (m)) < 0 ? m : w),
        /** @type {Record<string, any> | null} */ (null),
      );
    const w = winner(marks.filter((m) => m.at <= closedAt)) ?? winner(marks);
    if (!w) return null;
    const taxClass = JSON.parse(w.data).taxClass;
    return taxClass === "drink" || taxClass === "food" ? taxClass : null;
  }

  /** @param {OrderState} s */
  #receiptUsed(s) {
    const m = s.receiptNo === null ? null : RECEIPT_NO.exec(s.receiptNo);
    if (!m) return;
    const [prefix, n] = [m[1], Number(m[2])];
    const row = this.#one("SELECT last_used FROM receipt_series WHERE prefix = ?", prefix);
    if (row) {
      if (n > row.last_used) this.#run("UPDATE receipt_series SET last_used = ? WHERE prefix = ?", n, prefix);
      return;
    }
    this.#run(
      "INSERT INTO receipt_series (prefix, device_id, last_end, last_used, ledger) VALUES (?, ?, 0, ?, ?)",
      prefix,
      s.owner,
      n,
      JSON.stringify(newSeries(prefix)),
    );
  }

  /**
   * Kitchen and bar tickets of a `lines.sent`: one per station of the sent lines (lines without a station have none).
   * @param {StoredEvent} ev
   * @param {OrderState} s
   */
  #kitchenSent(ev, s) {
    /** @type {Map<string, string[]>} */
    const byStation = new Map();
    for (const id of /** @type {string[]} */ (ev.data.lineIds ?? [])) {
      const station = s.lines.find((l) => l.lineId === id)?.station;
      if (typeof station !== "string" || !station) continue;
      byStation.set(station, [...(byStation.get(station) ?? []), id]);
    }
    for (const [station, ids] of byStation) {
      this.#run(
        `INSERT INTO kitchen_tickets (order_id, sent_event_id, station, line_ids, held, sent_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (order_id, sent_event_id, station) DO UPDATE SET line_ids = excluded.line_ids, held = excluded.held, sent_at = excluded.sent_at`,
        s.id,
        ev.id,
        station,
        JSON.stringify(ids),
        ev.data.hold === true ? 1 : 0,
        ev.at,
      );
    }
  }

  /** @param {string} id @param {number} at */
  #customer(id, at) {
    this.#run(
      "INSERT INTO customers (id, last_at) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET last_at = MAX(last_at, excluded.last_at)",
      id,
      at,
    );
  }

  /**
   * @param {StoredEvent} ev
   * @param {BankState} b
   * @param {Set<string>} days
   */
  #writeBank(ev, b, days) {
    const prev = this.#one("SELECT business_at FROM banks WHERE id = ?", b.id);
    // A bank's business day is that of its opening (reports.js).
    const businessAt = prev ? /** @type {number} */ (prev.business_at) : effectiveAt(ev);
    this.#upsert("banks", ["id"], {
      id: b.id,
      kind: b.kind,
      holder: b.holder,
      owner: b.owner,
      status: b.status,
      opened_at: b.openedAt,
      closed_at: b.closedAt,
      business_at: businessAt,
      business_date: this.dayOf(businessAt),
      expected: b.floatCentimes,
      counted: b.countedCentimes,
      variance: null,
      state: JSON.stringify(b),
    });
    this.#bankMoney(b.id, days);
  }

  /**
   * Expected cash and variance of a bank (bank.js), from its cash payments (non-TEST orders, not voided) and its cash
   * `kredi.repaid`.
   * @param {string} bankId
   * @param {Set<string>} days
   */
  #bankMoney(bankId, days) {
    const row = this.#one("SELECT state, business_date FROM banks WHERE id = ?", bankId);
    if (!row) return;
    /** @type {BankState} */
    const bank = JSON.parse(row.state);
    const cash = this.#all(
      `SELECT amount FROM payments WHERE bank_id = ? AND tender = 'cash' AND voided = 0 AND training = 0
       UNION ALL
       SELECT json_extract(data, '$.amountCentimes') AS amount FROM events
         WHERE type = 'kredi.repaid' AND json_extract(data, '$.tender') = 'cash' AND json_extract(data, '$.bankId') = ?`,
      bankId,
      bankId,
    ).map((r) => /** @type {number} */ (r.amount));
    this.#run(
      "UPDATE banks SET expected = ?, variance = ? WHERE id = ?",
      expectedCash(bank, cash),
      cashVariance(bank, cash),
      bankId,
    );
    days.add(row.business_date);
  }

  /**
   * @param {StoredEvent} ev
   * @param {Set<string>} days
   */
  #writeMovement(ev, days) {
    const d = ev.data;
    switch (ev.type) {
      case "machine.reading":
      case "machine.off_till": {
        const businessAt = effectiveAt(ev);
        const day = ev.type === "machine.reading" ? /** @type {string} */ (d.businessDate) : this.dayOf(businessAt);
        this.#upsert("machine_readings", ["event_id"], {
          event_id: ev.id,
          machine_id: ev.entity,
          type: ev.type,
          kind: ev.type === "machine.reading" ? d.kind : null,
          reading: ev.type === "machine.reading" ? d.reading : null,
          doses: ev.type === "machine.off_till" ? d.doses : null,
          business_at: businessAt,
          business_date: day,
          at: ev.at,
          writer: ev.device,
        });
        days.add(day);
        break;
      }
      case "stock.counted":
      case "stock.received":
      case "stock.wasted":
      case "stock.adjusted":
        this.#upsert("stock_movements", ["event_id"], {
          event_id: ev.id,
          item_id: ev.entity,
          type: ev.type,
          qty_milli: d.qtyMilli,
          at: ev.at,
          writer: ev.device,
          data: JSON.stringify(d),
        });
        this.#stockStale();
        break;
      case "kredi.repaid":
        this.#customer(ev.entity, ev.at);
        if (d.tender === "cash" && typeof d.bankId === "string") this.#bankMoney(d.bankId, days);
        break;
      case "receipts.block_reserved": {
        const row = this.#one("SELECT ledger, last_used FROM receipt_series WHERE prefix = ?", d.prefix);
        /** @type {import("@brandhub/kit/receipts").SeriesLedger} */
        const ledger = row ? JSON.parse(row.ledger) : newSeries(d.prefix);
        if (!ledger.blocks.some((b) => b.blockId === ev.entity)) {
          ledger.blocks.push({ blockId: ev.entity, start: d.start, end: d.end, abandonedFrom: null });
          ledger.lastEnd = Math.max(ledger.lastEnd, d.end);
        }
        this.#upsert("receipt_series", ["prefix"], {
          prefix: d.prefix,
          device_id: d.deviceId,
          last_end: ledger.lastEnd,
          last_used: row?.last_used ?? 0,
          ledger: JSON.stringify(ledger),
        });
        break;
      }
      case "receipts.block_abandoned": {
        const row = this.#one(
          `SELECT prefix, ledger FROM receipt_series
             WHERE EXISTS (SELECT 1 FROM json_each(receipt_series.ledger, '$.blocks') AS b WHERE json_extract(b.value, '$.blockId') = ?)`,
          ev.entity,
        );
        if (!row) break;
        const ledger = abandonBlockRest(JSON.parse(row.ledger), ev.entity, d.from - 1);
        this.#run("UPDATE receipt_series SET ledger = ? WHERE prefix = ?", JSON.stringify(ledger), row.prefix);
        break;
      }
      default:
        // staff.clock (prompt 34), invoice.issued (prompt 46), z.closed (the record is the event itself, docs/10 §2)
        break;
    }
  }

  /**
   * Whether `ev` beats the winner stored in a mark row (marks.js: last writer by at, device, id).
   * @param {Record<string, any> | null} row with at, writer, event_id
   * @param {EventEnvelope} ev
   */
  #wins(row, ev) {
    return !row || compareEvents({ at: row.at, device: row.writer, id: row.event_id }, ev) < 0;
  }

  /** @param {StoredEvent} ev */
  #writeMark(ev) {
    const d = ev.data;
    const win = { at: ev.at, writer: ev.device, event_id: ev.id };
    const plain = PLAIN_MARKS[ev.type];
    if (plain) {
      if (this.#wins(this.#one(`SELECT at, writer, event_id FROM ${plain} WHERE id = ?`, ev.entity), ev)) {
        this.#upsert(plain, ["id"], { id: ev.entity, data: JSON.stringify(d), ...win });
      }
      if (ev.type === "catalog.product_set" || ev.type === "catalog.recipe_set" || ev.type === "stock.item_set")
        this.#stockStale();
      return;
    }
    switch (ev.type) {
      case "staff.set":
        if (this.#wins(this.#one("SELECT at, writer, event_id FROM staff WHERE id = ?", ev.entity), ev)) {
          this.#upsert("staff", ["id"], {
            id: ev.entity,
            role: d.role,
            active: d.active === false ? 0 : 1,
            data: JSON.stringify(d),
            ...win,
          });
        }
        break;
      case "device.set":
        if (this.#wins(this.#one("SELECT at, writer, event_id FROM devices WHERE id = ?", ev.entity), ev)) {
          this.#upsert("devices", ["id"], {
            id: ev.entity,
            kind: typeof d.kind === "string" ? d.kind : null,
            prefix: typeof d.prefix === "string" ? d.prefix : null,
            data: JSON.stringify(d),
            ...win,
          });
        }
        break;
      case "settings.set":
        if (this.#wins(this.#one("SELECT at, writer, event_id FROM settings WHERE path = ?", d.path), ev)) {
          this.#upsert("settings", ["path"], { path: d.path, value: JSON.stringify(d.value), ...win });
          this.#settings = null;
          if (REPORT_SETTINGS.has(d.path)) this.#run("UPDATE daily SET dirty = 1");
        }
        break;
      case "day.closed":
        if (
          this.#wins(
            this.#one("SELECT at, writer, event_id FROM days_closed WHERE business_date = ?", d.businessDate),
            ev,
          )
        ) {
          this.#upsert("days_closed", ["business_date"], { business_date: d.businessDate, staff: ev.staff, ...win });
        }
        break;
      case "kitchen.status": {
        const row = this.#one(
          "SELECT status_at AS at, status_writer AS writer, status_event_id AS event_id FROM kitchen_tickets WHERE order_id = ? AND sent_event_id = ? AND station = ?",
          ev.entity,
          d.sentEventId,
          d.station,
        );
        if (row && row.event_id !== null && !this.#wins(row, ev)) break;
        this.#run(
          `INSERT INTO kitchen_tickets (order_id, sent_event_id, station, status, status_at, status_writer, status_event_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (order_id, sent_event_id, station) DO UPDATE SET status = excluded.status, status_at = excluded.status_at,
               status_writer = excluded.status_writer, status_event_id = excluded.status_event_id`,
          ev.entity,
          d.sentEventId,
          d.station,
          d.status,
          ev.at,
          ev.device,
          ev.id,
        );
        break;
      }
      case "deadletter.resolved":
        // The dead letter itself is outside the log; its resolution is a mark (docs/04 §5).
        this.#run(
          "UPDATE deadletter SET resolved_at = ?, resolved_by = ? WHERE id = ? AND (resolved_at IS NULL OR resolved_at <= ?)",
          ev.at,
          ev.staff,
          ev.entity,
          ev.at,
        );
        break;
      default:
        break;
    }
  }

  // ── Summaries recomputed on demand ───────────────────────────────────────────────────────────────────────────

  /**
   * The day's numbers (docs/10 §1): the kit's buildDay over the events of every order and bank that touches the day.
   * Served from the `daily` row while it is clean; recomputed (and stored) when an event made it dirty.
   * @param {string} date business day "YYYY-MM-DD"
   */
  dailyReport(date) {
    if (!isDate(date)) throw new RangeError("businessDate must be a real YYYY-MM-DD date");
    const row = this.#one("SELECT report, dirty FROM daily WHERE business_date = ?", date);
    if (row && row.dirty === 0 && typeof row.report === "string") return JSON.parse(row.report);
    return this.#computeDaily(date);
  }

  /** @param {string} date */
  #computeDaily(date) {
    const { cutoff, thresholds } = this.settings();
    // Any cut-off puts business day D inside [D 00:00, D+2 00:00) local; buildDay keeps exactly the day.
    const [y, m, dd] = date.split("-").map(Number);
    const after = addDays(date, 2).split("-").map(Number);
    const from = zonedToUtc(y, m, dd, 0, 0, this.tz);
    const to = zonedToUtc(after[0], after[1], after[2], 0, 0, this.tz);
    const bankIds = this.#all("SELECT id FROM banks WHERE business_at >= ? AND business_at < ?", from, to).map(
      (r) => r.id,
    );
    const entities = new Set([
      ...this.#all("SELECT id FROM orders WHERE business_at >= ? AND business_at < ?", from, to).map((r) => r.id),
      ...bankIds,
      // orders of other days paid into the day's banks count in those banks' cash (bank.js expectedCash)
      ...this.#all(
        "SELECT DISTINCT order_id FROM payments WHERE bank_id IN (SELECT value FROM json_each(?))",
        JSON.stringify(bankIds),
      ).map((r) => r.order_id),
    ]);
    const rows = this.#all(
      `SELECT * FROM events WHERE entity IN (SELECT value FROM json_each(?1))
       UNION
       SELECT e.* FROM events e JOIN machine_readings r ON r.event_id = e.id
         WHERE (r.type = 'machine.reading' AND r.business_date = ?2) OR (r.type = 'machine.off_till' AND r.business_at >= ?3 AND r.business_at < ?4)
       UNION
       SELECT * FROM events WHERE type = 'kredi.repaid' AND json_extract(data, '$.tender') = 'cash'
         AND json_extract(data, '$.bankId') IN (SELECT value FROM json_each(?5))
       ORDER BY pos`,
      JSON.stringify([...entities]),
      date,
      from,
      to,
      JSON.stringify(bankIds),
    );
    const report = buildDay(rows.map(storedFromRow), { tz: this.tz, cutoff, businessDate: date, thresholds });
    this.#upsert("daily", ["business_date"], {
      business_date: date,
      revenue: report.revenueCentimes,
      tickets: report.tickets.count,
      covers: report.covers,
      vat: JSON.stringify(report.vat),
      tenders: JSON.stringify({ amounts: report.tenders, counts: report.tenderCounts }),
      voids: JSON.stringify(report.voids),
      no_sales: report.noSales,
      reprints: report.reprints,
      cash_gaps: JSON.stringify(
        report.banks.map((b) => ({ bankId: b.id, gapCentimes: b.gapCentimes, gapState: b.gapState })),
      ),
      dose_gaps: JSON.stringify(report.doses),
      report: JSON.stringify(report),
      dirty: 0,
    });
    return report;
  }

  /** Stock levels (stock.js stockLevels) from the movements, the closed orders and the catalog's deduction lists. */
  refreshStock() {
    const movements = this.#all("SELECT event_id, item_id, type, qty_milli, at, writer, data FROM stock_movements").map(
      (r) =>
        /** @type {EventEnvelope} */ ({
          id: r.event_id,
          type: r.type,
          entity: r.item_id,
          seq: null,
          device: r.writer,
          staff: null,
          at: r.at,
          data: JSON.parse(r.data),
          v: 1,
        }),
    );
    const orders = this.#all("SELECT state FROM orders WHERE status = 'closed'").map(
      (r) => /** @type {OrderState} */ (JSON.parse(r.state)),
    );
    const catalogEvents = this.#all(
      "SELECT * FROM events WHERE type IN ('catalog.product_set', 'catalog.recipe_set')",
    ).map(storedFromRow);
    const levels = stockLevels({ movements, orders, catalogEvents });
    this.#run("DELETE FROM stock_levels");
    for (const s of Object.values(levels)) {
      this.#upsert("stock_levels", ["item_id"], {
        item_id: s.itemId,
        level_milli: s.levelMilli,
        last_count_at: s.lastCountAt,
        last_count_milli: s.lastCountMilli,
        received_milli: s.receivedMilli,
        wasted_milli: s.wastedMilli,
        adjusted_milli: s.adjustedMilli,
        sold_milli: s.soldMilli,
        refund_waste_milli: s.refundWasteMilli,
        gap_milli: s.gapMilli,
      });
    }
    this.#run(
      "INSERT INTO projection_state (name, stale) VALUES ('stock_levels', 0) ON CONFLICT (name) DO UPDATE SET stale = 0",
    );
    return levels;
  }

  /** Recomputes every dirty day and stale stock levels. Returns the days recomputed. */
  refresh() {
    const days = this.#all("SELECT business_date FROM daily WHERE dirty = 1 ORDER BY business_date").map(
      (r) => /** @type {string} */ (r.business_date),
    );
    for (const d of days) this.#computeDaily(d);
    if (this.#one("SELECT stale FROM projection_state WHERE name = 'stock_levels'")?.stale === 1) this.refreshStock();
    return days;
  }
}
