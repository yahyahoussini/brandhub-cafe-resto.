# Prompt 39 — Reservations, deposits and Mode Match

> Run after prompt 38. Kit module `match_mode`: enabled in Resto now (V1.1); the same screens appear in the Café app
> behind the module key and ship with Café V2 (D5, D6). Needs from Yahya: the accountant's answer on VAT for deposits
> and for deposits kept after a no-show (docs/14 task 21).

## Goal
The restaurant takes bookings with or without a deposit, sees tonight's covers on the floor plan, loses fewer tables
to no-shows, and runs match and event nights with a published menu, a minimum spend and deposits that are credited to
the bill.

## Read first
`docs/research/innovation-map-2026-09.md` (feature 5) · `docs/research/market-2026-09.md` (no-shows, reservation tools) ·
prompt 22 (customers, `kredi.repaid`) · prompt 28 (floor plan) · `docs/11-compliance.md §8, §9` · `DECISIONS.md` D9, D21,
D22, D35, D40, D42.

## Do
1. Reservations `rsv_…` as marks `reservation.set {customerId, date, time, covers, zoneId?, tableIds?, notes, status,
   depositCentimes?, eventNightId?, source}`; statuses demandée → confirmée → arrivée | no-show | annulée. Capacity
   per 30-min slot and per zone (settings); the floor plan shows "réservée 20:30" from 30 minutes before; "Arrivée"
   opens the table's order linked to the reservation (`order.opened {reservationId}`).
2. Booking channels: phone and walk-in at the till or on a phone; an online request page `/reserver/:slug` (noindex,
   Turnstile and rate limits as in prompt 38) that creates `demandée` bookings only; staff confirm them. A customer
   needs a phone number with recorded consent (prompt 22 model).
3. Reminders without the API: "Rappeler sur WhatsApp" opens WhatsApp on the restaurant's phone with a prefilled message
   to the customer (click-to-chat), only for consenting customers; no automatic message.
4. Deposits: received in any tender into the collector's bank as a `kredi.repaid` on the customer with
   `reference: rsv_…`, so the customer holds a credit; at the bill, the deposit is applied with the `credit` tender (the
   receipt shows "Acompte versé le …"). No-show after the grace time (15 min, setting): the deposit is kept per the
   policy shown at booking — a closed order "Acompte conservé" paid with `credit` (a receipt is issued) — or refunded
   with a manager approval (a negative `kredi.repaid` carrying `approvedBy`, which lowers the refunding bank's expected
   cash).
5. VAT: until the accountant answers, `deposits.vatOnReceipt` (true | false) and `deposits.keptVatBp` stay empty and
   deposits cannot be switched on (the onboarding shows the question). The VAT report lists deposits received in the
   period on their own line. Prompt 40 reuses the same deposit rules and settings.
6. Mode Match (`match_mode`) — event nights `evn_…` as marks `event_night.set {name, date, doorsAt, startsAt,
   menuPeriodId, minimumSpend {per: person | table, centimes}, depositPerPersonCentimes, capacityByZone}`: an event menu
   period with TTC prices; a printable A4 poster and QR with the menu, the minimum spend and the deposit (Law 31-08:
   shown before booking); bookings against the event's capacity.
7. Minimum spend at the bill: if the table's total is below the minimum, the till adds a line « Complément minimum de
   consommation » for the difference (kit computes it; VAT at the default rate), shown on the pre-bill.
8. Reports: covers booked vs seated, no-show rate, deposits received, applied, kept and refunded; per event: revenue,
   covers, revenue per head, against the same weekday without an event.
9. Update `docs/03 §5` (reservation and event marks, the new data fields) and `docs/02 §5` (`/reserver/:slug`).

## Constraints
Deposits never live outside the event log and a bank: every dirham received or returned is a `kredi.repaid` in a bank.
A booking over capacity needs a manager approval. No marketing message (D9).

## Acceptance checks (run them, paste the output)
1. E2E: event "Match" with a deposit of 50,00 per person and a minimum of 300,00 per table; a booking for 4 → deposit
   200,00 in cash; on the night the table spends 260,00 → complement 40,00 → total 300,00 → deposit applied → 100,00
   paid in cash; the bank and the customer balance (0,00) are right.
2. No-show after 15 minutes → kept deposit: a receipt of 200,00 at the rate the test sets for `deposits.keptVatBp`
   (at 10 %: VAT included 18,18); a refund instead needs approval and lowers the bank's expected cash by 200,00.
3. Capacity: an online request beyond the slot's capacity is refused; staff override with approval.
4. `/reserver/:slug` has `X-Robots-Tag: noindex`; `npm run gate`; screenshots of the reservation list and the event
   poster in French and Arabic.

## Update docs/STATUS.md
Row 39; the accountant's VAT answers.

## Commit
`feat(kit): reservations with deposits, no-shows and Mode Match event nights`
