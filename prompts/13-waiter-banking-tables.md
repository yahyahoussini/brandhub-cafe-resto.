# Prompt 13 — Waiter banking and tables

> Run after prompt 12.

## Goal
Each waiter takes and cashes his own tables on his phone with his own cash bank, the manager settles it at the till, and
nobody's money gets mixed with someone else's.

## Read first
`docs/06-ux-flows.md §3` · `docs/04-sync-protocol.md §9` · `docs/03-domain-model.md §5` (order, bank) · `DECISIONS.md` D5, D13,
D20 · `packages/kit/src/bank.js` · `docs/01-products.md §6` (steps 3–4, 6).

## Do
1. Layout: zones (salle, terrasse) and tables from `/gestion/salle` (a simple grid editor for cafés: name, zone, seats);
   table states derived from open orders and `table.mark`; time at the table.
2. `/serveur` (phone, portrait): tabs Tables · Commande · Ma caisse; open or resume a table order; "Envoyer au bar";
   "Encaisser" with the payment sheet of prompt 12 into the waiter's own bank (`bank.opened` kind `waiter` at his first
   sale of the shift); the receipt prints at the counter printer through the Station, or shows "Ticket prêt au comptoir".
3. Several staff on one till, each with a bank ("vendeur flottant"): the PIN session selects the bank.
4. Transfers: a waiter hands an order to the till (`order.transferred`); tables merge and bills split with the kit's
   moves (`lines.moved_out` + `lines.moved_in`, docs/04 §9): no approval, no void, no second bar ticket.
5. Settlement: "Remettre ma caisse" on the phone (refused while the phone still owns open orders: it transfers them
   first) shows a 4-character code; at the till "Reprendre" + the code + the manager's approval → `bank.taken_over`, then
   the blind count and close (prompt 14 builds the count screen; here, the take-over and the late-event case). Every
   payment passes `assertBankAccepts`: only the device that holds an open bank puts money in it.
6. Late events after a take-over are rejected (`E_NOT_OWNER`) and appear in "À vérifier" with their amount (scenario 3 of
   docs/04 §10).

## Constraints
A waiter never sees another waiter's cash. The owner of every order and bank is shown on screen.

## Acceptance checks (run them, paste the output)
1. Playwright with a till and a phone through the Station: acceptance day steps 3–4 (T4 30,00 cash 50,00 → change 20,00,
   receipt S1-000001; T2 line voided with approval then the order voided without a number).
2. Scenario 3: the phone offline after the take-over sends a cash-in and cashes a table → both land in "À vérifier"
   with their amounts; the counted bank does not change.
3. `npm run gate` and phone screenshots in French and Arabic.

## Update docs/STATUS.md
Row 13.

## Commit
`feat(cafe): waiter phones with their own cash banks, tables, transfers and take-over`
