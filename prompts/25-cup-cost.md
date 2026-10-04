# Prompt 25 — Coût de la tasse and supplier prices

> Run after prompt 24.

## Goal
The owner sees the cost and margin of every cup, the price that keeps his margin when a supplier raises prices, and the
history of each supplier's prices.

## Read first
`docs/research/innovation-map-2026-09.md` (feature 7) · `packages/kit/src/stock.js` · `docs/03-domain-model.md §5` (stock,
suppliers) · `DECISIONS.md` D13.

## Do
1. Suppliers (`sup_…`): name, phone (encrypted), items supplied.
2. Prices: from goods receipts (`stock.received` with `costCentimes`) and from a photo of the delivery note (R2) with the
   price typed by the manager; price history per item and supplier; an alert when a price rises by more than a set %.
3. Cost per cup: from each product's deductions and the latest cost of each item (coffee per kg, milk per litre, sugar);
   margin in DH and %; "prix qui garde la marge" (the TTC price that keeps the previous margin %), rounded to the price
   step the owner chooses (0,50 or 1,00 DH).
4. `/gestion/couts`: products by margin; the effect of the last price change on the month.

## Constraints
Costs are estimates from the owner's own quantities: the screen says "d'après vos doses". No price is changed
automatically.

## Acceptance checks (run them, paste the output)
1. Unit tests: coffee at 200 DH/kg, 7 g per cup, café noir at 10,00 TTC (9,09 HT at 10 %) → cost 1,40, margin 7,69 HT
   (84,6 %); at 250 DH/kg the cost is 1,75 and the price that keeps 84,6 % is 12,50 TTC.
2. E2E: delivery note with price → history → alert.
3. `npm run gate`.

## Update docs/STATUS.md
Row 25.

## Commit
`feat(cafe): cost per cup, supplier price history and alerts`
