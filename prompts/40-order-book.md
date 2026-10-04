# Prompt 40 — Order book: traiteur, pâtisserie and Aïd orders

> Run after prompt 39. Kit module `order_book`: enabled in Resto now (V1.1); the same screens appear in the Café app
> behind the module key for pâtisseries with a salon and ship with Café V2 (D3, D5). Uses the deposit rules and the
> `deposits.*` settings of prompt 39.

## Goal
Orders for a later day — a caterer's couscous for 80, a birthday cake, 5 kg of cornes de gazelle before the Aïd — are
written once with their price and deposit, produced on time from one production sheet, handed over against the balance
at any till, and never forgotten in a notebook or a DM.

## Read first
`docs/research/innovation-map-2026-09.md` (feature 6) · prompt 39 (deposits, `deposits.*`) · prompt 22 (customers,
consent) · prompt 32 (recipes) · prompt 37 (fulfilment, delivery) · `docs/11-compliance.md §8, §9` · `DECISIONS.md` D20,
D21, D22, D42.

## Do
1. Entries `bok_…` as marks `order_book.set {customerId, dueAt, fulfilment {kind: pickup | delivery, addressId?},
   lines [{productId, name {fr, ar}, unitCentimes, qtyMilli, vatBp, modifiers, note}], depositCentimes, policyVersion,
   status, periodId?}`; statuses prise → en production → prête → retirée | non retirée | annulée. The lines keep the
   agreed prices: a later catalog change never alters an entry. Products sold by weight use `qtyMilli` per kg.
2. Taking an order at the till, a phone or `/gestion → Carnet`: customer by phone number (consent required), due date and
   time, lines with notes ("Joyeux anniversaire Salma"), deposit taken as in prompt 39 (`kredi.repaid` with
   `reference: bok_…` into the collector's bank). A slip prints for the customer: « BON DE COMMANDE — ne vaut pas ticket
   de caisse », code, due time, lines, total, deposit received, balance, and the cancellation policy shown at booking.
   The Z and the day report show deposits received on their own line, never as revenue (the same for prompt 39).
3. Capacity: per product a lead time (hours) and a daily maximum (settings); an entry under the lead time or over the
   day's maximum needs a manager approval. Special periods named by the owner (for example "Aïd", "Mariages juin") with
   dates and an order cut-off; the calendar shows them. No religious date is hard-coded.
4. Production: `/gestion → Production` and a printable sheet per day and per station: quantities per product summed over
   the day's entries, then one label per entry (80 mm: code, due time, first name, lines). "Lancer" sets the entries
   `en production`; "Prête" sets `prête` and offers "Prévenir sur WhatsApp" (click-to-chat from the shop's phone, only
   with consent; no automatic message).
5. Handover at any till: find by code, phone or name → the till opens an order with the entry's lines at their agreed
   prices, applies the deposit with the `credit` tender, takes the balance, closes (receipt number at closing, D22) and
   sets the entry `retirée` with the `orderId`. Delivery entries follow prompt 37 (driver bank, run sheet).
6. Not picked up after N days (setting, default 7) or cancelled late: the manager keeps the deposit per the policy (a
   closed order « Acompte conservé » paid with `credit`, a receipt at `deposits.keptVatBp`) or refunds it with approval
   (negative `kredi.repaid`); produced items are recorded as `stock.wasted` by recipe (Resto).
7. Reports: entries by due date, deposits outstanding (money held for future orders), production per product and day,
   entries not picked up with their value, revenue of the special periods.
8. Update `docs/03 §5` (`order_book.set`, `bok_…`) and `docs/06 §7`.

## Constraints
The order book never creates an order before the handover, so kitchen and stock figures stay those of real sales; the
entry is the promise, the receipt is the sale. If the accountant requires a tax document when a deposit is received,
stop and record the question in STATUS: that needs a decision before deposits are switched on.

## Acceptance checks (run them, paste the output)
1. E2E (test values): on Monday, an order for Thursday 10:00: 2 kg of cornes de gazelle at 180,00/kg + 1 gâteau
   250,00 = 610,00; deposit 200,00 in cash into Monday's bank (Monday's Z shows "Acomptes reçus 200,00", revenue
   unchanged); on Thursday, at another till, the balance 410,00 by card → one receipt of 610,00 with the deposit as a
   `credit` payment; the customer's balance is 0,00.
2. Thursday's sheet sums three entries of 2 kg, 1,5 kg and 1 kg to 4,5 kg of cornes de gazelle; an entry above the
   day's maximum asks for approval; a catalog price change on Tuesday leaves the entry at 180,00/kg.
3. An entry not picked up after 7 days: kept deposit → a receipt of 200,00; the refund path needs approval.
4. `npm run gate`; screenshots of the calendar, the production sheet and the slip in French and Arabic.

## Update docs/STATUS.md
Row 40.

## Commit
`feat(kit): order book with agreed prices, deposits, production sheet and handover`
