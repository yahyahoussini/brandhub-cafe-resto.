// @ts-check
/**
 * The day's numbers (docs/10 §1) and the Z (docs/10 §2), computed the same way on the tablet, the Station and the
 * cloud. `dailyReport` takes folded aggregates; `buildDay` folds a raw event log first, in any order.
 *
 * - The business day of an order is that of its closing (closed), its last event (voided) or its opening (open);
 *   a bank's is that of its opening; with `businessDate`, only that day is reported.
 * - TEST orders (training) stay out of every number.
 * - Revenue counts credit notes negative; tickets and credit notes are counted apart.
 * - Cash gaps come from `cashVariance` (bank.js); the dose gap from `doseVariance` with the day's average dose price
 *   (coffee revenue ÷ coffee doses sold).
 */

import { BANK_EVENT_TYPES, applyBankEvent, cashVariance, doseVariance, expectedCash } from "./bank.js";
import { allocate, discountAmount, divRound } from "./money.js";
import { ORDER_EVENT_TYPES, dosesSold, foldOrder, isActiveLine, paymentsByTender } from "./order.js";
import { businessDate as businessDateOf } from "./timezone.js";

/** @typedef {import("./order.js").OrderState} OrderState */
/** @typedef {import("./bank.js").BankState} BankState */
/** @typedef {import("./events.js").EventEnvelope} EventEnvelope */

/** Defaults of `reports.thresholds` (docs/03 §8). */
export const DEFAULT_THRESHOLDS = Object.freeze({ cashGapCentimes: 2000, dose: Object.freeze({ minDoses: 5, relativeBp: 300 }) });

/**
 * @typedef {object} DayOptions
 * @property {string} [tz] IANA zone (default Africa/Casablanca)
 * @property {string} [cutoff] "HH:MM", the setting hours.businessDayCutoff (default 05:00)
 * @property {string} [businessDate] "YYYY-MM-DD": report only this day
 * @property {{ cashGapCentimes: number, dose: { minDoses: number, relativeBp: number } }} [thresholds]
 */

/**
 * @param {{
 *   orders: OrderState[],
 *   banks: BankState[],
 *   cashPaymentsByBank: Record<string, number[]>,
 *   readings: EventEnvelope[],
 *   offTill: EventEnvelope[],
 *   discountStaff?: Record<string, string | null>,
 * } & DayOptions} input `readings` are `machine.reading` events, `offTill` `machine.off_till` events;
 *   `discountStaff` names who set each order's discount (buildDay fills it), else the staff who closed it
 */
export function dailyReport(input) {
  const { tz, cutoff = "05:00", businessDate = null } = input;
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
  const dayOf = (/** @type {number} */ at) => businessDateOf(at, { tz, cutoff });
  const inDay = (/** @type {number} */ at) => businessDate === null || dayOf(at) === businessDate;
  const orderAt = (/** @type {OrderState} */ o) => (o.status === "closed" ? /** @type {number} */ (o.closedAt) : o.status === "voided" ? o.updatedAt : o.openedAt);

  const orders = input.orders.filter((o) => !o.training && inDay(orderAt(o)));
  const closed = orders.filter((o) => o.status === "closed");
  const sales = closed.filter((o) => o.refundOf === null);
  const refunds = closed.filter((o) => o.refundOf !== null);

  // Revenue, VAT by rate, net
  const revenueCentimes = sum(closed.map((o) => o.totals.totalCentimes));
  /** @type {Map<number, { rateBp: number, ttcCentimes: number, vatCentimes: number, baseCentimes: number }>} */
  const byRate = new Map();
  for (const o of closed) {
    for (const r of o.totals.vat) {
      const acc = byRate.get(r.rateBp) ?? { rateBp: r.rateBp, ttcCentimes: 0, vatCentimes: 0, baseCentimes: 0 };
      acc.ttcCentimes += r.ttcCentimes;
      acc.vatCentimes += r.vatCentimes;
      acc.baseCentimes += r.baseCentimes;
      byRate.set(r.rateBp, acc);
    }
  }
  const vat = [...byRate.values()].sort((a, b) => a.rateBp - b.rateBp);
  const vatCentimes = sum(vat.map((r) => r.vatCentimes));

  // Tenders
  /** @type {Record<string, number>} */
  const tenders = {};
  /** @type {Record<string, number>} */
  const tenderCounts = {};
  for (const o of closed) {
    for (const [tender, amount] of Object.entries(paymentsByTender(o))) tenders[tender] = (tenders[tender] ?? 0) + amount;
    for (const p of o.payments) if (!p.voided) tenderCounts[p.tender] = (tenderCounts[p.tender] ?? 0) + 1;
  }

  // Voids
  const voidedLines = orders.flatMap((o) => o.lines.filter((l) => l.voided && l.sent));
  // An order emptied by moving all its lines to another table (merge) is closed out as voided, but nothing was voided:
  // it counts apart, as merged.
  const emptiedByMove = (/** @type {OrderState} */ o) => o.lines.length > 0 && o.lines.every((l) => l.movedTo !== null);
  const voidedOrders = orders.filter((o) => o.status === "voided" && !emptiedByMove(o));
  const mergedOrders = orders.filter((o) => o.status === "voided" && emptiedByMove(o));

  // Discounts
  /** @type {Record<string, number>} */
  const discountByStaff = {};
  /** @type {Record<string, number>} */
  const discountByReason = {};
  for (const o of sales) {
    const d = o.totals.discountCentimes;
    if (!d) continue;
    const who = input.discountStaff?.[o.id] ?? o.closedBy ?? "unknown";
    discountByStaff[who] = (discountByStaff[who] ?? 0) + d;
    const reason = o.discount?.reason || "—";
    discountByReason[reason] = (discountByReason[reason] ?? 0) + d;
  }

  // Banks
  const banks = input.banks.filter((b) => inDay(b.openedAt)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const bankRows = banks.map((b) => {
    const cash = input.cashPaymentsByBank[b.id] ?? [];
    const gap = cashVariance(b, cash);
    /** @type {Record<string, number>} */
    const bankTenders = {};
    for (const o of input.orders) {
      if (o.training) continue;
      for (const p of o.payments) if (!p.voided && p.bankId === b.id) bankTenders[p.tender] = (bankTenders[p.tender] ?? 0) + p.amountCentimes;
    }
    return {
      id: b.id,
      kind: b.kind,
      holder: b.holder,
      status: b.status,
      openedAt: b.openedAt,
      closedAt: b.closedAt,
      floatCentimes: b.floatCentimes,
      cashInCentimes: b.cashInCentimes,
      cashOutCentimes: b.cashOutCentimes,
      movements: b.movements,
      tenders: bankTenders,
      expectedCentimes: expectedCash(b, cash),
      countedCentimes: b.countedCentimes,
      gapCentimes: gap,
      // docs/07 §6: balanced = success, within the threshold = warning, above = danger
      gapState: gap === null ? null : gap === 0 ? "ok" : Math.abs(gap) <= thresholds.cashGapCentimes ? "warn" : "danger",
      noSaleCount: b.noSaleCount,
      reprintCount: b.reprintCount,
    };
  });

  return {
    businessDate,
    tickets: { count: sales.length, series: receiptSeries(sales) },
    creditNotes: { count: refunds.length, totalCentimes: sum(refunds.map((o) => o.totals.totalCentimes)), series: receiptSeries(refunds) },
    revenueCentimes,
    vat,
    vatCentimes,
    netCentimes: revenueCentimes - vatCentimes,
    averageTicketCentimes: sales.length ? divRound(sum(sales.map((o) => o.totals.totalCentimes)), sales.length) : 0,
    covers: sum(closed.filter((o) => o.mode === "table").map((o) => o.covers)),
    tenders,
    tenderCounts,
    cardSlips: tenderCounts.card_external ?? 0,
    voids: {
      linesAfterSend: { count: voidedLines.length, totalCentimes: sum(voidedLines.map((l) => l.totalCentimes)) },
      orders: {
        count: voidedOrders.length,
        totalCentimes: sum(voidedOrders.map((o) => o.totals.grossCentimes)),
        withoutNumber: voidedOrders.filter((o) => o.receiptNo === null).length,
        merged: mergedOrders.length,
      },

    },
    discounts: { totalCentimes: sum(sales.map((o) => o.totals.discountCentimes)), byStaff: discountByStaff, byReason: discountByReason },
    noSales: sum(banks.map((b) => b.noSaleCount)),
    reprints: sum(banks.map((b) => b.reprintCount)),
    banks: bankRows,
    doses: doseReport(sales, input.readings, input.offTill, inDay, dayOf, businessDate, thresholds),
  };
}

/** @param {number[]} xs */
function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * First and last receipt number per series ("C1": C1-000001 … C1-000003).
 * @param {OrderState[]} orders
 */
function receiptSeries(orders) {
  /** @type {Record<string, { first: string, last: string, count: number }>} */
  const out = {};
  const nums = orders
    .map((o) => o.receiptNo)
    .filter((n) => n !== null)
    .map((n) => {
      const i = /** @type {string} */ (n).lastIndexOf("-");
      return { prefix: /** @type {string} */ (n).slice(0, i), no: Number(/** @type {string} */ (n).slice(i + 1)), text: /** @type {string} */ (n) };
    })
    .sort((a, b) => (a.prefix === b.prefix ? a.no - b.no : a.prefix < b.prefix ? -1 : 1));
  for (const n of nums) {
    const s = (out[n.prefix] ??= { first: n.text, last: n.text, count: 0 });
    s.last = n.text;
    s.count += 1;
  }
  return out;
}

/**
 * Coffee revenue after the order discount, spread over the lines as order.js does (largest remainder).
 * @param {OrderState} o
 */
function coffeeRevenue(o) {
  const active = o.lines.filter(isActiveLine);
  const totals = active.map((l) => l.totalCentimes);
  const gross = sum(totals);
  const discount = o.discount && gross > 0 ? discountAmount(gross, o.discount) : 0;
  const shares = discount > 0 ? allocate(discount, totals) : totals.map(() => 0);
  return sum(active.map((l, i) => (l.doses > 0 ? l.totalCentimes - shares[i] : 0)));
}

/**
 * @param {OrderState[]} sales closed sales of the day (no credit note, no TEST)
 * @param {EventEnvelope[]} readings
 * @param {EventEnvelope[]} offTill
 * @param {(at: number) => boolean} inDay
 * @param {(at: number) => string} dayOf
 * @param {string | null} businessDate
 * @param {{ dose: { minDoses: number, relativeBp: number } }} thresholds
 */
function doseReport(sales, readings, offTill, inDay, dayOf, businessDate, thresholds) {
  const sold = sum(sales.map(dosesSold));
  const revenue = sum(sales.map(coffeeRevenue));
  const avgDoseCentimes = sold > 0 ? divRound(revenue, sold) : 0;
  const off = sum(offTill.filter((e) => e.type === "machine.off_till" && inDay(e.at)).map((e) => e.data.doses));

  /** @type {Map<string, { open: EventEnvelope | null, close: EventEnvelope | null }>} */
  const machines = new Map();
  for (const r of readings) {
    if (r.type !== "machine.reading") continue;
    const day = typeof r.data.businessDate === "string" ? r.data.businessDate : dayOf(r.at);
    if (businessDate !== null && day !== businessDate) continue;
    const m = machines.get(r.entity) ?? { open: null, close: null };
    // the first opening reading and the last closing reading of the day
    if (r.data.kind === "open" && (!m.open || order(r, m.open) < 0)) m.open = r;
    if (r.data.kind === "close" && (!m.close || order(r, m.close) > 0)) m.close = r;
    machines.set(r.entity, m);
  }
  const complete = [...machines.entries()].filter(([, m]) => m.open && m.close);
  const perMachine = [...machines.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([machineId, m]) => ({
    machineId,
    openReading: m.open?.data.reading ?? null,
    closeReading: m.close?.data.reading ?? null,
  }));
  if (complete.length === 0) {
    return { machines: perMachine, sold, offTill: off, avgDoseCentimes, ok: false, reason: "missing_reading", machineDoses: null, expectedDoses: sold + off, gapDoses: null, gapCentimes: null, aboveThreshold: false };
  }
  const v = doseVariance({
    openReading: sum(complete.map(([, m]) => /** @type {EventEnvelope} */ (m.open).data.reading)),
    closeReading: sum(complete.map(([, m]) => /** @type {EventEnvelope} */ (m.close).data.reading)),
    dosesSold: sold,
    dosesOffTill: off,
    avgDoseCentimes,
  });
  const threshold = v.machineDoses === null ? null : Math.max(thresholds.dose.minDoses, Math.ceil((v.machineDoses * thresholds.dose.relativeBp) / 10000));
  return {
    machines: perMachine,
    sold,
    offTill: off,
    avgDoseCentimes,
    ...v,
    aboveThreshold: threshold !== null && v.gapDoses !== null && v.gapDoses > threshold,
  };
}

/**
 * @param {EventEnvelope} a
 * @param {EventEnvelope} b
 */
function order(a, b) {
  if (a.at !== b.at) return a.at - b.at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Folds a day's raw events (any order) into aggregates and reports them. Orders and banks are rebuilt from their
 * events by seq; cash reaching each bank is the active cash payments of non-TEST orders and the cash `kredi.repaid`.
 * @param {EventEnvelope[]} events
 * @param {DayOptions} [opts]
 */
export function buildDay(events, opts = {}) {
  /** @type {Map<string, EventEnvelope[]>} */
  const orderEvents = new Map();
  /** @type {Map<string, EventEnvelope[]>} */
  const bankEvents = new Map();
  /** @type {EventEnvelope[]} */
  const readings = [];
  /** @type {EventEnvelope[]} */
  const offTill = [];
  /** @type {Record<string, number[]>} */
  const cashPaymentsByBank = {};
  for (const ev of events) {
    if (ORDER_EVENT_TYPES.includes(ev.type)) push(orderEvents, ev.entity, ev);
    else if (BANK_EVENT_TYPES.includes(ev.type)) push(bankEvents, ev.entity, ev);
    else if (ev.type === "machine.reading") readings.push(ev);
    else if (ev.type === "machine.off_till") offTill.push(ev);
    else if (ev.type === "kredi.repaid" && ev.data.tender === "cash" && ev.data.bankId) {
      (cashPaymentsByBank[ev.data.bankId] ??= []).push(ev.data.amountCentimes);
    }
  }
  const orders = [...orderEvents.values()].map((evs) => foldOrder(/** @type {any} */ (evs)));
  const banks = [...bankEvents.values()].map((evs) => {
    /** @type {BankState | null} */
    let b = null;
    for (const ev of [...evs].sort((x, y) => /** @type {number} */ (x.seq) - /** @type {number} */ (y.seq))) {
      b = applyBankEvent(b, /** @type {any} */ (ev));
    }
    return /** @type {BankState} */ (b);
  });
  /** @type {Record<string, string | null>} */
  const discountStaff = {};
  for (const o of orders) {
    if (o.training) continue;
    for (const p of o.payments) if (!p.voided && p.tender === "cash") (cashPaymentsByBank[p.bankId] ??= []).push(p.amountCentimes);
    const setters = (orderEvents.get(o.id) ?? []).filter((e) => e.type === "discount.set").sort((x, y) => /** @type {number} */ (x.seq) - /** @type {number} */ (y.seq));
    if (o.discount && setters.length) discountStaff[o.id] = /** @type {EventEnvelope} */ (setters.at(-1)).staff;
  }
  for (const list of Object.values(cashPaymentsByBank)) list.sort((a, b) => a - b);
  return dailyReport({ orders, banks, cashPaymentsByBank, readings, offTill, discountStaff, ...opts });
}

/**
 * @template T
 * @param {Map<string, T[]>} map
 * @param {string} key
 * @param {T} value
 */
function push(map, key, value) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}
