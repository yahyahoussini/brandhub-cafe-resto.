# Prompt 12 — The counter till (`/caisse`)

> Run after prompt 11.

## Goal
A cashier sells a coffee in two taps, takes any Moroccan tender, prints, and cannot break the money rules even by mistake.

## Read first
`docs/06-ux-flows.md §2` · `docs/05-devices.md §4–§5` · `DECISIONS.md` D12, D13, D21, D22, D31, D38 · `packages/kit/src/order.js`,
`money.js`, `receipts.js`, `permissions.js` · `docs/01-products.md §6` (steps 1–2).

## Do
1. Layout of docs/06 §2 (tablet landscape; portrait uses a bottom sheet for the order): categories, tiles (≥ 96 px),
   the order panel, the bottom bar. Tap = one unit; products with required options open the options sheet.
2. Order actions through the kit only: add, quantity, void (approval once sent), hold and resume, discount (role caps,
   approval above), note; every action is one Dexie transaction writing the event, the projection and the outbox.
3. Payment sheet: exact cash in one tap, quick notes 20/50/100/200 with the change in large type, card on the external
   terminal (reference required), Maroc Pay (reference), transfer, voucher, other; split by amount or in n equal parts.
   Closing takes the receipt number from the till's block (`takeNumber`) and prints the receipt (setting), opens the drawer
   on cash, and prints the bar ticket when `printing.barTicketOnPayment` is on.
4. "Dernier ticket" reprint (first free, then approval, counted); "Rupture" on a long press (permission).
5. TEST mode (training): orders opened with `training: true`, excluded from every report, numbered in the device's own
   training series (`T` + its prefix: `TC1-000001`), so two devices never share a number.
6. Speed: measure taps and time in tests; keep the till route under the 150 KB budget.

## Constraints
No money arithmetic in UI code (lint). The till never shows an expected cash amount before the blind count.

## Acceptance checks (run them, paste the output)
1. Playwright on the demo account: step 2 of the acceptance day (C1-000001 25,00 cash 50,00 → change 25,00; C1-000002
   27,00 card ref 1234; C1-000003 24,00 Maroc Pay ref MP-5521), totals checked on screen and in the cloud store.
2. The coffee sale counted at 2 taps; a discount above 10 % by the cashier asks for approval; a void after sending asks
   for approval.
3. `npm run gate` (budgets included) and screenshots in French and Arabic.

## Update docs/STATUS.md
Row 12; measured time from "Espèces" to print start on the reference kit.

## Commit
`feat(cafe): counter till with tenders, split, receipts, reprint and training mode`
