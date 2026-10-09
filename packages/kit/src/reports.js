// @ts-check
/**
 * The day's numbers (docs/10 §1) and the Z (docs/10 §2), computed the same way on the tablet, the Station and the
 * cloud. `dailyReport` takes folded aggregates; `buildDay` folds a raw event log first, in any order.
 *
 * - The business day of an order is that of its closing (closed), its last event (voided) or its opening (open); a
 *   bank's is that of its opening. An event the store flagged for a wrong device clock (`clockSkew`) counts at its
 *   `recvAt` (docs/04 §6). With `businessDate`, only that day is reported.
 * - TEST orders (training) stay out of every number.
 * - Revenue counts credit notes negative; tickets and credit notes are counted apart; the average ticket is revenue ÷
 *   tickets (docs/10 §1).
 * - Cash gaps come from `cashVariance` (bank.js); the dose gap from `doseVariance` with the day's average dose price
 *   (coffee revenue ÷ coffee doses sold), only when every machine of the day has its opening and closing readings.
 * - A bank's Z covers the payments made into it (`payment.bankId`): an order paid into two banks shares its revenue and
 *   VAT between them in proportion to the amounts paid (largest remainder).
 */

import { BANK_EVENT_TYPES, applyBankEvent, cashVariance, doseVariance, expectedCash } from "./bank.js";
import { allocate, discountAmount, divRound } from "./money.js";
import { ORDER_EVENT_TYPES, dosesSold, foldOrder, isActiveLine, paymentsByTender } from "./order.js";
import { businessDate as businessDateOf } from "./timezone.js";

/** @typedef {import("./order.js").OrderState} OrderState */
/** @typedef {import("./bank.js").BankState} BankState */
/** @typedef {import("./events.js").EventEnvelope} EventEnvelope */
/** @typedef {{ cashGapCentimes: number, dose: { minDoses: number, relativeBp: number } }} Thresholds */
/** @typedef {{ rateBp: number, ttcCentimes: number, vatCentimes: number, baseCentimes: number }} VatRow */

/** Defaults of `reports.thresholds` (docs/03 §8). */
export const DEFAULT_THRESHOLDS = Object.freeze({ cashGapCentimes: 2000, dose: Object.freeze({ minDoses: 5, relativeBp: 300 }) });

/**
 * @typedef {object} DayOptions
 * @property {string} [tz] IANA zone (default Africa/Casablanca)
 * @property {string} [cutoff] "HH:MM", the setting hours.businessDayCutoff (default 05:00)
 * @property {string} [businessDate] "YYYY-MM-DD": report only this day
 * @property {Partial<Thresholds>} [thresholds] the setting reports.thresholds; a missing or malformed field keeps its
 *   default
 */

/**
 * @typedef {object} EffectiveTimes when an aggregate's events count for the business day (buildDay fills it from the
 *   stored events, applying the clock-skew rule); without it, the aggregate's own times are used
 * @property {number} [opened]
 * @property {number} [closed]
 * @property {number} [last]
 */

/**
 * @param {{
 *   orders: OrderState[],
 *   banks: BankState[],
 *   cashPaymentsByBank: Record<string, number[]>,
 *   krediCashByBank?: Record<string, number[]>,
 *   readings: EventEnvelope[],
 *   offTill: EventEnvelope[],
 *   discountStaff?: Record<string, string | null>,
 *   times?: Record<string, EffectiveTimes>,
 * } & DayOptions} input
 *   - `cashPaymentsByBank`: every cash amount that reached each bank (order payments and cash `kredi.repaid`), as
 *     `expectedCash` wants them; `krediCashByBank`: the Kredi part of it, shown on its own line of the bank's Z;
 *   - `readings` are `machine.reading` events and `offTill` `machine.off_till` events (their `at` already effective);
 *   - `discountStaff` names who set each order's discount (buildDay fills it), else the staff who closed it.
 */
export function dailyReport(input) {
  const { tz, cutoff = "05:00", businessDate = null } = input;
  const thresholds = normalizeThresholds(input.thresholds);
  const times = input.times ?? {};
  const dayOf = (/** @type {number} */ at) => businessDateOf(at, { tz, cutoff });
  const inDay = (/** @type {number} */ at) => businessDate === null || dayOf(at) === businessDate;
  const orderAt = (/** @type {OrderState} */ o) => {
    const t = times[o.id] ?? {};
    if (o.status === "closed") return t.closed ?? /** @type {number} */ (o.closedAt);
    if (o.status === "voided") return t.last ?? o.updatedAt;
    return t.opened ?? o.openedAt;
  };

  const orders = input.orders.filter((o) => !o.training && inDay(orderAt(o)));
  const closed = orders.filter((o) => o.status === "closed");
  const sales = closed.filter((o) => o.refundOf === null);
  const refunds = closed.filter((o) => o.refundOf !== null);

  const revenueCentimes = sum(closed.map((o) => o.totals.totalCentimes));
  const vat = addVat(closed.flatMap((o) => o.totals.vat));
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

  // Voids. An order emptied by moving its lines to another table (merge) is closed out as voided, but nothing was
  // voided: it counts apart, as merged. Lines voided before sending are free corrections and do not stop that.
  const emptiedByMove = (/** @type {OrderState} */ o) =>
    o.lines.some((l) => l.movedTo !== null) && o.lines.every((l) => l.movedTo !== null || (l.voided && !l.sent));
  const voidedLines = orders.flatMap((o) => o.lines.filter((l) => l.voided && l.sent));
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

  // Banks and their Z
  const banks = input.banks
    .filter((b) => inDay(times[b.id]?.opened ?? b.openedAt))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shares = bankShares(closed);
  const bankRows = banks.map((b) => {
    const cash = input.cashPaymentsByBank[b.id] ?? [];
    const kredi = sum(input.krediCashByBank?.[b.id] ?? []);
    const gap = cashVariance(b, cash);
    /** @type {Record<string, number>} */
    const bankTenders = {};
    /** @type {Record<string, number>} */
    const bankCounts = {};
    for (const o of input.orders) {
      if (o.training) continue;
      for (const p of o.payments) {
        if (p.voided || p.bankId !== b.id) continue;
        bankTenders[p.tender] = (bankTenders[p.tender] ?? 0) + p.amountCentimes;
        bankCounts[p.tender] = (bankCounts[p.tender] ?? 0) + 1;
      }
    }
    const mine = shares.get(b.id) ?? { orders: [], vat: [] };
    const bankVat = addVat(mine.vat);
    const bankRevenue = sum(bankVat.map((r) => r.ttcCentimes));
    const bankVatCentimes = sum(bankVat.map((r) => r.vatCentimes));
    return {
      id: b.id,
      kind: b.kind,
      holder: b.holder,
      status: b.status,
      openedAt: b.openedAt,
      closedAt: b.closedAt,
      tickets: { count: mine.orders.filter((o) => o.refundOf === null).length, series: receiptSeries(mine.orders.filter((o) => o.refundOf === null)) },
      creditNotes: { count: mine.orders.filter((o) => o.refundOf !== null).length, series: receiptSeries(mine.orders.filter((o) => o.refundOf !== null)) },
      revenueCentimes: bankRevenue,
      vat: bankVat,
      vatCentimes: bankVatCentimes,
      netCentimes: bankRevenue - bankVatCentimes,
      tenders: bankTenders,
      tenderCounts: bankCounts,
      cardSlips: bankCounts.card_external ?? 0,
      floatCentimes: b.floatCentimes,
      salesCashCentimes: sum(cash) - kredi,
      krediCashCentimes: kredi,
      cashInCentimes: b.cashInCentimes,
      cashOutCentimes: b.cashOutCentimes,
      movements: b.movements,
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
    averageTicketCentimes: sales.length ? divRound(revenueCentimes, sales.length) : 0,
    covers: sum(closed.filter((o) => o.mode === "table").map((o) => o.covers)),
    tenders,
    tenderCounts,
    cardSlips: tenderCounts.card_external ?? 0,
    voids: {
      linesAfterSend: { count: voidedLines.length, totalCentimes: sum(voidedLines.map((l) => l.totalCentimes)) },
      orders: {
        count: voidedOrders.length,
        // the order's TTC value at the time, after its discount
        totalCentimes: sum(voidedOrders.map((o) => o.totals.totalCentimes)),
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
 * The thresholds in force: each field of the setting when it is a whole number ≥ 0, else its default (a malformed
 * setting never turns every gap into "danger" or breaks the report).
 * @param {Partial<Thresholds> | undefined} t
 * @returns {Thresholds}
 */
export function normalizeThresholds(t) {
  const ok = (/** @type {unknown} */ v) => Number.isSafeInteger(v) && /** @type {number} */ (v) >= 0;
  const d = DEFAULT_THRESHOLDS;
  return {
    cashGapCentimes: ok(t?.cashGapCentimes) ? /** @type {number} */ (t?.cashGapCentimes) : d.cashGapCentimes,
    dose: {
      minDoses: ok(t?.dose?.minDoses) ? /** @type {number} */ (t?.dose?.minDoses) : d.dose.minDoses,
      relativeBp: ok(t?.dose?.relativeBp) ? /** @type {number} */ (t?.dose?.relativeBp) : d.dose.relativeBp,
    },
  };
}

/**
 * Adds VAT rows by rate.
 * @param {VatRow[]} rows
 * @returns {VatRow[]}
 */
function addVat(rows) {
  /** @type {Map<number, VatRow>} */
  const byRate = new Map();
  for (const r of rows) {
    const acc = byRate.get(r.rateBp) ?? { rateBp: r.rateBp, ttcCentimes: 0, vatCentimes: 0, baseCentimes: 0 };
    acc.ttcCentimes += r.ttcCentimes;
    acc.vatCentimes += r.vatCentimes;
    acc.baseCentimes += r.baseCentimes;
    byRate.set(r.rateBp, acc);
  }
  return [...byRate.values()].sort((a, b) => a.rateBp - b.rateBp);
}

/**
 * Each closed order's revenue and VAT shared between the banks its payments went into, in proportion to the amounts
 * (docs/10 §2: a bank's Z covers the payments made into it).
 * @param {OrderState[]} closed
 * @returns {Map<string, { orders: OrderState[], vat: VatRow[] }>}
 */
function bankShares(closed) {
  /** @type {Map<string, { orders: OrderState[], vat: VatRow[] }>} */
  const out = new Map();
  for (const o of closed) {
    /** @type {Map<string, number>} */
    const paid = new Map();
    for (const p of o.payments) if (!p.voided) paid.set(p.bankId, (paid.get(p.bankId) ?? 0) + Math.abs(p.amountCentimes));
    const bankIds = [...paid.keys()].sort();
    if (bankIds.length === 0) continue;
    const weights = bankIds.map((id) => /** @type {number} */ (paid.get(id)));
    const split = o.totals.vat.map((r) => ({ rateBp: r.rateBp, ttc: allocate(r.ttcCentimes, weights), vat: allocate(r.vatCentimes, weights) }));
    bankIds.forEach((id, i) => {
      const entry = out.get(id) ?? { orders: [], vat: [] };
      entry.orders.push(o);
      for (const s of split) entry.vat.push({ rateBp: s.rateBp, ttcCentimes: s.ttc[i], vatCentimes: s.vat[i], baseCentimes: s.ttc[i] - s.vat[i] });
      out.set(id, entry);
    });
  }
  return out;
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
      const text = /** @type {string} */ (n);
      const i = text.lastIndexOf("-");
      return { prefix: text.slice(0, i), no: Number(text.slice(i + 1)), text };
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
  const parts = discount > 0 ? allocate(discount, totals) : totals.map(() => 0);
  return sum(active.map((l, i) => (l.doses > 0 ? l.totalCentimes - parts[i] : 0)));
}

/**
 * @param {OrderState[]} sales closed sales of the day (no credit note, no TEST)
 * @param {EventEnvelope[]} readings
 * @param {EventEnvelope[]} offTill
 * @param {(at: number) => boolean} inDay
 * @param {(at: number) => string} dayOf
 * @param {string | null} businessDate
 * @param {Thresholds} thresholds
 */
function doseReport(sales, readings, offTill, inDay, dayOf, businessDate, thresholds) {
  const sold = sum(sales.map(dosesSold));
  const revenue = sum(sales.map(coffeeRevenue));
  const avgDoseCentimes = sold > 0 ? divRound(revenue, sold) : 0;
  const off = sum(offTill.filter((e) => e.type === "machine.off_till" && inDay(e.at)).map((e) => e.data.doses));

  /** @type {Map<string, { open: EventEnvelope | null, close: EventEnvelope | null }>} */
  const machines = new Map();
  for (const r of readings) {
    if (r.type !== "machine.reading" || (r.data.kind !== "open" && r.data.kind !== "close")) continue;
    const day = typeof r.data.businessDate === "string" ? r.data.businessDate : dayOf(r.at);
    if (businessDate !== null && day !== businessDate) continue;
    const m = machines.get(r.entity) ?? { open: null, close: null };
    // the first opening reading and the last closing reading of the day
    if (r.data.kind === "open" && (!m.open || order(r, m.open) < 0)) m.open = r;
    if (r.data.kind === "close" && (!m.close || order(r, m.close) > 0)) m.close = r;
    machines.set(r.entity, m);
  }
  const list = [...machines.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const perMachine = list.map(([machineId, m]) => ({
    machineId,
    openReading: m.open?.data.reading ?? null,
    closeReading: m.close?.data.reading ?? null,
  }));
  const base = { machines: perMachine, sold, offTill: off, avgDoseCentimes, expectedDoses: sold + off, aboveThreshold: false };
  // Doses sold cannot be shared between machines: every machine of the day needs both readings, and one counter
  // reset makes the day's gap unknown, never guessed.
  if (list.length === 0 || list.some(([, m]) => !m.open || !m.close)) {
    return { ...base, ok: false, reason: "missing_reading", machineDoses: null, gapDoses: null, gapCentimes: null };
  }
  if (list.some(([, m]) => /** @type {EventEnvelope} */ (m.close).data.reading < /** @type {EventEnvelope} */ (m.open).data.reading)) {
    return { ...base, ok: false, reason: "counter_reset", machineDoses: null, gapDoses: null, gapCentimes: null };
  }
  const machineDoses = sum(list.map(([, m]) => /** @type {EventEnvelope} */ (m.close).data.reading - /** @type {EventEnvelope} */ (m.open).data.reading));
  const v = doseVariance({ openReading: 0, closeReading: machineDoses, dosesSold: sold, dosesOffTill: off, avgDoseCentimes });
  const threshold = Math.max(thresholds.dose.minDoses, Math.ceil((machineDoses * thresholds.dose.relativeBp) / 10000));
  return { ...base, ...v, aboveThreshold: v.gapDoses !== null && v.gapDoses > threshold };
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
 * The instant an event counts at for the business day: the server's `recvAt` when the store flagged the device clock
 * (`clockSkew`, docs/04 §6), else the device's `at`.
 * @param {EventEnvelope & { recvAt?: number, clockSkew?: number | boolean }} ev
 */
export function effectiveAt(ev) {
  return ev.clockSkew && Number.isSafeInteger(ev.recvAt) ? /** @type {number} */ (ev.recvAt) : ev.at;
}

/**
 * Folds events (any order) into aggregates and reports them. Give it every event of each order and bank that touches
 * the day — select by entity, not by date (an order opened before the cut-off and closed after it needs its opening);
 * `businessDate` picks the day. Stored events may carry `recvAt` and `clockSkew` (the clock-skew rule applies).
 * Cash reaching each bank is the active cash payments of non-TEST orders and the cash `kredi.repaid`.
 * @param {(EventEnvelope & { recvAt?: number, clockSkew?: number | boolean })[]} events
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
  /** @type {Record<string, number[]>} */
  const krediCashByBank = {};
  /** @type {Record<string, EffectiveTimes>} */
  const times = {};
  for (const ev of events) {
    if (ORDER_EVENT_TYPES.includes(ev.type)) push(orderEvents, ev.entity, ev);
    else if (BANK_EVENT_TYPES.includes(ev.type)) push(bankEvents, ev.entity, ev);
    else if (ev.type === "machine.reading") readings.push({ ...ev, at: effectiveAt(ev) });
    else if (ev.type === "machine.off_till") offTill.push({ ...ev, at: effectiveAt(ev) });
    else if (ev.type === "kredi.repaid" && ev.data.tender === "cash" && ev.data.bankId) {
      (cashPaymentsByBank[ev.data.bankId] ??= []).push(ev.data.amountCentimes);
      (krediCashByBank[ev.data.bankId] ??= []).push(ev.data.amountCentimes);
    }
  }
  const bySeq = (/** @type {EventEnvelope} */ x, /** @type {EventEnvelope} */ y) => /** @type {number} */ (x.seq) - /** @type {number} */ (y.seq);
  const orders = [...orderEvents.values()].map((evs) => {
    const sorted = [...evs].sort(bySeq);
    const closing = sorted.find((e) => e.type === "order.closed");
    times[sorted[0].entity] = {
      opened: effectiveAt(sorted[0]),
      last: effectiveAt(/** @type {EventEnvelope} */ (sorted.at(-1))),
      ...(closing ? { closed: effectiveAt(closing) } : {}),
    };
    return foldOrder(/** @type {any} */ (sorted));
  });
  const banks = [...bankEvents.values()].map((evs) => {
    const sorted = [...evs].sort(bySeq);
    times[sorted[0].entity] = { opened: effectiveAt(sorted[0]) };
    /** @type {BankState | null} */
    let b = null;
    for (const ev of sorted) b = applyBankEvent(b, /** @type {any} */ (ev));
    return /** @type {BankState} */ (b);
  });
  /** @type {Record<string, string | null>} */
  const discountStaff = {};
  for (const o of orders) {
    if (o.training) continue;
    for (const p of o.payments) if (!p.voided && p.tender === "cash") (cashPaymentsByBank[p.bankId] ??= []).push(p.amountCentimes);
    const setters = (orderEvents.get(o.id) ?? []).filter((e) => e.type === "discount.set").sort(bySeq);
    if (o.discount && setters.length) discountStaff[o.id] = /** @type {EventEnvelope} */ (setters.at(-1)).staff;
  }
  for (const list of [...Object.values(cashPaymentsByBank), ...Object.values(krediCashByBank)]) list.sort((a, b) => a - b);
  return dailyReport({ orders, banks, cashPaymentsByBank, krediCashByBank, readings, offTill, discountStaff, times, ...opts });
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
