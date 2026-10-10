// @ts-check
/**
 * Store test fixtures (node:test and the workerd specs): a venue with a till, a waiter phone, a bar screen and a
 * Station, three staff members and an owner account, and helpers that write envelopes the way devices do (UUIDv7 ids,
 * seq per sequenced entity). Test data only: names are the demo names of docs/01 §6.
 */
import { CLOUD_DEVICE, isSequenced } from "@brandhub/kit/events";
import { newId, uuidv7 } from "@brandhub/kit/ids";
import { localDate, zonedToUtc } from "@brandhub/kit/timezone";

/** @typedef {import("@brandhub/kit/events").EventEnvelope} EventEnvelope */
/** @typedef {import("../src/sync-rules.js").Caller} Caller */

/** Demo products of docs/01 §6 (test data, not prices), at 10 % VAT. */
export const PRODUCTS = Object.freeze({
  noir: {
    productId: "prd_0196f4c1-0000-7000-8000-000000000001",
    name: { fr: "Café noir", ar: "قهوة سوداء" },
    unitCentimes: 1000,
    vatBp: 1000,
    doses: 1,
    station: "bar",
  },
  creme: {
    productId: "prd_0196f4c1-0000-7000-8000-000000000002",
    name: { fr: "Café crème", ar: "قهوة بالحليب" },
    unitCentimes: 1200,
    vatBp: 1000,
    doses: 1,
    station: "bar",
  },
  the: {
    productId: "prd_0196f4c1-0000-7000-8000-000000000003",
    name: { fr: "Thé à la menthe", ar: "أتاي بالنعناع" },
    unitCentimes: 800,
    vatBp: 1000,
    doses: 0,
    station: "bar",
  },
  msemen: {
    productId: "prd_0196f4c1-0000-7000-8000-000000000004",
    name: { fr: "Msemen", ar: "مسمن" },
    unitCentimes: 500,
    vatBp: 1000,
    doses: 0,
    station: "cuisine",
  },
});

/**
 * The local date three days ago: the venue's business day is in the past, so its events are not ahead of the server's
 * clock (docs/04 §6 would flag them).
 * @returns {[number, number, number]}
 */
export function daysAgo(n = 3) {
  const [y, m, d] = localDate(Date.now() - n * 86_400_000)
    .split("-")
    .map(Number);
  return [y, m, d];
}

/**
 * @param {{ tenant?: string, day?: [number, number, number] }} [o] `day` is the local date of the business day
 */
export function venue(o = {}) {
  const [y, m, d] = o.day ?? daysAgo();
  /** The business day, "YYYY-MM-DD". */
  const businessDay = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const ids = {
    tenant: o.tenant ?? newId("tnt"),
    owner: newId("own"),
    till: newId("dev"),
    phone: newId("dev"),
    screen: newId("dev"),
    station: newId("dev"),
    sara: newId("stf"),
    ali: newId("stf"),
    karim: newId("stf"),
    drinks: newId("cat"),
    food: newId("cat"),
  };
  /** Local time of the business day (hours past 24 run into the night). @param {number} h @param {number} [min] */
  const at = (h, min = 0) => zonedToUtc(y, m, d, h, min);
  /** @type {Map<string, number>} */
  const seqs = new Map();
  let clock = at(6, 0);

  /**
   * An envelope with the next seq of its entity (or `seq` when given) and a fresh UUIDv7 id.
   * @param {{ device: string, staff: string | null, type: string, entity: string, data?: Record<string, any>, at?: number, seq?: number }} e
   * @returns {EventEnvelope}
   */
  function ev(e) {
    const when = e.at ?? (clock += 1000);
    if (when > clock) clock = when;
    /** @type {number | null} */
    let seq = null;
    if (isSequenced(e.type)) {
      seq = e.seq ?? (seqs.get(e.entity) ?? 0) + 1;
      seqs.set(e.entity, Math.max(seqs.get(e.entity) ?? 0, seq));
    }
    return {
      id: uuidv7(when),
      type: e.type,
      entity: e.entity,
      seq,
      device: e.device,
      staff: e.staff,
      at: when,
      data: e.data ?? {},
      v: 1,
    };
  }

  /** @param {string} type @param {string} entity @param {Record<string, any>} data @param {number} [when] */
  const office = (type, entity, data, when) =>
    ev({ device: CLOUD_DEVICE, staff: ids.owner, type, entity, data, at: when });

  /** @type {Record<string, Caller>} */
  const callers = {
    till: { device: ids.till, kind: "till" },
    phone: { device: ids.phone, kind: "phone" },
    screen: { device: ids.screen, kind: "screen" },
    station: { device: ids.station, kind: "station" },
    relay: { device: ids.station, kind: "station", relaying: true },
    office: { device: CLOUD_DEVICE, kind: "office" },
    cloud: { device: CLOUD_DEVICE, kind: "cloud" },
  };

  /** The back office's first batch: the devices, the staff and the two categories. */
  const setup = () => [
    office("device.set", ids.till, { name: "Caisse 1", kind: "till", prefix: "C1" }),
    office("device.set", ids.phone, { name: "Serveur 1", kind: "phone", prefix: "S1" }),
    office("device.set", ids.screen, { name: "Écran bar", kind: "screen", station: "bar" }),
    office("device.set", ids.station, { name: "Station", kind: "station" }),
    office("staff.set", ids.sara, { displayName: "Sara", role: "cashier", canApprove: false, active: true }),
    office("staff.set", ids.ali, { displayName: "Ali", role: "waiter", canApprove: false, active: true }),
    office("staff.set", ids.karim, { displayName: "Karim", role: "manager", canApprove: true, active: true }),
    office("catalog.category_set", ids.drinks, {
      name: { fr: "Boissons", ar: "مشروبات" },
      station: "bar",
      taxClass: "drink",
    }),
    office("catalog.category_set", ids.food, {
      name: { fr: "Cuisine", ar: "مطبخ" },
      station: "cuisine",
      taxClass: "food",
    }),
  ];

  /**
   * A sale's events, in the order the device writes them.
   * @param {{ device: string, staff: string, bank?: string, when?: number, mode?: string, tableId?: string,
   *   lines: [keyof typeof PRODUCTS, number][], send?: boolean, pay?: { tender: string, amount: number, tendered?: number, reference?: string },
   *   receiptNo?: string, orderId?: string, training?: boolean, refundOf?: { orderId: string, receiptNo: string, restock?: boolean } }} s
   */
  function sale(s) {
    const id = s.orderId ?? newId("ord");
    let t = s.when ?? clock + 1000;
    /** @param {string} type @param {Record<string, any>} data */
    const e = (type, data) => ev({ device: s.device, staff: s.staff, type, entity: id, data, at: (t += 1000) });
    const events = [
      e("order.opened", {
        mode: s.mode ?? "counter",
        tableId: s.tableId ?? null,
        ...(s.training ? { training: true } : {}),
        ...(s.refundOf ? { refundOf: s.refundOf, approvedBy: ids.karim } : {}),
      }),
    ];
    const lineIds = s.lines.map(([p, qty]) => {
      const lineId = newId("lin");
      const category = PRODUCTS[p].station === "bar" ? ids.drinks : ids.food;
      events.push(e("line.added", { lineId, ...PRODUCTS[p], category, qtyMilli: qty * 1000 }));
      return lineId;
    });
    if (s.send) events.push(e("lines.sent", { lineIds }));
    if (s.pay) {
      events.push(
        e("payment.added", {
          paymentId: newId("pay"),
          tender: s.pay.tender,
          amountCentimes: s.pay.amount,
          tenderedCentimes: s.pay.tendered ?? null,
          reference: s.pay.reference ?? null,
          bankId: s.bank,
        }),
      );
    }
    if (s.receiptNo) events.push(e("order.closed", { receiptNo: s.receiptNo }));
    return { id, lineIds, events, next: e };
  }

  return { ids, at, businessDay, ev, office, callers, setup, sale };
}
