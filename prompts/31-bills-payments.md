# Prompt 31 — Bills and payments (Resto)

> Run after prompt 30.

## Goal
A table's bill splits the way Moroccan tables pay — by seat, by dish or in equal parts — with tips and an optional
service charge, into the right person's cash bank.

## Read first
`docs/01-products.md §7` (step 4) · `packages/kit/src/money.js` (`allocate`, `splitEvenly`), `order.js`, `tips.js` (prompt 21) ·
`docs/11-compliance.md §9` · `DECISIONS.md` D21, D31.

## Do
1. Pre-bill ("NOTE — ne vaut pas ticket de caisse") printed from the plan or the phone, with the order code.
2. Split: by seat (lines of each seat), by item (drag lines to payers), in n equal parts; each part is a payment on the same
   order (one receipt), or, when the owner's settings say so, separate orders with their own receipts (lines moved with
   the kit's `lines.moved_out` + `lines.moved_in`, docs/04 §9).
3. Service charge: off by default; when on, it is a visible line with its VAT and its rate shown on the menu and receipts
   (Law 31-08: displayed prices include mandatory charges).
4. Tips on card payments (`tipCentimes`, prompt 21) and cash tips into the pool.
5. Payments go to the bank of the person cashing (per-waiter banking from Café, via the kit); the take-over flow of prompt 13.

## Constraints
All split arithmetic through the kit; the parts always add up to the total exactly.

## Acceptance checks (run them, paste the output)
1. E2E: docs/01 §7 step 4: bill 360,00; seat 1 pays 95,00 by card; the rest 265,00 in cash to the waiter's bank.
2. Split in 3 equal parts of 100,00 → 33,34 + 33,33 + 33,33; a split by item with a shared dish.
3. `npm run gate`.

## Update docs/STATUS.md
Row 31.

## Commit
`feat(resto): bills split by seat, item or parts, tips and optional service charge`
