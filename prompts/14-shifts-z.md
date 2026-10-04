# Prompt 14 — Shifts, blind count and Z

> Run after prompt 13.

## Goal
Every bank opens with a float and closes with a blind count, the gap is a number in DH, and the Z of each bank and of the
day matches the cloud to the centime.

## Read first
`docs/10-reports-analytics.md §1–§2` · `docs/06-ux-flows.md §2` steps 1 and 8 · `DECISIONS.md` D13, D14 · `packages/kit/src/bank.js`,
`reports.js` · `docs/01-products.md §6` (steps 1, 5–7).

## Do
1. Opening: float (total, or notes and coins); the shift cannot open when `tillPermissions` refuses (D14).
2. During the shift: cash in, cash out with reason and approval, staff advance (`advanceTo`), opening without sale with
   approval (`bank.no_sale`), reprints counted.
3. Closing: blind count (expected hidden), then the gap on screen ("Écart : −5,00 DH"), the Z of the bank printed and
   stored as a `z.closed` record; "Clôturer la journée" (`day.closed`) when every bank is closed, printing and storing
   the day Z.
4. Z content exactly as docs/10 §2, computed with `dailyReport`; the same Z shown in `/gestion` from the cloud.
5. TEST orders excluded; credit notes shown apart. Credit notes (approval): from a closed ticket, never more than what
   is left to refund on it (`E_REFUND_EXCEEDS`), with the question « Marchandise revenue en stock ? » (`restock`).

## Constraints
A closed day's Z is the stored `z.closed` record with its hash, never a recomputation; corrections go through credit
notes.

## Acceptance checks (run them, paste the output)
1. Playwright replays the whole café acceptance day (docs/01 §6) and checks the printed and stored Z: 4 tickets, 106,00
   TTC, VAT 9,63, cash 55,00, card 27,00, Maroc Pay 24,00, Sara −5,00, Ali 0,00, 1 void after send, 1 voided order,
   1 opening without sale.
2. The day Z on the till equals the day Z in `/gestion` (JSON diff empty).
3. `npm run gate`.

## Update docs/STATUS.md
Row 14.

## Commit
`feat(cafe): shifts with float, blind count, gaps and Z reports`
