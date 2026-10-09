// @ts-check
/**
 * The order aggregate: the same pure function rebuilds an order on the tablet, on the Station
 * and in the cloud, from the order's events in seq order. See docs/03-domain-model.md §4 (envelope) and §5 (events).
 *
 * Rules enforced here (business rules that depend only on the order itself):
 * - one writer per order: only the owner device appends events; ownership moves with
 *   order.transferred (by the owner) or order.taken_over (any device, manager approval);
 * - seq is strictly +1; an event id already applied is ignored (idempotent replay);
 * - sent lines cannot change quantity; voiding a sent line needs a manager's approval, unless the
 *   line is held (sent "à suivre" and not fired yet: the kitchen has not started it);
 * - payments never exceed the total; an order closes only when fully paid;
 * - a credit note (refundOf) has negative quantities and negative payments, and no discount;
 * - lines move between two orders (merge, split, table change of part of a bill) with a pair of events,
 *   lines.moved_out on the source and lines.moved_in on the target, sharing a moveId: the lines keep their
 *   sent, held and fired state, so a move is never a void, needs no approval and never prints a second ticket.
 *   The server stores both events of a pair in one transaction or refuses both (docs/04 §2);
 * - a customer is attached with order.customer_set (Kredi, stamp card, deliveries).
 *
 * Permission rules (who may discount how much, who may approve) are checked before the event is
 * created, from data/permissions.json. The reducer only checks that an approval is present.
 */

import { allocate, assertCentimes, assertRateBp, discountAmount, divRound, lineTotal, vatIncluded } from "./money.js";

export class OrderRuleError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "OrderRuleError";
    this.code = code;
  }
}

export const ORDER_MODES = Object.freeze(["counter", "table", "takeaway", "delivery"]);
export const TENDERS = Object.freeze(["cash", "card_external", "maroc_pay", "transfer", "voucher", "credit", "other"]);
export const ORDER_EVENT_TYPES = Object.freeze([
  "order.opened",
  "line.added",
  "line.qty_changed",
  "line.voided",
  "lines.sent",
  "lines.fired",
  "discount.set",
  "discount.cleared",
  "order.moved",
  "order.covers_set",
  "order.note_set",
  "payment.added",
  "payment.voided",
  "order.closed",
  "order.voided",
  "order.transferred",
  "order.taken_over",
  "order.customer_set",
  "lines.moved_out",
  "lines.moved_in",
]);

/** A payment can be corrected without approval within this delay (ms). */
export const PAYMENT_CORRECTION_WINDOW_MS = 120_000;

/**
 * @typedef {object} OrderEvent
 * @property {string} id uuidv7
 * @property {string} type
 * @property {string} entity ord_…
 * @property {number} seq
 * @property {string} device dev_…
 * @property {string | null} staff stf_… or null
 * @property {number} at device clock, Unix ms
 * @property {Record<string, any>} data
 */

/**
 * @typedef {object} Line
 * @property {string} lineId
 * @property {string} productId
 * @property {{ fr: string, ar: string }} name
 * @property {number} unitCentimes
 * @property {number} qtyMilli
 * @property {number} vatBp
 * @property {{ id: string, name: { fr: string, ar: string }, priceCentimes: number }[]} modifiers
 * @property {string | null} station
 * @property {string | null} category
 * @property {number} doses doses per unit (dose counter), 0 when not a coffee
 * @property {string} note
 * @property {number | null} seat seat number at the table (Resto), null when not used
 * @property {number} course 1 = starters/first send, up to 6
 * @property {boolean} sent
 * @property {number | null} sentAt
 * @property {boolean} held sent "à suivre": visible in the kitchen, not to cook yet
 * @property {number | null} firedAt
 * @property {boolean} voided
 * @property {string | null} voidReason
 * @property {string | null} movedTo ord_… the line was moved to (then it no longer counts here)
 * @property {string | null} movedFrom ord_… the line came from
 * @property {number} totalCentimes
 */

/**
 * @typedef {object} Payment
 * @property {string} paymentId
 * @property {string} tender
 * @property {number} amountCentimes
 * @property {number | null} tenderedCentimes
 * @property {number} changeCentimes
 * @property {string | null} reference
 * @property {string} bankId
 * @property {number} at
 * @property {string | null} staff
 * @property {boolean} voided
 */

/**
 * @typedef {object} OrderState
 * @property {string} id
 * @property {"open" | "closed" | "voided"} status
 * @property {string} mode
 * @property {string | null} tableId
 * @property {string | null} zoneId
 * @property {number} covers
 * @property {string} owner
 * @property {number} openedAt
 * @property {string | null} openedBy
 * @property {number | null} closedAt
 * @property {string | null} closedBy
 * @property {string | null} receiptNo
 * @property {{ orderId: string, receiptNo: string, restock: boolean } | null} refundOf restock: goods came back to stock
 * @property {string | null} customerId cus_… attached with order.customer_set
 * @property {boolean} training TEST order (training mode): numbered in the device's training series, left out of reports
 * @property {string} source where the order came from: pos, web, qr, phone, glovo…
 * @property {Line[]} lines
 * @property {{ kind: "percent" | "amount", value: number, reason: string, approvedBy: string | null } | null} discount
 * @property {Payment[]} payments
 * @property {string} note
 * @property {string | null} voidReason
 * @property {number} seq
 * @property {string[]} eventIds
 * @property {number} updatedAt
 * @property {Totals} totals
 */

/**
 * @typedef {object} Totals
 * @property {number} grossCentimes sum of active lines, TTC
 * @property {number} discountCentimes
 * @property {number} totalCentimes
 * @property {number} paidCentimes
 * @property {number} dueCentimes
 * @property {{ rateBp: number, ttcCentimes: number, vatCentimes: number, baseCentimes: number }[]} vat
 */

/**
 * @param {string} code
 * @param {string} message
 */
function fail(code, message) {
  return new OrderRuleError(code, message);
}

/** @param {OrderEvent} ev */
function checkEnvelope(ev) {
  if (!ev || typeof ev !== "object") throw fail("E_BAD_EVENT", "event must be an object");
  for (const k of ["id", "type", "entity", "device"]) {
    if (typeof /** @type {any} */ (ev)[k] !== "string" || !/** @type {any} */ (ev)[k]) throw fail("E_BAD_EVENT", `event.${k} is required`);
  }
  if (!Number.isInteger(ev.seq) || ev.seq < 1) throw fail("E_BAD_EVENT", "event.seq must be a positive integer");
  if (!Number.isSafeInteger(ev.at)) throw fail("E_BAD_EVENT", "event.at must be Unix ms");
  if (!ev.data || typeof ev.data !== "object") throw fail("E_BAD_EVENT", "event.data must be an object");
  if (!ORDER_EVENT_TYPES.includes(ev.type)) throw fail("E_BAD_EVENT", `unknown order event type: ${ev.type}`);
}

/**
 * Runs a money.js check or computation on event data: a malformed amount or rate is the event's fault, so it is
 * refused with a code (E_BAD_DATA, docs/03 §9) instead of an uncoded TypeError or RangeError.
 * @template T
 * @param {() => T} f
 * @returns {T}
 */
function coded(f) {
  try {
    return f();
  } catch (e) {
    if (e instanceof TypeError || e instanceof RangeError) throw fail("E_BAD_DATA", e.message);
    throw e;
  }
}

/**
 * @param {unknown} v
 * @param {string} what
 */
function requireString(v, what) {
  if (typeof v !== "string" || v.length === 0) throw fail("E_BAD_DATA", `${what} is required`);
  return v;
}

/**
 * @param {unknown} name
 * @returns {{ fr: string, ar: string }}
 */
function checkName(name) {
  const n = /** @type {any} */ (name);
  if (!n || typeof n.fr !== "string" || typeof n.ar !== "string" || (!n.fr && !n.ar)) {
    throw fail("E_BAD_DATA", "name must be { fr, ar } with at least one text");
  }
  return { fr: n.fr, ar: n.ar };
}

/** @param {OrderState} s */
function isRefund(s) {
  return s.refundOf !== null;
}

/**
 * A line that counts in this order: not voided and not moved to another order.
 * @param {Line} l
 */
export function isActiveLine(l) {
  return !l.voided && l.movedTo === null;
}

/** @param {Line} l */
function unitWithModifiers(l) {
  return l.unitCentimes + l.modifiers.reduce((acc, m) => acc + m.priceCentimes, 0);
}

/**
 * @param {OrderState} s
 * @returns {Totals}
 */
export function computeTotals(s) {
  const active = s.lines.filter(isActiveLine);
  const lineTotals = active.map((l) => l.totalCentimes);
  const gross = lineTotals.reduce((a, b) => a + b, 0);
  let discount = 0;
  if (s.discount && gross > 0) discount = discountAmount(gross, s.discount);
  const allocated = discount > 0 ? allocate(discount, lineTotals) : lineTotals.map(() => 0);
  /** @type {Map<number, { rateBp: number, ttcCentimes: number, vatCentimes: number, baseCentimes: number }>} */
  const byRate = new Map();
  active.forEach((l, i) => {
    const net = l.totalCentimes - allocated[i];
    const vat = vatIncluded(net, l.vatBp);
    const r = byRate.get(l.vatBp) ?? { rateBp: l.vatBp, ttcCentimes: 0, vatCentimes: 0, baseCentimes: 0 };
    r.ttcCentimes += net;
    r.vatCentimes += vat;
    r.baseCentimes += net - vat;
    byRate.set(l.vatBp, r);
  });
  const total = gross - discount;
  const paid = s.payments.filter((p) => !p.voided).reduce((a, p) => a + p.amountCentimes, 0);
  return {
    grossCentimes: gross,
    discountCentimes: discount,
    totalCentimes: total,
    paidCentimes: paid,
    dueCentimes: total - paid,
    vat: [...byRate.values()].sort((a, b) => a.rateBp - b.rateBp),
  };
}

/**
 * Paid must stay between 0 and the total (or between the total and 0 for a credit note).
 * @param {OrderState} s
 */
function checkPaidWithinTotal(s) {
  const { totalCentimes: total, paidCentimes: paid } = s.totals;
  if (isRefund(s)) {
    if (paid > 0 || paid < total) throw fail("E_OVERPAID", "refunded amount cannot exceed the credit note total");
  } else if (paid < 0 || paid > total) {
    throw fail("E_OVERPAID", "payments cannot exceed the order total; refund with a credit note instead");
  }
}

/**
 * @param {OrderState} s
 * @param {string} lineId
 */
function findLine(s, lineId) {
  const l = s.lines.find((x) => x.lineId === lineId);
  if (!l) throw fail("E_LINE_UNKNOWN", `unknown line ${lineId}`);
  return l;
}

/**
 * A line this order still holds (not moved away).
 * @param {OrderState} s
 * @param {string} lineId
 */
function findHeldLine(s, lineId) {
  const l = findLine(s, lineId);
  if (l.movedTo !== null) throw fail("E_LINE_MOVED", `line ${lineId} was moved to ${l.movedTo}`);
  return l;
}

/**
 * Build a line from line.added data or from a moved line's snapshot (same checks).
 * @param {Record<string, any>} d
 * @param {boolean} refund the order is a credit note
 * @returns {Line}
 */
function buildLine(d, refund) {
  const lineId = requireString(d.lineId, "lineId");
  coded(() => assertCentimes(d.unitCentimes, "unitCentimes"));
  if (d.unitCentimes < 0) throw fail("E_BAD_DATA", "unit price cannot be negative");
  if (!Number.isSafeInteger(d.qtyMilli) || d.qtyMilli === 0) throw fail("E_BAD_DATA", "qtyMilli must be a non-zero integer");
  if (refund ? d.qtyMilli > 0 : d.qtyMilli < 0) throw fail("E_REFUND_SIGN", "credit notes use negative quantities, sales positive ones");
  coded(() => assertRateBp(d.vatBp));
  const modifiers = (d.modifiers ?? []).map((/** @type {any} */ m) => {
    coded(() => assertCentimes(m.priceCentimes, "modifier.priceCentimes"));
    return { id: requireString(m.id, "modifier.id"), name: checkName(m.name), priceCentimes: m.priceCentimes };
  });
  const doses = d.doses ?? 0;
  if (!Number.isInteger(doses) || doses < 0 || doses > 20) throw fail("E_BAD_DATA", "doses must be 0..20");
  const seat = d.seat ?? null;
  if (seat !== null && (!Number.isInteger(seat) || seat < 0 || seat > 50)) throw fail("E_BAD_DATA", "seat must be 0..50");
  const course = d.course ?? 1;
  if (!Number.isInteger(course) || course < 1 || course > 6) throw fail("E_BAD_DATA", "course must be 1..6");
  /** @type {Line} */
  const line = {
    lineId,
    productId: requireString(d.productId, "productId"),
    name: checkName(d.name),
    unitCentimes: d.unitCentimes,
    qtyMilli: d.qtyMilli,
    vatBp: d.vatBp,
    modifiers,
    station: d.station ?? null,
    category: d.category ?? null,
    doses,
    note: typeof d.note === "string" ? d.note.slice(0, 200) : "",
    seat,
    course,
    sent: false,
    sentAt: null,
    held: false,
    firedAt: null,
    voided: false,
    voidReason: null,
    movedTo: null,
    movedFrom: null,
    totalCentimes: 0,
  };
  if (unitWithModifiers(line) < 0) throw fail("E_BAD_DATA", "unit price with options cannot be negative");
  line.totalCentimes = coded(() => lineTotal(unitWithModifiers(line), line.qtyMilli));
  return line;
}

/** @param {OrderState} s */
function requireOpen(s) {
  if (s.status !== "open") throw fail("E_STATUS", `order is ${s.status}`);
}

/**
 * @param {OrderEvent} ev
 * @returns {OrderState}
 */
function opened(ev) {
  const d = ev.data;
  const mode = d.mode ?? "counter";
  if (!ORDER_MODES.includes(mode)) throw fail("E_BAD_DATA", `unknown mode ${mode}`);
  const covers = d.covers ?? 0;
  if (!Number.isInteger(covers) || covers < 0 || covers > 500) throw fail("E_BAD_DATA", "covers must be 0..500");
  let refundOf = null;
  if (d.refundOf) {
    requireString(d.refundOf.orderId, "refundOf.orderId");
    requireString(d.refundOf.receiptNo, "refundOf.receiptNo");
    if (!d.approvedBy) throw fail("E_APPROVAL_REQUIRED", "a credit note needs a manager's approval");
    if (d.refundOf.restock !== undefined && typeof d.refundOf.restock !== "boolean") throw fail("E_BAD_DATA", "refundOf.restock must be true or false");
    refundOf = { orderId: d.refundOf.orderId, receiptNo: d.refundOf.receiptNo, restock: d.refundOf.restock === true };
  }
  if (d.training !== undefined && typeof d.training !== "boolean") throw fail("E_BAD_DATA", "training must be true or false");
  const source = d.source ?? "pos";
  if (typeof source !== "string" || !/^[a-z_]{1,24}$/.test(source)) throw fail("E_BAD_DATA", "source must be a short lowercase key");
  /** @type {OrderState} */
  const s = {
    id: ev.entity,
    status: "open",
    mode,
    tableId: d.tableId ?? null,
    zoneId: d.zoneId ?? null,
    covers,
    owner: ev.device,
    openedAt: ev.at,
    openedBy: ev.staff ?? null,
    closedAt: null,
    closedBy: null,
    receiptNo: null,
    refundOf,
    customerId: null,
    training: d.training === true,
    source,
    lines: [],
    discount: null,
    payments: [],
    note: "",
    voidReason: null,
    seq: ev.seq,
    eventIds: [ev.id],
    updatedAt: ev.at,
    totals: { grossCentimes: 0, discountCentimes: 0, totalCentimes: 0, paidCentimes: 0, dueCentimes: 0, vat: [] },
  };
  return s;
}

/**
 * Apply one event to an order. Returns a new state; never mutates the input.
 * @param {OrderState | null} state
 * @param {OrderEvent} ev
 * @returns {OrderState}
 */
export function applyOrderEvent(state, ev) {
  checkEnvelope(ev);
  if (state === null) {
    if (ev.type !== "order.opened") throw fail("E_NOT_OPENED", "the first event of an order must be order.opened");
    if (ev.seq !== 1) throw fail("E_SEQ", "order.opened must have seq 1");
    return opened(ev);
  }
  if (ev.entity !== state.id) throw fail("E_ENTITY", `event for ${ev.entity} applied to ${state.id}`);
  if (state.eventIds.includes(ev.id)) return state;
  if (ev.seq !== state.seq + 1) throw fail("E_SEQ", `expected seq ${state.seq + 1}, got ${ev.seq}`);
  if (ev.type === "order.opened") throw fail("E_BAD_EVENT", "order already opened");
  if (ev.type !== "order.taken_over" && ev.device !== state.owner) {
    throw fail("E_NOT_OWNER", `device ${ev.device} does not own ${state.id} (owner ${state.owner})`);
  }

  /** @type {OrderState} */
  const s = structuredClone(state);
  const d = ev.data;

  switch (ev.type) {
    case "line.added": {
      requireOpen(s);
      const line = buildLine(d, isRefund(s));
      if (s.lines.some((l) => l.lineId === line.lineId)) throw fail("E_DUP_LINE", `line ${line.lineId} already exists`);
      s.lines.push(line);
      break;
    }
    case "line.qty_changed": {
      requireOpen(s);
      const line = findHeldLine(s, requireString(d.lineId, "lineId"));
      if (line.voided) throw fail("E_LINE_VOIDED", "line is voided");
      if (line.sent) throw fail("E_LINE_SENT", "a sent line cannot change quantity; void it and add a new one");
      if (!Number.isSafeInteger(d.qtyMilli) || d.qtyMilli === 0) throw fail("E_BAD_DATA", "qtyMilli must be a non-zero integer");
      if (isRefund(s) ? d.qtyMilli > 0 : d.qtyMilli < 0) throw fail("E_REFUND_SIGN", "quantity sign does not match the order");
      line.qtyMilli = d.qtyMilli;
      line.totalCentimes = coded(() => lineTotal(unitWithModifiers(line), line.qtyMilli));
      break;
    }
    case "line.voided": {
      requireOpen(s);
      const line = findHeldLine(s, requireString(d.lineId, "lineId"));
      if (line.voided) throw fail("E_LINE_VOIDED", "line already voided");
      if (line.sent && !line.held && !d.approvedBy) throw fail("E_APPROVAL_REQUIRED", "voiding a sent line needs a manager's approval");
      line.voided = true;
      line.voidReason = typeof d.reason === "string" ? d.reason.slice(0, 200) : "";
      break;
    }
    case "lines.sent": {
      requireOpen(s);
      if (!Array.isArray(d.lineIds) || d.lineIds.length === 0) throw fail("E_BAD_DATA", "lineIds required");
      for (const id of d.lineIds) {
        const line = findHeldLine(s, id);
        if (line.voided) throw fail("E_LINE_VOIDED", `line ${id} is voided`);
        if (line.sent) throw fail("E_LINE_SENT", `line ${id} was already sent`);
        line.sent = true;
        line.sentAt = ev.at;
        line.held = d.hold === true;
        line.firedAt = d.hold === true ? null : ev.at;
      }
      break;
    }
    case "lines.fired": {
      requireOpen(s);
      if (!Array.isArray(d.lineIds) || d.lineIds.length === 0) throw fail("E_BAD_DATA", "lineIds required");
      for (const id of d.lineIds) {
        const line = findHeldLine(s, id);
        if (line.voided) throw fail("E_LINE_VOIDED", `line ${id} is voided`);
        if (!line.sent || !line.held) throw fail("E_NOT_HELD", `line ${id} is not waiting to be fired`);
        line.held = false;
        line.firedAt = ev.at;
      }
      break;
    }
    case "discount.set": {
      requireOpen(s);
      if (isRefund(s)) throw fail("E_BAD_DATA", "no discount on a credit note");
      if (d.kind !== "percent" && d.kind !== "amount") throw fail("E_BAD_DATA", "discount kind must be percent or amount");
      coded(() => discountAmount(1, { kind: d.kind, value: d.value })); // validates value
      s.discount = { kind: d.kind, value: d.value, reason: typeof d.reason === "string" ? d.reason.slice(0, 200) : "", approvedBy: d.approvedBy ?? null };
      break;
    }
    case "discount.cleared": {
      requireOpen(s);
      s.discount = null;
      break;
    }
    case "order.moved": {
      requireOpen(s);
      s.tableId = d.tableId ?? null;
      s.zoneId = d.zoneId ?? null;
      if (s.tableId && s.mode === "counter") s.mode = "table";
      break;
    }
    case "order.covers_set": {
      requireOpen(s);
      if (!Number.isInteger(d.covers) || d.covers < 0 || d.covers > 500) throw fail("E_BAD_DATA", "covers must be 0..500");
      s.covers = d.covers;
      break;
    }
    case "order.note_set": {
      requireOpen(s);
      s.note = typeof d.note === "string" ? d.note.slice(0, 500) : "";
      break;
    }
    case "payment.added": {
      requireOpen(s);
      const paymentId = requireString(d.paymentId, "paymentId");
      if (s.payments.some((p) => p.paymentId === paymentId)) throw fail("E_DUP_PAYMENT", `payment ${paymentId} already exists`);
      if (!TENDERS.includes(d.tender)) throw fail("E_BAD_DATA", `unknown tender ${d.tender}`);
      coded(() => assertCentimes(d.amountCentimes, "amountCentimes"));
      if (d.amountCentimes === 0) throw fail("E_BAD_DATA", "payment amount cannot be 0");
      if (isRefund(s) ? d.amountCentimes > 0 : d.amountCentimes < 0) throw fail("E_REFUND_SIGN", "payment sign does not match the order");
      const bankId = requireString(d.bankId, "bankId");
      let tendered = null;
      let change = 0;
      if (d.tender === "cash" && d.tenderedCentimes != null) {
        coded(() => assertCentimes(d.tenderedCentimes, "tenderedCentimes"));
        if (!isRefund(s)) {
          if (d.tenderedCentimes < d.amountCentimes) throw fail("E_TENDERED_LOW", "cash tendered is below the amount");
          tendered = d.tenderedCentimes;
          change = d.tenderedCentimes - d.amountCentimes;
        }
      }
      s.payments.push({
        paymentId,
        tender: d.tender,
        amountCentimes: d.amountCentimes,
        tenderedCentimes: tendered,
        changeCentimes: change,
        reference: typeof d.reference === "string" && d.reference ? d.reference.slice(0, 64) : null,
        bankId,
        at: ev.at,
        staff: ev.staff ?? null,
        voided: false,
      });
      break;
    }
    case "payment.voided": {
      requireOpen(s);
      const p = s.payments.find((x) => x.paymentId === d.paymentId);
      if (!p) throw fail("E_PAYMENT_UNKNOWN", `unknown payment ${String(d.paymentId)}`);
      if (p.voided) throw fail("E_PAYMENT_VOIDED", "payment already voided");
      if (ev.at - p.at > PAYMENT_CORRECTION_WINDOW_MS && !d.approvedBy) {
        throw fail("E_APPROVAL_REQUIRED", "correcting an older payment needs a manager's approval");
      }
      p.voided = true;
      break;
    }
    case "order.closed": {
      requireOpen(s);
      const receiptNo = requireString(d.receiptNo, "receiptNo");
      const totals = computeTotals(s);
      if (!s.lines.some(isActiveLine)) throw fail("E_EMPTY", "nothing to close; void the order instead");
      if (totals.dueCentimes !== 0) throw fail("E_NOT_PAID", `order is not fully paid (due ${totals.dueCentimes})`);
      s.status = "closed";
      s.closedAt = ev.at;
      s.closedBy = ev.staff ?? null;
      s.receiptNo = receiptNo;
      break;
    }
    case "order.voided": {
      requireOpen(s);
      if (s.payments.some((p) => !p.voided)) throw fail("E_HAS_PAYMENTS", "void the payments first");
      if (s.lines.some((l) => isActiveLine(l) && l.sent && !l.held) && !d.approvedBy) {
        throw fail("E_APPROVAL_REQUIRED", "voiding an order with sent lines needs a manager's approval");
      }
      s.status = "voided";
      s.voidReason = typeof d.reason === "string" ? d.reason.slice(0, 200) : "";
      break;
    }
    case "order.transferred": {
      requireOpen(s);
      s.owner = requireString(d.toDevice, "toDevice");
      break;
    }
    case "order.taken_over": {
      requireOpen(s);
      if (ev.device === s.owner) throw fail("E_BAD_DATA", "the owner does not need to take over");
      if (!d.approvedBy) throw fail("E_APPROVAL_REQUIRED", "taking over another device's order needs a manager's approval");
      s.owner = ev.device;
      break;
    }
    case "order.customer_set": {
      requireOpen(s);
      const c = d.customerId ?? null;
      if (c !== null) requireString(c, "customerId");
      s.customerId = c;
      break;
    }
    case "lines.moved_out": {
      requireOpen(s);
      if (isRefund(s)) throw fail("E_BAD_DATA", "lines of a credit note do not move");
      requireString(d.moveId, "moveId");
      const to = requireString(d.toOrderId, "toOrderId");
      if (to === s.id) throw fail("E_BAD_DATA", "a line cannot move to its own order");
      if (!Array.isArray(d.lineIds) || d.lineIds.length === 0) throw fail("E_BAD_DATA", "lineIds required");
      if (new Set(d.lineIds).size !== d.lineIds.length) throw fail("E_BAD_DATA", "a line is listed twice");
      for (const id of d.lineIds) {
        const line = findHeldLine(s, id);
        if (line.voided) throw fail("E_LINE_VOIDED", `line ${id} is voided`);
        line.movedTo = to;
      }
      break;
    }
    case "lines.moved_in": {
      requireOpen(s);
      if (isRefund(s)) throw fail("E_BAD_DATA", "lines do not move into a credit note");
      requireString(d.moveId, "moveId");
      const from = requireString(d.fromOrderId, "fromOrderId");
      if (from === s.id) throw fail("E_BAD_DATA", "a line cannot move to its own order");
      if (!Array.isArray(d.lines) || d.lines.length === 0) throw fail("E_BAD_DATA", "lines required");
      for (const snap of d.lines) {
        const line = buildLine(snap ?? {}, false);
        if (s.lines.some((l) => l.lineId === line.lineId)) throw fail("E_DUP_LINE", `line ${line.lineId} already exists`);
        if (typeof snap.sent !== "boolean" || typeof snap.held !== "boolean") throw fail("E_BAD_DATA", "a moved line carries its sent and held state");
        if (snap.held && !snap.sent) throw fail("E_BAD_DATA", "a held line must be sent");
        for (const k of ["sentAt", "firedAt"]) {
          const v = snap[k] ?? null;
          if (v !== null && !Number.isSafeInteger(v)) throw fail("E_BAD_DATA", `${k} must be Unix ms or null`);
        }
        line.sent = snap.sent;
        line.sentAt = snap.sent ? snap.sentAt ?? null : null;
        line.held = snap.held;
        line.firedAt = snap.sent && !snap.held ? snap.firedAt ?? null : null;
        line.movedFrom = from;
        s.lines.push(line);
      }
      break;
    }
    default:
      throw fail("E_BAD_EVENT", `unhandled type ${ev.type}`);
  }

  s.seq = ev.seq;
  s.eventIds.push(ev.id);
  s.updatedAt = ev.at;
  s.totals = computeTotals(s);
  checkPaidWithinTotal(s);
  return s;
}

/**
 * Rebuild an order from its events (any order; sorted by seq here).
 * @param {OrderEvent[]} events
 * @returns {OrderState}
 */
export function foldOrder(events) {
  if (!events.length) throw fail("E_NOT_OPENED", "no events");
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  /** @type {OrderState | null} */
  let s = null;
  for (const ev of sorted) s = applyOrderEvent(s, ev);
  return /** @type {OrderState} */ (s);
}

/**
 * Coffee doses sold by a closed order (for the dose counter).
 * @param {OrderState} s
 */
export function dosesSold(s) {
  if (s.status !== "closed") return 0;
  return s.lines.filter((l) => isActiveLine(l) && l.doses > 0).reduce((acc, l) => acc + divRound(l.doses * l.qtyMilli, 1000), 0);
}

/**
 * Amounts by tender for the active payments of an order.
 * @param {OrderState} s
 * @returns {Record<string, number>}
 */
export function paymentsByTender(s) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const p of s.payments) {
    if (p.voided) continue;
    out[p.tender] = (out[p.tender] ?? 0) + p.amountCentimes;
  }
  return out;
}
