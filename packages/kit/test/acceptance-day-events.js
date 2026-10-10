// @ts-check
/**
 * The café acceptance day of docs/01 §6, built event by event through the kit the way the devices write it (prompt 03).
 * Shared by acceptance-day.test.js (the kit's Z numbers) and kit-worker's workerd spec (the TenantStore's daily report
 * must equal the kit's over the same events). Test data only: names and prices are the demo values of docs/01 §6.
 */
import { zonedToUtc } from "../src/timezone.js";
import { eventLog, newId } from "./helpers.js";

/** The business day of the kit's acceptance test. */
export const ACCEPTANCE_DATE = "2026-11-30";

/** Demo products of docs/01 §6 (prices "not a recommendation"), all at 10 % VAT. */
export const P = {
  cafeNoir: { productId: newId("prd"), name: { fr: "Café noir", ar: "قهوة سوداء" }, unitCentimes: 1000, vatBp: 1000, doses: 1 },
  nssNss: { productId: newId("prd"), name: { fr: "Nss nss", ar: "نص نص" }, unitCentimes: 1000, vatBp: 1000, doses: 1 },
  cafeCreme: { productId: newId("prd"), name: { fr: "Café crème", ar: "قهوة بالحليب" }, unitCentimes: 1200, vatBp: 1000, doses: 1 },
  the: { productId: newId("prd"), name: { fr: "Thé à la menthe (verre)", ar: "أتاي بالنعناع (كأس)" }, unitCentimes: 800, vatBp: 1000, doses: 0 },
  jus: { productId: newId("prd"), name: { fr: "Jus d'orange pressé", ar: "عصير البرتقال" }, unitCentimes: 1500, vatBp: 1000, doses: 0 },
  msemen: { productId: newId("prd"), name: { fr: "Msemen", ar: "مسمن" }, unitCentimes: 500, vatBp: 1000, doses: 0 },
};

/**
 * A sale's events, in the order the device writes them.
 * @param {ReturnType<typeof eventLog>} log
 * @param {{ device: string, staff: string, bank: string, when: number, mode?: string, tableId?: string,
 *   lines: [keyof typeof P, number][], send?: boolean, pay?: { tender: string, amount: number, tendered?: number, reference?: string },
 *   receiptNo?: string }} o
 */
export function sale(log, o) {
  const id = newId("ord");
  let t = o.when;
  const e = (/** @type {string} */ type, /** @type {Record<string, any>} */ data) =>
    log.emit({ device: o.device, staff: o.staff, type, entity: id, data, at: (t += 1000) });
  e("order.opened", { mode: o.mode ?? "counter", tableId: o.tableId ?? null });
  const lineIds = o.lines.map(([p, qty]) => {
    const lineId = newId("lin");
    e("line.added", { lineId, ...P[p], qtyMilli: qty * 1000 });
    return lineId;
  });
  if (o.send) e("lines.sent", { lineIds });
  if (o.pay) {
    e("payment.added", {
      paymentId: newId("pay"),
      tender: o.pay.tender,
      amountCentimes: o.pay.amount,
      tenderedCentimes: o.pay.tendered ?? null,
      reference: o.pay.reference ?? null,
      bankId: o.bank,
    });
  }
  if (o.receiptNo) e("order.closed", { receiptNo: o.receiptNo });
  return { id, lineIds, e };
}

/**
 * The venue of the acceptance day (a till C1, Ali's phone S1, Sara, Ali, Karim, the coffee machine and two banks) with
 * fresh ids, and `events()`, which writes the whole day again with those ids (a new log each call).
 * @param {{ date?: string }} [o] the business day, "YYYY-MM-DD" (default ACCEPTANCE_DATE)
 */
export function cafeAcceptanceDay(o = {}) {
  const date = o.date ?? ACCEPTANCE_DATE;
  const [y, m, d] = date.split("-").map(Number);
  /** Local time of the business day. @param {number} h @param {number} [min] */
  const at = (h, min = 0) => zonedToUtc(y, m, d, h, min);
  const ids = {
    TILL: newId("dev"),
    PHONE: newId("dev"),
    SARA: newId("stf"), // cashier
    ALI: newId("stf"), // waiter
    KARIM: newId("stf"), // manager
    MACHINE: newId("mch"),
    TILL_BANK: newId("bnk"),
    ALI_BANK: newId("bnk"),
  };
  const { TILL, PHONE, SARA, ALI, KARIM, MACHINE, TILL_BANK, ALI_BANK } = ids;

  function events() {
    const log = eventLog({ [TILL]: "till", [PHONE]: "phone" });
    const till = (/** @type {string | null} */ staff, /** @type {string} */ type, /** @type {string} */ entity, /** @type {any} */ data, /** @type {number} */ when) =>
      log.emit({ device: TILL, staff, type, entity, data, at: when });

    // 1. 07:00 Karim opens the day; Sara opens the till bank with a 500,00 float; dose counter 18 400.
    till(SARA, "bank.opened", TILL_BANK, { kind: "till", holder: SARA, floatCentimes: 50000 }, at(7, 0));
    till(KARIM, "machine.reading", MACHINE, { reading: 18400, kind: "open", businessDate: date }, at(7, 1));

    // 2. Counter tickets.
    sale(log, { device: TILL, staff: SARA, bank: TILL_BANK, when: at(8, 0), lines: [["cafeNoir", 2], ["msemen", 1]], pay: { tender: "cash", amount: 2500, tendered: 5000 }, receiptNo: "C1-000001" });
    sale(log, { device: TILL, staff: SARA, bank: TILL_BANK, when: at(9, 0), lines: [["jus", 1], ["cafeCreme", 1]], pay: { tender: "card_external", amount: 2700, reference: "1234" }, receiptNo: "C1-000002" });
    sale(log, { device: TILL, staff: SARA, bank: TILL_BANK, when: at(10, 0), lines: [["the", 3]], pay: { tender: "maroc_pay", amount: 2400, reference: "MP-5521" }, receiptNo: "C1-000003" });

    // 3. Terrasse: Ali's waiter bank (float 0), table T4 sent to the bar, paid cash on Ali's phone, S1-000001.
    log.emit({ device: PHONE, staff: ALI, type: "bank.opened", entity: ALI_BANK, data: { kind: "waiter", holder: ALI, floatCentimes: 0 }, at: at(10, 30) });
    sale(log, { device: PHONE, staff: ALI, bank: ALI_BANK, when: at(11, 0), mode: "table", tableId: newId("tbl"), lines: [["nssNss", 2], ["msemen", 2]], send: true, pay: { tender: "cash", amount: 3000, tendered: 5000 }, receiptNo: "S1-000001" });

    // 4. Salle: table T2, 1 café noir sent, the customer leaves; Ali voids the line (Karim approves), then the order.
    const t2 = sale(log, { device: PHONE, staff: ALI, bank: ALI_BANK, when: at(12, 0), mode: "table", tableId: newId("tbl"), lines: [["cafeNoir", 1]], send: true });
    t2.e("line.voided", { lineId: t2.lineIds[0], reason: "customer_left", approvedBy: KARIM });
    t2.e("order.voided", { reason: "customer_left" });

    // 5. Sara opens the drawer without a sale for change; Karim approves.
    till(SARA, "bank.no_sale", TILL_BANK, { reason: "monnaie", approvedBy: KARIM }, at(13, 0));

    // 6. 15:00 Sara counts 520,00; Karim takes over Ali's bank at the till and counts 30,00; dose counter 18 408 and
    //    1 test dose declared.
    till(SARA, "bank.counted", TILL_BANK, { countedCentimes: 52000 }, at(15, 0));
    till(SARA, "bank.closed", TILL_BANK, {}, at(15, 1));
    till(KARIM, "bank.taken_over", ALI_BANK, { approvedBy: KARIM }, at(15, 5));
    till(KARIM, "bank.counted", ALI_BANK, { countedCentimes: 3000 }, at(15, 6));
    till(KARIM, "bank.closed", ALI_BANK, {}, at(15, 7));
    till(KARIM, "machine.reading", MACHINE, { reading: 18408, kind: "close", businessDate: date }, at(15, 10));
    till(SARA, "machine.off_till", MACHINE, { doses: 1, reason: "test" }, at(15, 11));
    return log.events;
  }

  return { date, at, ids, events };
}
