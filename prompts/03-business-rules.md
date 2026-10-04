# Prompt 03 — Business rules: events, marks, stock, reports, permissions

> Run after prompt 02.

## Goal
Complete the pure kit so that the tablet, the Station and the cloud compute exactly the same numbers, and prove it with
the café acceptance day of docs/01 §6.

## Read first
`packages/kit/src/*` and tests (provided) · `docs/03-domain-model.md` (all) · `docs/10-reports-analytics.md §1–§2` ·
`docs/01-products.md §6` · `data/permissions.json` · `DECISIONS.md` D20–D22, D26, D38.

## Do
1. `packages/kit/src/events.js`: `validateEnvelope(ev)` (docs/03 §4, sizes), the type registry of docs/03 §5 with, for
   each type, its aggregate prefix, kind (sequenced / movement / mark) and the device kinds allowed to write it
   (`till`, `phone`, `screen`, `station`, `office`, `cloud`).
2. `packages/kit/src/marks.js`: last-writer-wins by (`at`, `device`, `id`) per entity and type, and per key where
   docs/03 §1 says so (`settings.set` per path, `kitchen.status` per sent event and station); `applyMarks(state, events)`
   for catalog, settings, staff (`staff.set` and `staff.pin_set` apart), layout, kitchen status, table marks; the
   settings defaults of docs/03 §8 live here, so devices have them offline.
3. `packages/kit/src/stock.js`: stock levels from `stock.counted` (snapshot), `stock.received`, `stock.wasted`,
   `stock.adjusted`, and sales deductions of closed orders using the deduction list (or recipe) in force at closing;
   credit notes give ingredients back only when `refundOf.restock` is true, otherwise they count as waste (docs/03 §5);
   moved lines count once, in the order that closes them.
4. `packages/kit/src/reports.js`: `dailyReport({ orders, banks, cashPaymentsByBank, readings, offTill, tz })` returning
   the measures of docs/10 §1 and the Z of §2 (revenue TTC, VAT by rate, net, tickets, credit notes, tenders, voids,
   discounts, no-sales, reprints, gaps per bank, dose gap with the day's average dose price).
5. `packages/kit/src/permissions.js`: `can(staff, action, ctx)` and `needsApproval(staff, action, ctx)` from
   `data/permissions.json` with settings overrides that respect each `floor`.
6. Tests (node:test): the café acceptance day as one test that builds every event of docs/01 §6 through the kit and
   asserts: 4 tickets, 106,00 TTC, VAT 9,63, cash 55,00, card 27,00, Maroc Pay 24,00, average 26,50, Sara −5,00,
   Ali 0,00, 1 void after send, 1 voided order without number, 1 opening without sale, dose gap 2 (≈ 20,80 DH);
   rebuilding from the events in shuffled order gives the same report; property tests for stock and marks; a merge of
   two tables with `lines.moved_out`/`lines.moved_in` keeps the day's totals and adds no void to the report.

## Constraints
Pure functions, no I/O, no dependency. Money only through `money.js`. Do not change the behaviour of the provided
modules; if a provided function has a bug, fix it with a failing test first and say so.

## Acceptance checks (run them, paste the output)
1. `npm test` → counts; the acceptance-day test output with the numbers.
2. `npm run typecheck` → 0 errors.

## Update docs/STATUS.md
Row 03; the list of kit modules with one line each.

## Commit
`feat(kit): event registry, marks, stock, daily report, permissions`
