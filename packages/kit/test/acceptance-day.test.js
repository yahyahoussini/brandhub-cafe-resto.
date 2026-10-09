// @ts-check
/**
 * The café acceptance day of docs/01 §6, built event by event through the kit (prompt 03): the tablet, the Station and
 * the cloud fold the same events into the same numbers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDay } from "../src/reports.js";
import { formatAmount } from "../src/money.js";
import { zonedToUtc } from "../src/timezone.js";
import { eventLog, newId, seeded } from "./helpers.js";

const DAY = "2026-11-30";
/** @param {number} h @param {number} m */
const at = (h, m = 0) => zonedToUtc(2026, 11, 30, h, m);

const TILL = newId("dev");
const PHONE = newId("dev");
const SARA = newId("stf"); // cashier
const ALI = newId("stf"); // waiter
const KARIM = newId("stf"); // manager
const MACHINE = newId("mch");
const TILL_BANK = newId("bnk");
const ALI_BANK = newId("bnk");

/** Demo products of docs/01 §6 (prices "not a recommendation"), all at 10 % VAT. */
const P = {
  cafeNoir: { productId: newId("prd"), name: { fr: "Café noir", ar: "قهوة سوداء" }, unitCentimes: 1000, vatBp: 1000, doses: 1 },
  nssNss: { productId: newId("prd"), name: { fr: "Nss nss", ar: "نص نص" }, unitCentimes: 1000, vatBp: 1000, doses: 1 },
  cafeCreme: { productId: newId("prd"), name: { fr: "Café crème", ar: "قهوة بالحليب" }, unitCentimes: 1200, vatBp: 1000, doses: 1 },
  the: { productId: newId("prd"), name: { fr: "Thé à la menthe (verre)", ar: "أتاي بالنعناع (كأس)" }, unitCentimes: 800, vatBp: 1000, doses: 0 },
  jus: { productId: newId("prd"), name: { fr: "Jus d'orange pressé", ar: "عصير البرتقال" }, unitCentimes: 1500, vatBp: 1000, doses: 0 },
  msemen: { productId: newId("prd"), name: { fr: "Msemen", ar: "مسمن" }, unitCentimes: 500, vatBp: 1000, doses: 0 },
};

/**
 * @param {ReturnType<typeof eventLog>} log
 * @param {{ device: string, staff: string, bank: string, when: number, mode?: string, tableId?: string,
 *   lines: [keyof typeof P, number][], send?: boolean, pay?: { tender: string, amount: number, tendered?: number, reference?: string },
 *   receiptNo?: string }} o
 */
function sale(log, o) {
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

function acceptanceDay() {
  const log = eventLog({ [TILL]: "till", [PHONE]: "phone" });
  const till = (/** @type {string | null} */ staff, /** @type {string} */ type, /** @type {string} */ entity, /** @type {any} */ data, /** @type {number} */ when) =>
    log.emit({ device: TILL, staff, type, entity, data, at: when });

  // 1. 07:00 Karim opens the day; Sara opens the till bank with a 500,00 float; dose counter 18 400.
  till(SARA, "bank.opened", TILL_BANK, { kind: "till", holder: SARA, floatCentimes: 50000 }, at(7, 0));
  till(KARIM, "machine.reading", MACHINE, { reading: 18400, kind: "open", businessDate: DAY }, at(7, 1));

  // 2. Counter tickets.
  sale(log, { device: TILL, staff: SARA, bank: TILL_BANK, when: at(8, 0), lines: [["cafeNoir", 2], ["msemen", 1]], pay: { tender: "cash", amount: 2500, tendered: 5000 }, receiptNo: "C1-000001" });
  sale(log, { device: TILL, staff: SARA, bank: TILL_BANK, when: at(9, 0), lines: [["jus", 1], ["cafeCreme", 1]], pay: { tender: "card_external", amount: 2700, reference: "1234" }, receiptNo: "C1-000002" });
  sale(log, { device: TILL, staff: SARA, bank: TILL_BANK, when: at(10, 0), lines: [["the", 3]], pay: { tender: "maroc_pay", amount: 2400, reference: "MP-5521" }, receiptNo: "C1-000003" });

  // 3. Terrasse: Ali's waiter bank (float 0), table T4 sent to the bar, paid cash on his phone, S1-000001.
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
  till(KARIM, "machine.reading", MACHINE, { reading: 18408, kind: "close", businessDate: DAY }, at(15, 10));
  till(SARA, "machine.off_till", MACHINE, { doses: 1, reason: "test" }, at(15, 11));
  return log.events;
}

test("café acceptance day (docs/01 §6): the Z numbers", (t) => {
  const events = acceptanceDay();
  const r = buildDay(events, { businessDate: DAY });
  const sara = r.banks.find((b) => b.id === TILL_BANK);
  const ali = r.banks.find((b) => b.id === ALI_BANK);
  const dh = (/** @type {number | null} */ c) => (c === null ? "—" : formatAmount(c));
  t.diagnostic(`events ${events.length}`);
  t.diagnostic(`tickets ${r.tickets.count} · revenue ${dh(r.revenueCentimes)} TTC · VAT ${dh(r.vatCentimes)} · net ${dh(r.netCentimes)}`);
  t.diagnostic(`cash ${dh(r.tenders.cash)} · card ${dh(r.tenders.card_external)} (${r.cardSlips} slip) · Maroc Pay ${dh(r.tenders.maroc_pay)} · average ${dh(r.averageTicketCentimes)}`);
  t.diagnostic(`Sara expected ${dh(sara?.expectedCentimes ?? null)} counted ${dh(sara?.countedCentimes ?? null)} gap ${dh(sara?.gapCentimes ?? null)} (${sara?.gapState}) · Ali gap ${dh(ali?.gapCentimes ?? null)} (${ali?.gapState})`);
  t.diagnostic(`voids after send ${r.voids.linesAfterSend.count} (${dh(r.voids.linesAfterSend.totalCentimes)}) · voided orders ${r.voids.orders.count}, without number ${r.voids.orders.withoutNumber} · openings without sale ${r.noSales}`);
  t.diagnostic(`doses: machine ${r.doses.machineDoses}, sold ${r.doses.sold} + declared ${r.doses.offTill}, gap ${r.doses.gapDoses} ≈ ${dh(r.doses.gapCentimes)} at ${dh(r.doses.avgDoseCentimes)} per dose, above threshold ${r.doses.aboveThreshold}`);
  t.diagnostic(`series ${JSON.stringify(r.tickets.series)}`);

  assert.equal(r.tickets.count, 4);
  assert.equal(r.revenueCentimes, 10600);
  assert.equal(r.vatCentimes, 963);
  assert.deepEqual(r.vat, [{ rateBp: 1000, ttcCentimes: 10600, vatCentimes: 963, baseCentimes: 9637 }]);
  assert.equal(r.tenders.cash, 5500);
  assert.equal(r.tenders.card_external, 2700);
  assert.equal(r.tenders.maroc_pay, 2400);
  assert.equal(r.averageTicketCentimes, 2650);
  assert.equal(sara?.gapCentimes, -500);
  assert.equal(sara?.expectedCentimes, 52500);
  assert.equal(ali?.gapCentimes, 0);
  assert.equal(r.voids.linesAfterSend.count, 1);
  assert.equal(r.voids.orders.count, 1);
  assert.equal(r.voids.orders.withoutNumber, 1);
  assert.equal(r.noSales, 1);
  assert.equal(r.doses.machineDoses, 8);
  assert.equal(r.doses.sold, 5);
  assert.equal(r.doses.offTill, 1);
  assert.equal(r.doses.gapDoses, 2);
  assert.equal(r.doses.avgDoseCentimes, 1040);
  assert.equal(r.doses.gapCentimes, 2080);
  assert.equal(r.doses.aboveThreshold, false);
  assert.deepEqual(r.tickets.series, {
    C1: { first: "C1-000001", last: "C1-000003", count: 3 },
    S1: { first: "S1-000001", last: "S1-000001", count: 1 },
  });
});

test("rebuilding the day from its events in any order gives the same report", () => {
  const events = acceptanceDay();
  const reference = buildDay(events, { businessDate: DAY });
  const rng = seeded(20261130);
  for (let i = 0; i < 25; i++) assert.deepEqual(buildDay(rng.shuffle(events), { businessDate: DAY }), reference, `shuffle ${i}`);
});

test("merging two tables with lines.moved_out / moved_in keeps the day's totals and adds no void", () => {
  const log = eventLog({ [PHONE]: "phone" });
  log.emit({ device: PHONE, staff: ALI, type: "bank.opened", entity: ALI_BANK, data: { kind: "waiter", holder: ALI, floatCentimes: 0 }, at: at(9) });
  const t2 = sale(log, { device: PHONE, staff: ALI, bank: ALI_BANK, when: at(10), mode: "table", tableId: newId("tbl"), lines: [["cafeNoir", 2], ["jus", 1]], send: true });
  const t4 = sale(log, { device: PHONE, staff: ALI, bank: ALI_BANK, when: at(10, 5), mode: "table", tableId: newId("tbl"), lines: [["the", 1]], send: true });
  const moveId = newId("lin");
  t2.e("lines.moved_out", { moveId, toOrderId: t4.id, lineIds: t2.lineIds });
  t4.e("lines.moved_in", {
    moveId,
    fromOrderId: t2.id,
    lines: t2.lineIds.map((lineId, i) => {
      const [p, qty] = /** @type {const} */ ([["cafeNoir", 2], ["jus", 1]])[i];
      return { lineId, ...P[p], qtyMilli: qty * 1000, sent: true, held: false, sentAt: at(10), firedAt: at(10) };
    }),
  });
  t2.e("order.voided", { reason: "merged" }); // emptied by the move: no line to cook, no approval
  t4.e("payment.added", { paymentId: newId("pay"), tender: "cash", amountCentimes: 4300, tenderedCentimes: 5000, bankId: ALI_BANK });
  t4.e("order.closed", { receiptNo: "S1-000002" });

  const r = buildDay(log.events, { businessDate: DAY });
  assert.equal(r.revenueCentimes, 2000 + 1500 + 800);
  assert.equal(r.tickets.count, 1);
  assert.equal(r.voids.linesAfterSend.count, 0);
  assert.equal(r.voids.orders.count, 0, "an order emptied by a move is not a void");
  assert.equal(r.voids.orders.merged, 1);
  assert.equal(r.doses.sold, 2);
});
