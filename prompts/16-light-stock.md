# Prompt 16 — Light stock

> Run after prompt 15.

## Goal
The café knows its 10–20 key items (coffee, milk, sugar, mint, oranges, bottles), sees what each sale uses, and is warned
before it runs out.

## Read first
`docs/03-domain-model.md §5` (stock) · `packages/kit/src/stock.js` · `data/menu-templates/cafe.json` (stock items and
suggested deductions) · `docs/10-reports-analytics.md §1, §4`.

## Do
1. `/gestion/stock`: items (name, unit g/ml/piece, par level, cost), created from the template at onboarding; deductions per
   product in the menu editor (the template's suggested values are marked "exemple — pesez vos doses").
2. Movements from the phone or the till with permission: count (full or partial), goods received (quantity, optional
   cost and supplier), waste with reason.
3. Levels computed with `stock.js` (closed sales deduct with the deduction list in force at closing); low-stock list on the
   dashboard and in the evening report data; gap at each count (docs/10 §4).
4. A weekly count screen for the manager (phone): items in shelf order, big numeric input, "rien à signaler" per item.

## Constraints
Sales never write stock events (the projection deducts). Suggested quantities stay marked until the owner changes them.

## Acceptance checks (run them, paste the output)
1. Selling 3 cafés noirs with the template deductions lowers "Café en grains" by 21 g; a count below par shows the item in
   "Stock bas".
2. A count after sales shows the gap against the expected level.
3. `npm run gate`.

## Update docs/STATUS.md
Row 16.

## Commit
`feat(cafe): key stock items, deductions, counts and low-stock alerts`
