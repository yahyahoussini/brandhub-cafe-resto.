# Prompt 33 — Stock, suppliers and purchasing

> Run after prompt 32.

## Goal
The restaurant orders from suppliers, receives with a photo of the delivery note, counts by storage area, and sees every
gap and every price change.

## Read first
`docs/03-domain-model.md §5` (stock, suppliers) · `packages/kit/src/stock.js` · prompt 25 (supplier prices, reuse) ·
`docs/10-reports-analytics.md §4, §6` (`manualSupplierOrders`).

## Do
1. Storage areas (chambre froide, réserve, bar…), items per area, par levels.
2. Purchase orders (`pur_…`, marks with lines, supplier and state): suggested quantities from par levels and the last
   2 weeks of usage; sent to the supplier as a PDF or a WhatsApp click-to-chat message prepared for the manager (no
   automatic sending); states draft → sent → received.
3. Goods receipt against a purchase order or without one: quantities, prices, photo of the delivery note (R2), differences
   against the order; costs update the ingredient's cost.
4. Counts: full or by area, on a phone, in shelf order; waste log with reasons; the variance report (expected vs counted)
   in quantity and DH.
5. The `manualSupplierOrders` signal for the control report (goods received without purchase orders over the month).

## Constraints
No supplier message is sent without a person pressing send in WhatsApp. Photos compressed on the device (≤ 500 KB).

## Acceptance checks (run them, paste the output)
1. E2E: purchase order → partial receipt with photo → stock levels → count → variance.
2. The price history shows the new price and the alert of prompt 25.
3. `npm run gate`.

## Update docs/STATUS.md
Row 33.

## Commit
`feat(resto): purchasing, goods receipt with photos, counts by area and variance`
