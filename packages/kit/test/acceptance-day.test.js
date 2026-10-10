// @ts-check
/**
 * The café acceptance day of docs/01 §6, built event by event through the kit (prompt 03): the tablet, the Station and
 * the cloud fold the same events into the same numbers. The events are built by acceptance-day-events.js.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDay } from "../src/reports.js";
import { formatAmount } from "../src/money.js";
import { eventLog, newId, seeded } from "./helpers.js";
import { P, cafeAcceptanceDay, sale } from "./acceptance-day-events.js";

// The day's events and venue live in acceptance-day-events.js, shared with kit-worker's TenantStore spec.
const day = cafeAcceptanceDay();
const DAY = day.date;
const at = day.at;
const { PHONE, ALI, TILL_BANK, ALI_BANK } = day.ids;
const acceptanceDay = day.events;

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
