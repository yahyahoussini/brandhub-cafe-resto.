// @ts-check
/**
 * Cash banks: the till drawer (cashier) or a waiter's own cash ("le serveur rend la caisse").
 * A bank is an aggregate with one writer, like an order (docs/03-domain-model.md §5).
 *
 * Expected cash = float + cash taken into the bank from other aggregates + cash in − cash out.
 * That outside cash is the cash payments of orders and the cash Kredi repayments and deposits (`kredi.repaid`)
 * recorded with this bankId; the caller passes them in (see expectedCash). Before accepting such an event, the
 * device, the Station and the cloud call assertBankAccepts: only the device that holds an open bank puts money in it.
 */

import { assertCentimes } from "./money.js";

export class BankRuleError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "BankRuleError";
    this.code = code;
  }
}

export const BANK_KINDS = Object.freeze(["till", "waiter"]);
export const BANK_EVENT_TYPES = Object.freeze([
  "bank.opened",
  "bank.cash_in",
  "bank.cash_out",
  "bank.no_sale",
  "bank.reprint",
  "bank.counted",
  "bank.closed",
  "bank.taken_over",
]);

/**
 * @typedef {object} BankState
 * @property {string} id
 * @property {"till" | "waiter"} kind
 * @property {string} holder stf_… responsible for the cash
 * @property {string} owner device that writes the bank's events
 * @property {"open" | "counted" | "closed"} status
 * @property {number} floatCentimes
 * @property {number} cashInCentimes
 * @property {number} cashOutCentimes
 * @property {number} noSaleCount
 * @property {number} reprintCount
 * @property {number | null} countedCentimes
 * @property {Record<string, number> | null} breakdown
 * @property {number} openedAt
 * @property {number | null} closedAt
 * @property {number} seq
 * @property {string[]} eventIds
 * @property {{ at: number, kind: "in" | "out", amountCentimes: number, reason: string, staff: string | null, approvedBy: string | null }[]} movements
 */

/**
 * @param {string} code
 * @param {string} message
 */
function fail(code, message) {
  return new BankRuleError(code, message);
}

/**
 * Apply one event to a bank. Every refusal is a BankRuleError with a code (docs/03 §9): a malformed amount caught by
 * money.js becomes E_BAD_DATA.
 * @param {BankState | null} state
 * @param {import("./order.js").OrderEvent} ev
 * @returns {BankState}
 */
export function applyBankEvent(state, ev) {
  try {
    return applyBankEventUnchecked(state, ev);
  } catch (e) {
    if (e instanceof TypeError || e instanceof RangeError) throw fail("E_BAD_DATA", e.message);
    throw e;
  }
}

/**
 * @param {BankState | null} state
 * @param {import("./order.js").OrderEvent} ev
 * @returns {BankState}
 */
function applyBankEventUnchecked(state, ev) {
  if (!ev || !BANK_EVENT_TYPES.includes(ev.type)) throw fail("E_BAD_EVENT", `unknown bank event ${ev && ev.type}`);
  if (!Number.isInteger(ev.seq) || ev.seq < 1) throw fail("E_BAD_EVENT", "seq must be a positive integer");
  const d = ev.data ?? {};
  if (state === null) {
    if (ev.type !== "bank.opened" || ev.seq !== 1) throw fail("E_NOT_OPENED", "a bank starts with bank.opened, seq 1");
    if (!BANK_KINDS.includes(d.kind)) throw fail("E_BAD_DATA", "kind must be till or waiter");
    if (typeof d.holder !== "string" || !d.holder) throw fail("E_BAD_DATA", "holder is required");
    assertCentimes(d.floatCentimes, "floatCentimes");
    if (d.floatCentimes < 0) throw fail("E_BAD_DATA", "float cannot be negative");
    return {
      id: ev.entity,
      kind: d.kind,
      holder: d.holder,
      owner: ev.device,
      status: "open",
      floatCentimes: d.floatCentimes,
      cashInCentimes: 0,
      cashOutCentimes: 0,
      noSaleCount: 0,
      reprintCount: 0,
      countedCentimes: null,
      breakdown: null,
      openedAt: ev.at,
      closedAt: null,
      seq: 1,
      eventIds: [ev.id],
      movements: [],
    };
  }
  if (ev.entity !== state.id) throw fail("E_ENTITY", "event for another bank");
  if (state.eventIds.includes(ev.id)) return state;
  if (ev.seq !== state.seq + 1) throw fail("E_SEQ", `expected seq ${state.seq + 1}, got ${ev.seq}`);
  if (ev.type !== "bank.taken_over" && ev.device !== state.owner) throw fail("E_NOT_OWNER", "only the owner device writes this bank");
  if (state.status === "closed") throw fail("E_STATUS", "bank is closed");

  /** @type {BankState} */
  const s = structuredClone(state);
  switch (ev.type) {
    case "bank.cash_in":
    case "bank.cash_out": {
      if (s.status !== "open") throw fail("E_STATUS", "bank already counted");
      assertCentimes(d.amountCentimes, "amountCentimes");
      if (d.amountCentimes <= 0) throw fail("E_BAD_DATA", "amount must be positive");
      if (typeof d.reason !== "string" || !d.reason.trim()) throw fail("E_BAD_DATA", "a reason is required");
      if (ev.type === "bank.cash_out" && !d.approvedBy) throw fail("E_APPROVAL_REQUIRED", "cash out needs a manager's approval");
      const kind = ev.type === "bank.cash_in" ? "in" : "out";
      if (kind === "in") s.cashInCentimes += d.amountCentimes;
      else s.cashOutCentimes += d.amountCentimes;
      s.movements.push({ at: ev.at, kind, amountCentimes: d.amountCentimes, reason: d.reason.slice(0, 200), staff: ev.staff ?? null, approvedBy: d.approvedBy ?? null });
      break;
    }
    case "bank.no_sale": {
      if (s.status !== "open") throw fail("E_STATUS", "bank already counted");
      if (!d.approvedBy) throw fail("E_APPROVAL_REQUIRED", "opening the drawer without a sale needs a manager's approval");
      s.noSaleCount += 1;
      break;
    }
    case "bank.reprint": {
      s.reprintCount += 1;
      break;
    }
    case "bank.counted": {
      if (s.status !== "open") throw fail("E_STATUS", "bank already counted");
      assertCentimes(d.countedCentimes, "countedCentimes");
      if (d.countedCentimes < 0) throw fail("E_BAD_DATA", "counted cash cannot be negative");
      s.countedCentimes = d.countedCentimes;
      s.breakdown = d.breakdown && typeof d.breakdown === "object" ? { ...d.breakdown } : null;
      s.status = "counted";
      break;
    }
    case "bank.closed": {
      if (s.status !== "counted") throw fail("E_STATUS", "count the cash before closing (blind count)");
      s.status = "closed";
      s.closedAt = ev.at;
      break;
    }
    case "bank.taken_over": {
      if (ev.device === s.owner) throw fail("E_BAD_DATA", "the owner does not need to take over");
      if (!d.approvedBy) throw fail("E_APPROVAL_REQUIRED", "settling another device's bank needs a manager's approval");
      s.owner = ev.device;
      break;
    }
    default:
      throw fail("E_BAD_EVENT", `unhandled ${ev.type}`);
  }
  s.seq = ev.seq;
  s.eventIds.push(ev.id);
  return s;
}

/**
 * Guard for money that lands in a bank from another aggregate: an order's `payment.added` or `payment.voided`, a
 * `kredi.repaid` in cash. The bank must exist, be held by the writing device and still be open (not counted).
 * A waiter's phone that handed over its bank, or a device writing into someone else's drawer, is refused, so a late
 * payment becomes a dead letter the manager sees ("encaissement après reprise", docs/04 §9) instead of a false gap.
 * @param {BankState | null | undefined} bank the bank named by the event's bankId, folded from its events
 * @param {string} device the device that wrote the event
 */
export function assertBankAccepts(bank, device) {
  if (!bank) throw fail("E_BANK_UNKNOWN", "no bank with this id");
  if (bank.owner !== device) throw fail("E_NOT_OWNER", "this bank is held by another device");
  if (bank.status !== "open") throw fail("E_BANK_CLOSED", "this bank is already counted or closed");
}

/**
 * Expected cash in a bank.
 * @param {BankState} bank
 * @param {number[]} cashPaymentsCentimes active cash amounts recorded with this bankId: order payments (credit notes
 * negative) and cash `kredi.repaid` (refunds negative)
 */
export function expectedCash(bank, cashPaymentsCentimes) {
  const cash = cashPaymentsCentimes.reduce((a, c) => {
    assertCentimes(c, "cash payment");
    return a + c;
  }, 0);
  return bank.floatCentimes + cash + bank.cashInCentimes - bank.cashOutCentimes;
}

/**
 * Over (+) or short (−) once counted.
 * @param {BankState} bank
 * @param {number[]} cashPaymentsCentimes
 * @returns {number | null} null before the count
 */
export function cashVariance(bank, cashPaymentsCentimes) {
  if (bank.countedCentimes === null) return null;
  return bank.countedCentimes - expectedCash(bank, cashPaymentsCentimes);
}

/**
 * Dose counter reconciliation for one period between two machine readings.
 * @param {{ openReading: number, closeReading: number, dosesSold: number, dosesOffTill?: number, avgDoseCentimes?: number }} p
 *   dosesOffTill: doses the barista declares outside sales (tests, staff coffee, offered, purge).
 *   avgDoseCentimes: average selling price of one dose, to express the gap in DH.
 */
export function doseVariance(p) {
  for (const k of ["openReading", "closeReading", "dosesSold"]) {
    const v = /** @type {any} */ (p)[k];
    if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`${k} must be a non-negative integer`);
  }
  const off = p.dosesOffTill ?? 0;
  if (!Number.isSafeInteger(off) || off < 0) throw new RangeError("dosesOffTill must be a non-negative integer");
  if (p.closeReading < p.openReading) {
    return { ok: false, reason: "counter_reset", machineDoses: null, expectedDoses: p.dosesSold + off, gapDoses: null, gapCentimes: null };
  }
  const machineDoses = p.closeReading - p.openReading;
  const expectedDoses = p.dosesSold + off;
  const gapDoses = machineDoses - expectedDoses;
  const avg = p.avgDoseCentimes ?? 0;
  assertCentimes(avg, "avgDoseCentimes");
  return { ok: true, reason: null, machineDoses, expectedDoses, gapDoses, gapCentimes: gapDoses > 0 ? gapDoses * avg : 0 };
}

/**
 * Alert rule from the pilot plan: a gap above the threshold on two periods in a row.
 * threshold = max(minDoses, machineDoses × relativeBp / 10000).
 * @param {{ machineDoses: number | null, gapDoses: number | null }[]} periods oldest first
 * @param {{ minDoses?: number, relativeBp?: number, consecutive?: number }} [rule]
 */
export function doseAlert(periods, rule = {}) {
  const minDoses = rule.minDoses ?? 5;
  const relativeBp = rule.relativeBp ?? 300;
  const consecutive = rule.consecutive ?? 2;
  let streak = 0;
  for (const p of periods) {
    if (p.machineDoses === null || p.gapDoses === null) {
      streak = 0;
      continue;
    }
    const threshold = Math.max(minDoses, Math.ceil((p.machineDoses * relativeBp) / 10000));
    streak = p.gapDoses > threshold ? streak + 1 : 0;
  }
  return streak >= consecutive;
}
