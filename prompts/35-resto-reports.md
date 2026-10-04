# Prompt 35 — Resto reports, compliance pack and evening report

> Run after prompt 34.

## Goal
The restaurant owner reads each evening what came in, what the food cost, which dishes pay, how fast the kitchen was,
and where money leaked.

## Read first
`docs/10-reports-analytics.md` (all) · `packages/kit/src/reports.js` · prompts 17, 18, 23 (reuse) · `DECISIONS.md` D9, D13, D35.

## Do
1. Reports in `/gestion` (Resto): revenue, covers, average per cover, table turns per room, food cost % (day, dish,
   category), dish performance (quantity, revenue, margin), kitchen times per station (median, 95th percentile), voids and
   discounts by waiter, tenders, VAT.
2. Compliance pack (module `compliance_pack`) enabled for Resto: splits, débit-de-boissons base (when liable), VAT, hours,
   B2B invoices, integrity check (reuse prompt 23).
3. Evening report, Resto variant: the Café variables plus covers, food cost %, the best and worst dish of the day and the
   slowest station; a second WhatsApp template `rapport_du_soir_resto` (French and Arabic).
4. Signals for the control report: `lossAboveThreshold2w`, `emptyHours`, `manualSupplierOrders`, `secondSite`.

## Constraints
Numbers from the kit; the reports never mix TEST orders; kitchen times exclude held lines until fired.

## Acceptance checks (run them, paste the output)
1. On the acceptance service data: revenue 360,00, 4 covers, 90,00 per cover, food cost of the mains with the typed costs,
   kitchen times from the test timestamps.
2. The Resto evening-report variables for that service (unit test).
3. `npm run gate`.

## Update docs/STATUS.md
Row 35.

## Commit
`feat(resto): reports, food cost, kitchen times and the Resto evening report`
