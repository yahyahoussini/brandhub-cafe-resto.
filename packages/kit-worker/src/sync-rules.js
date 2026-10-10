// @ts-check
/**
 * The rules of docs/04 §2 (push) and §3 (pull) as the TenantStore applies them. Pure: they read the store through a
 * `Reader` (the projections, or anything with the same methods) and write nothing, so the node:test suite runs them
 * on `node:sqlite`, and the store keeps the async hashing and the one transaction (tenant-store.js).
 *
 * A pushed batch is handled one event at a time, in the device's order:
 * 1. duplicates (an id already stored, or twice in the batch) are acknowledged, never stored twice; a later copy of an
 *    id refused earlier in the batch is not decided again (the id is rejected once), and a move counts each id once;
 * 2. the envelope (`validateEnvelope`);
 * 3. a sequenced aggregate whose earlier event was refused in this batch refuses the rest (E_SEQ_BLOCKED);
 * 4. the device and the staff belong to the client: a paired device of the directory (`device.set`, E_UNKNOWN_DEVICE)
 *    not revoked before the event (E_DEVICE_REVOKED), a staff member (`staff.set`) or an owner account (own_…)
 *    (E_UNKNOWN_STAFF); the back office writes as dev_cloud with its own_…, the cloud's system events have no staff;
 * 5. the event is signed by the caller, or the caller is the client's Station relaying it (`relayedBy`) (E_WRONG_DEVICE);
 * 6. the type is allowed for the writer's kind (`assertCanWrite`; a relayed event is checked against its device's kind);
 * 7. the kit rule of the aggregate: sequenced events through `applyOrderEvent`/`applyBankEvent` against the current
 *    state (seq must follow), movements through `validateMovement`, marks through `validateMark`;
 * 8. the cross-aggregate checks: `assertBankAccepts` for `payment.added`, `payment.voided` and cash `kredi.repaid`;
 *    a move is a `lines.moved_out` and a `lines.moved_in` of the same batch, kept or refused together
 *    (`assertMovePair`, E_MOVE_PAIR); a credit note never refunds more than what is left of its ticket
 *    (`assertRefundWithin`, E_REFUND_EXCEEDS); a receipt number and a payment id are used once (E_DUP_RECEIPT,
 *    E_DUP_PAYMENT); a till or a phone closes orders only in its own series (`T` + prefix for a TEST order) and only
 *    when it has a prefix (E_BAD_DATA).
 * Accepted events carry `recvAt`, `relayedBy` and `clockSkew` (docs/04 §6); the store then gives them `pos` and hashes.
 */
import { BANK_EVENT_TYPES, assertBankAccepts } from "@brandhub/kit/bank";
import {
  CLOUD_DEVICE,
  DEVICE_KINDS,
  EVENT_TYPES,
  EventError,
  assertCanWrite,
  compareEvents,
  typeInfo,
  validateEnvelope,
  validateMovement,
} from "@brandhub/kit/events";
import { isEntityId } from "@brandhub/kit/ids";
import { validateMark } from "@brandhub/kit/marks";
import { ORDER_EVENT_TYPES, OrderRuleError, assertMovePair, assertRefundWithin } from "@brandhub/kit/order";
import { RECEIPT_NO, reduce } from "./projections.js";

/** @typedef {import("@brandhub/kit/events").EventEnvelope} EventEnvelope */
/** @typedef {import("@brandhub/kit/events").DeviceKind} DeviceKind */
/** @typedef {import("@brandhub/kit/order").OrderState} OrderState */
/** @typedef {import("@brandhub/kit/bank").BankState} BankState */
/** @typedef {import("./projections.js").ReceivedEvent} ReceivedEvent */

/** docs/04 §2: at most 200 events and 512 KB per push. */
export const MAX_BATCH_EVENTS = 200;
export const MAX_BATCH_BYTES = 512 * 1024;
/** docs/04 §6: an event more than 5 minutes ahead of the server is flagged. */
export const CLOCK_SKEW_MS = 5 * 60_000;
/** docs/04 §3: at most 500 events per pull. */
export const MAX_PULL = 500;
/** Paired devices (they write as their own dev_…). */
export const PAIRED_KINDS = Object.freeze(/** @type {const} */ (["till", "phone", "screen", "station"]));
/** Devices that sell (own orders and banks). */
const SALE_KINDS = ["till", "phone"];

/**
 * Who pushes a batch, as the Worker's authentication found it: a paired device (`dev_…` and its kind), the back office
 * or the cloud (`dev_cloud`). `relaying`: a Station pushing its devices' events (docs/04 §7).
 * @typedef {{ device: string, kind: DeviceKind, relaying?: boolean }} Caller
 */

/**
 * A whole batch refused before any event is looked at (too large); nothing is stored or dead-lettered, the caller
 * splits it and pushes again. The Worker answers 413 with the code.
 */
export class BatchError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "BatchError";
    this.code = code;
  }
}

/**
 * The caller of a push or a pull. A malformed caller is a bug of the Worker, not of the device: it throws.
 * @param {unknown} input
 * @returns {Caller}
 */
export function checkCaller(input) {
  const c = /** @type {Record<string, unknown>} */ (input ?? {});
  const kind = /** @type {DeviceKind} */ (c.kind);
  if (!DEVICE_KINDS.includes(kind)) throw new TypeError(`caller.kind must be one of ${DEVICE_KINDS.join(", ")}`);
  const cloudSide = kind === "office" || kind === "cloud";
  if (cloudSide ? c.device !== CLOUD_DEVICE : !isEntityId(c.device, "dev")) {
    throw new TypeError(cloudSide ? `a ${kind} caller is ${CLOUD_DEVICE}` : "a paired caller is its dev_… id");
  }
  if (c.relaying !== undefined && typeof c.relaying !== "boolean")
    throw new TypeError("caller.relaying must be true or false");
  if (c.relaying && kind !== "station") throw new TypeError("only a Station relays");
  return { device: /** @type {string} */ (c.device), kind, relaying: c.relaying === true };
}

/**
 * docs/04 §2 limits on a whole batch.
 * @param {unknown} events
 * @returns {unknown[]}
 */
export function checkBatch(events) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  if (events.length > MAX_BATCH_EVENTS)
    throw new BatchError("E_TOO_LARGE", `${events.length} events; a push carries at most ${MAX_BATCH_EVENTS}`);
  let bytes;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(events)).length;
  } catch {
    bytes = Infinity;
  }
  if (bytes > MAX_BATCH_BYTES) throw new BatchError("E_TOO_LARGE", `the batch is over ${MAX_BATCH_BYTES} bytes`);
  return events;
}

/**
 * docs/04 §6: 1 when the device's clock is more than 5 minutes ahead of the server or it wrote the event while its
 * trusted clock saw a clock set back (`data.clock: "rolled_back"`).
 * @param {EventEnvelope} ev
 * @param {number} recvAt
 * @returns {0 | 1}
 */
export function clockSkewOf(ev, recvAt) {
  return ev.at > recvAt + CLOCK_SKEW_MS || ev.data.clock === "rolled_back" ? 1 : 0;
}

/**
 * What the push rules read from the store.
 * @typedef {object} Reader
 * @property {(id: string) => boolean} hasEvent
 * @property {(id: string) => OrderState | null} order
 * @property {(id: string) => BankState | null} bank
 * @property {(ticketId: string) => OrderState[]} creditNotesOf
 * @property {(receiptNo: string) => string | null} receiptOwner
 * @property {(paymentId: string) => string | null} paymentOrder
 * @property {(id: string) => { kind: string | null, prefix: string | null, at: number, writer: string, eventId: string } | null} device
 * @property {(id: string) => number | null} revokedAt
 * @property {(id: string) => boolean} staffKnown
 * @property {(id: string) => boolean} ownerKnown
 */

/**
 * The store as the batch has changed it so far (nothing is written before the whole batch is decided).
 */
class Working {
  /** @param {Reader} reader */
  constructor(reader) {
    this.reader = reader;
    /** @type {Map<string, OrderState | null>} */
    this.orders = new Map();
    /** @type {Map<string, BankState | null>} */
    this.banks = new Map();
    /** @type {Map<string, { kind: string | null, prefix: string | null, at: number, writer: string, eventId: string }>} */
    this.devices = new Map();
    /** @type {Set<string>} */
    this.staff = new Set();
    /** @type {Map<string, string>} receipt number → order */
    this.receipts = new Map();
    /** @type {Map<string, string>} payment id → order */
    this.payments = new Map();
  }

  /** @param {string} id */
  order(id) {
    if (!this.orders.has(id)) this.orders.set(id, this.reader.order(id));
    return this.orders.get(id) ?? null;
  }

  /** @param {OrderState} s */
  setOrder(s) {
    this.orders.set(s.id, s);
    if (s.receiptNo !== null) this.receipts.set(s.receiptNo, s.id);
    for (const p of s.payments) this.payments.set(p.paymentId, s.id);
  }

  /** @param {string} id */
  bank(id) {
    if (!this.banks.has(id)) this.banks.set(id, this.reader.bank(id));
    return this.banks.get(id) ?? null;
  }

  /** @param {BankState} b */
  setBank(b) {
    this.banks.set(b.id, b);
  }

  /** @param {string} ticketId */
  creditNotesOf(ticketId) {
    /** @type {Map<string, OrderState>} */
    const notes = new Map(this.reader.creditNotesOf(ticketId).map((o) => [o.id, o]));
    for (const o of this.orders.values()) if (o && o.refundOf?.orderId === ticketId) notes.set(o.id, o);
    return [...notes.values()];
  }

  /** @param {string} receiptNo */
  receiptOwner(receiptNo) {
    return this.receipts.get(receiptNo) ?? this.reader.receiptOwner(receiptNo);
  }

  /** @param {string} paymentId */
  paymentOrder(paymentId) {
    return this.payments.get(paymentId) ?? this.reader.paymentOrder(paymentId);
  }

  /** @param {string} id */
  device(id) {
    return this.devices.get(id) ?? this.reader.device(id);
  }

  /** A `device.set` of the batch, if it wins (marks.js). @param {EventEnvelope} ev */
  deviceSet(ev) {
    const cur = this.device(ev.entity);
    if (cur && compareEvents({ at: cur.at, device: cur.writer, id: cur.eventId }, ev) >= 0) return;
    const d = ev.data;
    this.devices.set(ev.entity, {
      kind: typeof d.kind === "string" ? d.kind : null,
      prefix: typeof d.prefix === "string" ? d.prefix : null,
      at: ev.at,
      writer: ev.device,
      eventId: ev.id,
    });
  }

  /** @param {string} id */
  staffKnown(id) {
    return this.staff.has(id) || this.reader.staffKnown(id);
  }
}

/**
 * Runs a kit rule on event data: a malformed payload that slips past the kit's own checks (a TypeError or a
 * RangeError) refuses the event with E_BAD_DATA instead of failing the whole batch (docs/03 §9: never an uncoded error).
 * @template T
 * @param {() => T} f
 * @returns {T}
 */
function rule(f) {
  try {
    return f();
  } catch (e) {
    if (e instanceof TypeError || e instanceof RangeError) throw new EventError("E_BAD_DATA", e.message);
    throw e;
  }
}

/** @param {unknown} e @returns {e is Error & { code: string }} */
function isCoded(e) {
  return (
    e instanceof Error &&
    typeof (/** @type {any} */ (e).code) === "string" &&
    /^E_[A-Z_]+$/.test(/** @type {any} */ (e).code)
  );
}

/**
 * One pushed event as received: its JSON form (what is validated, hashed and stored), or why it is not JSON.
 * @typedef {{ id: string | null, value: Record<string, any> | null, error: EventError | null }} Item
 */

/**
 * @param {unknown} raw
 * @returns {Item}
 */
function item(raw) {
  const id =
    raw && typeof raw === "object" && typeof (/** @type {any} */ (raw).id) === "string"
      ? /** @type {string} */ (/** @type {any} */ (raw).id)
      : null;
  try {
    const value = JSON.parse(JSON.stringify(raw));
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { id, value: null, error: new EventError("E_BAD_EVENT", "event must be an object") };
    return { id, value, error: null };
  } catch {
    return { id, value: null, error: new EventError("E_BAD_EVENT", "event must be JSON") };
  }
}

/**
 * @typedef {object} Decision
 * @property {{ event: ReceivedEvent, state: OrderState | BankState | null }[]} accepted in order, before pos and hashes
 * @property {string[]} duplicates
 * @property {{ id: string | null, code: string, message: string, device: string, event: Record<string, any> | null }[]} rejected
 */

/**
 * Decides a batch (docs/04 §2). A move whose two events do not both pass is refused whole: the batch is decided again
 * with its first half refused (E_MOVE_PAIR), until every kept move is complete.
 * @param {unknown[]} events checked with checkBatch
 * @param {Caller} caller checked with checkCaller
 * @param {{ reader: Reader, recvAt: number, tenantId?: string | null }} o
 * @returns {Decision}
 */
export function decideBatch(events, caller, o) {
  const items = events.map(item);
  /** @type {Map<string, string>} */
  const forced = new Map();
  for (;;) {
    const run = decideOnce(items, caller, o, forced);
    if (run.broken.size === 0) return run.decision;
    for (const [id, message] of run.broken) forced.set(id, message);
  }
}

/**
 * @param {Item[]} items
 * @param {Caller} caller
 * @param {{ reader: Reader, recvAt: number, tenantId?: string | null }} o
 * @param {Map<string, string>} forced moved_out events refused because their pair was not kept
 */
function decideOnce(items, caller, { reader, recvAt, tenantId = null }, forced) {
  const w = new Working(reader);
  /** @type {Decision} */
  const decision = { accepted: [], duplicates: [], rejected: [] };
  /** @type {Set<string>} ids accepted or acknowledged in this batch */
  const seen = new Set();
  /** @type {Set<string>} */
  const refusedIds = new Set();
  /** @type {Set<string>} sequenced aggregates with a refused event in this batch */
  const blocked = new Set();
  /** @type {Map<string, { outs: Record<string, any>[], ins: Record<string, any>[] }>} the batch's moves by moveId */
  const moves = new Map();
  /** @type {Set<string>} ids met while listing the moves: a repeated or stored id is a duplicate, not a second event */
  const listed = new Set();
  for (const it of items) {
    if (it.id !== null && (listed.has(it.id) || reader.hasEvent(it.id))) continue;
    if (it.id !== null) listed.add(it.id);
    const v = it.value;
    if (!v || (v.type !== "lines.moved_out" && v.type !== "lines.moved_in") || typeof v.data?.moveId !== "string")
      continue;
    const g = moves.get(v.data.moveId) ?? { outs: [], ins: [] };
    (v.type === "lines.moved_out" ? g.outs : g.ins).push(v);
    moves.set(v.data.moveId, g);
  }
  /** @type {Map<string, EventEnvelope>} moveId → its accepted lines.moved_out */
  const movedOut = new Map();

  for (const it of items) {
    if (it.id !== null && (seen.has(it.id) || reader.hasEvent(it.id))) {
      decision.duplicates.push(it.id);
      seen.add(it.id);
      continue;
    }
    // A later copy of an id refused earlier in this batch is settled by that refusal: never decided (or stored) again.
    if (it.id !== null && refusedIds.has(it.id)) continue;
    try {
      if (it.error) throw it.error;
      const ev = rule(() => validateEnvelope(it.value));
      const info = typeInfo(ev.type);
      if (info.kind === "sequenced" && blocked.has(ev.entity)) {
        throw new EventError("E_SEQ_BLOCKED", `an earlier event of ${ev.entity} was refused in this batch`);
      }
      if (tenantId && ev.entity.startsWith("tnt_") && ev.entity !== tenantId)
        throw new EventError("E_ENTITY", "the event names another client");
      const clockSkew = clockSkewOf(ev, recvAt);
      const { kind, relayedBy } = writer(ev, caller, w, clockSkew);
      rule(() => assertCanWrite(ev, kind));
      const forcedMessage = forced.get(ev.id);
      if (forcedMessage !== undefined) throw new OrderRuleError("E_MOVE_PAIR", forcedMessage);

      /** @type {OrderState | BankState | null} */
      let state = null;
      if (info.kind === "sequenced") {
        state = sequenced(ev, w, { moves, movedOut, refusedIds });
      } else if (info.kind === "movement") {
        rule(() => validateMovement(ev));
        if (ev.type === "kredi.repaid" && ev.data.tender === "cash")
          rule(() => assertBankAccepts(w.bank(ev.data.bankId), ev.device));
      } else {
        rule(() => validateMark(ev));
        if (ev.type === "device.set") w.deviceSet(ev);
        if (ev.type === "staff.set") w.staff.add(ev.entity);
      }
      decision.accepted.push({ event: { ...ev, recvAt, relayedBy, clockSkew }, state });
      seen.add(ev.id);
    } catch (e) {
      if (!isCoded(e)) throw e;
      const v = it.value;
      decision.rejected.push({
        id: it.id,
        code: e.code,
        message: e.message,
        device: typeof v?.device === "string" ? v.device : caller.device,
        event: v,
      });
      if (it.id !== null) refusedIds.add(it.id);
      const type = typeof v?.type === "string" && Object.hasOwn(EVENT_TYPES, v.type) ? EVENT_TYPES[v.type] : null;
      if (type?.kind === "sequenced" && typeof v?.entity === "string") blocked.add(v.entity);
    }
  }

  // A kept lines.moved_out whose lines.moved_in was not kept breaks the pair: refuse it and decide again.
  /** @type {Map<string, string>} */
  const broken = new Map();
  const keptIds = new Set([...decision.accepted.map((a) => a.event.id), ...decision.duplicates]);
  for (const [moveId, out] of movedOut) {
    const inn = moves.get(moveId)?.ins[0];
    if (!inn || !keptIds.has(inn.id))
      broken.set(out.id, `the lines.moved_in of move ${moveId} was refused, so the move is refused whole`);
  }
  return { decision, broken };
}

/**
 * Steps 4–5: the writer belongs to the client and signs as the caller (or is relayed by the client's Station).
 * @param {EventEnvelope} ev
 * @param {Caller} caller
 * @param {Working} w
 * @param {0 | 1} clockSkew
 * @returns {{ kind: DeviceKind, relayedBy: string | null }}
 */
function writer(ev, caller, w, clockSkew) {
  if (caller.kind === "office" || caller.kind === "cloud") {
    if (ev.device !== CLOUD_DEVICE)
      throw new EventError("E_WRONG_DEVICE", `${caller.kind} events are written as ${CLOUD_DEVICE}`);
    checkStaff(ev, w);
    return { kind: caller.kind, relayedBy: null };
  }
  /** @type {string | null} */
  let relayedBy = null;
  if (ev.device !== caller.device) {
    if (!caller.relaying)
      throw new EventError("E_WRONG_DEVICE", `the event is signed by ${ev.device}, not by the caller`);
    const station = w.device(caller.device);
    if (!station || station.kind !== "station")
      throw new EventError("E_UNKNOWN_DEVICE", "the relaying Station is not a device of this client");
    if (w.reader.revokedAt(caller.device) !== null)
      throw new EventError("E_DEVICE_REVOKED", "the relaying Station is revoked");
    relayedBy = caller.device;
  }
  if (ev.device === CLOUD_DEVICE)
    throw new EventError("E_WRONG_DEVICE", `a paired device never writes as ${CLOUD_DEVICE}`);
  const dev = w.device(ev.device);
  if (!dev || !PAIRED_KINDS.includes(/** @type {any} */ (dev.kind)))
    throw new EventError("E_UNKNOWN_DEVICE", `${ev.device} is not a device of this client`);
  if (relayedBy === null && dev.kind !== caller.kind)
    throw new EventError("E_WRONG_DEVICE", `${ev.device} is a ${dev.kind}, not a ${caller.kind}`);
  // docs/04 §9: events written before the revocation are kept; later ones (or ones whose time cannot be trusted) are not.
  const revokedAt = w.reader.revokedAt(ev.device);
  if (revokedAt !== null && (ev.at >= revokedAt || clockSkew === 1))
    throw new EventError("E_DEVICE_REVOKED", `${ev.device} was revoked`);
  checkStaff(ev, w);
  return { kind: /** @type {DeviceKind} */ (dev.kind), relayedBy };
}

/**
 * @param {EventEnvelope} ev
 * @param {Working} w
 */
function checkStaff(ev, w) {
  if (ev.staff === null) return;
  const known = isEntityId(ev.staff, "own") ? w.reader.ownerKnown(ev.staff) : w.staffKnown(ev.staff);
  if (!known) throw new EventError("E_UNKNOWN_STAFF", `${ev.staff} is not a member of this client`);
}

/**
 * Steps 7–8 for an order or a bank. Returns the aggregate's new state.
 * @param {EventEnvelope} ev
 * @param {Working} w
 * @param {{ moves: Map<string, { outs: Record<string, any>[], ins: Record<string, any>[] }>, movedOut: Map<string, EventEnvelope>, refusedIds: Set<string> }} batch
 * @returns {OrderState | BankState}
 */
function sequenced(ev, w, batch) {
  if (BANK_EVENT_TYPES.includes(ev.type)) {
    const next = /** @type {BankState} */ (rule(() => reduce(ev, w.bank(ev.entity))));
    w.setBank(next);
    return next;
  }
  if (!ORDER_EVENT_TYPES.includes(ev.type))
    throw new EventError("E_BAD_EVENT", `${ev.type}: tip pools are handled from V1.1 (prompt 21)`);
  const prev = w.order(ev.entity);
  const next = /** @type {OrderState} */ (rule(() => reduce(ev, prev)));
  const d = ev.data;
  switch (ev.type) {
    case "payment.added": {
      const holder = w.paymentOrder(d.paymentId);
      if (holder !== null && holder !== ev.entity)
        throw new OrderRuleError("E_DUP_PAYMENT", `payment ${d.paymentId} belongs to another order`);
      rule(() => assertBankAccepts(w.bank(d.bankId), ev.device));
      break;
    }
    case "payment.voided": {
      const p = /** @type {OrderState} */ (prev).payments.find((x) => x.paymentId === d.paymentId);
      rule(() => assertBankAccepts(p ? w.bank(p.bankId) : null, ev.device));
      break;
    }
    case "order.closed": {
      const no = /** @type {string} */ (next.receiptNo);
      const holder = w.receiptOwner(no);
      if (holder !== null && holder !== ev.entity)
        throw new OrderRuleError("E_DUP_RECEIPT", `receipt ${no} was already used`);
      // docs/03 §7: every device that closes orders has a prefix; a TEST order takes the training series T + prefix.
      const prefix = w.device(ev.device)?.prefix;
      if (!prefix) throw new OrderRuleError("E_BAD_DATA", `${ev.device} has no receipt series`);
      const series = next.training ? `T${prefix}` : prefix;
      const m = RECEIPT_NO.exec(no);
      if (!m || m[1] !== series)
        throw new OrderRuleError("E_BAD_DATA", `receipt ${no} is not in the series ${series} of ${ev.device}`);
      break;
    }
    case "order.transferred": {
      const to = w.device(d.toDevice);
      if (!to || !SALE_KINDS.includes(/** @type {string} */ (to.kind)))
        throw new EventError("E_UNKNOWN_DEVICE", "an order is transferred to a till or a phone of this client");
      break;
    }
    case "lines.moved_out": {
      const g = batch.moves.get(d.moveId);
      if (!g || g.outs.length !== 1 || g.ins.length !== 1) {
        throw new OrderRuleError(
          "E_MOVE_PAIR",
          "a move is one lines.moved_out and one lines.moved_in pushed in the same batch",
        );
      }
      const inn = g.ins[0];
      if (batch.refusedIds.has(inn.id))
        throw new OrderRuleError("E_MOVE_PAIR", "the lines.moved_in of this move was refused");
      const target = w.order(d.toOrderId);
      rule(() =>
        assertMovePair(/** @type {any} */ (ev), /** @type {any} */ (inn), /** @type {OrderState} */ (prev), target),
      );
      batch.movedOut.set(d.moveId, ev);
      break;
    }
    case "lines.moved_in": {
      const out = batch.movedOut.get(d.moveId);
      if (!out || batch.moves.get(d.moveId)?.ins[0]?.id !== ev.id) {
        throw new OrderRuleError("E_MOVE_PAIR", "the lines.moved_out of this move is not kept in this batch");
      }
      break;
    }
    default:
      break;
  }
  if (next.refundOf !== null) {
    const ticketId = next.refundOf.orderId;
    rule(() => assertRefundWithin(w.order(ticketId), next, w.creditNotesOf(ticketId)));
  }
  w.setOrder(next);
  return next;
}

/** docs/04 §3: what each device kind receives. */
const MARK_TYPES = Object.freeze(Object.keys(EVENT_TYPES).filter((t) => EVENT_TYPES[t].kind === "mark"));
/** Events that end or hand over an order or a bank: sent to every till and phone, so a table frees up everywhere. */
const ENDINGS = Object.freeze([
  "order.closed",
  "order.voided",
  "order.transferred",
  "order.taken_over",
  "bank.closed",
  "bank.taken_over",
]);
const SCREEN_MARKS = Object.freeze([
  "kitchen.status",
  "catalog.product_availability",
  "catalog.product_set",
  "catalog.category_set",
  "settings.set",
  "device.set",
  "zone.set",
  "table.set",
]);
const SCREEN_ORDER_TYPES = Object.freeze([
  "order.opened",
  "line.added",
  "line.voided",
  "lines.sent",
  "lines.fired",
  "lines.moved_out",
  "lines.moved_in",
  "order.moved",
  "order.covers_set",
  "order.note_set",
]);
/** A kitchen or bar screen still gets the lines of an order closed this recently (a counter order is paid first). */
export const SCREEN_RECENT_MS = 6 * 60 * 60_000;

/**
 * @typedef {object} PullScope
 * @property {boolean} everything office, Station and cloud: the whole log
 * @property {readonly string[]} types sent whatever their aggregate
 * @property {readonly string[]} openOrderTypes sent while their order is open
 * @property {readonly string[]} openBankTypes sent while their bank is not closed
 * @property {readonly string[]} recentOrderTypes sent while their order is open or ended less than SCREEN_RECENT_MS ago
 */

/**
 * docs/04 §3: tills and phones get the catalog, settings, staff, layout, kitchen status, the open orders and banks and
 * how orders and banks end; screens get the sent lines and the kitchen status; the back office (and the Station, which
 * keeps every event of the last 7 days, and the cloud) gets everything.
 * @param {DeviceKind} kind
 * @returns {PullScope}
 */
export function pullScope(kind) {
  switch (kind) {
    case "office":
    case "station":
    case "cloud":
      return { everything: true, types: [], openOrderTypes: [], openBankTypes: [], recentOrderTypes: [] };
    case "till":
    case "phone":
      return {
        everything: false,
        types: [...MARK_TYPES, ...ENDINGS],
        openOrderTypes: ORDER_EVENT_TYPES,
        openBankTypes: BANK_EVENT_TYPES,
        recentOrderTypes: [],
      };
    case "screen":
      return {
        everything: false,
        types: [...SCREEN_MARKS, "order.closed", "order.voided"],
        openOrderTypes: [],
        openBankTypes: [],
        recentOrderTypes: SCREEN_ORDER_TYPES,
      };
    default:
      throw new TypeError(`unknown device kind ${kind}`);
  }
}
