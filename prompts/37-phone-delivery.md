# Prompt 37 — Phone orders, deliveries and customer accounts (Resto)

> Run after prompt 36, from Tue 13 Apr 2027 while the Resto pilot runs. Resto V1.1 (prompts 37–41) ships as
> `resto-v1.1.0` before Gate 3 (30 Jun 2027). Needs from Yahya: the lawyer's wording for oral consent on the phone and
> the accountant's VAT answer for takeaway, delivery and the delivery fee (docs/14 tasks 20–21).

## Goal
A phone order takes under a minute because the customer's number brings back his address and his last order; every
delivery is tracked from the kitchen to the door with the driver's cash counted like any other bank; companies that eat
on account get one invoice at the end of the month.

## Read first
`docs/03-domain-model.md §5` (order modes, tenders, customers, `kredi.repaid`) · prompts 22 (Kredi and customers) and 23
(B2B invoices) · `docs/11-compliance.md §2, §5, §8` · `docs/08-security.md §6` · `data/permissions.json` ·
`DECISIONS.md` D20, D22, D35, D38, D40, D42.

## Do
1. Enable the kit module `kredi` in Resto and reuse its customer model (prompt 22, docs/03 §6: personal fields in
   `customers_pii`, never in events; lookup by keyed hash; consent with text version and time). Add addresses to a
   customer: label (maison, bureau), quartier, street and landmark in free text ("en face de la pharmacie…"), floor and
   door, an optional location link pasted from WhatsApp. Addresses are personal data: in `customers_pii`, encrypted.
2. Phone order at `/caisse → Téléphone`: type or paste the number → the customer and his addresses in ≤ 1 s (keyed hash,
   also offline from the Station's copy of today's customers) → "Reprendre la dernière commande" or a new order. A new
   customer: the cashier reads the consent text shown on screen and taps "Consentement lu" (recorded as oral consent with
   the text version, the time and the staff member); no consent → the order is taken with a first name only, nothing kept.
3. Kit, `order.js`: `order.opened` accepts `fulfilment {kind: pickup | delivery, addressId?, promisedAt}` for the
   `takeaway` and `delivery` modes (unit tests); the customer is attached with `order.customer_set`. The delivery fee is an ordinary line (product « Livraison »,
   its VAT rate set with the accountant), so totals and VAT stay in the kit. Delivery zones in settings: quartiers with
   fee and minimum order; no map service.
4. Delivery states as marks `delivery.status {status, driverId?}` on `ord_…`: reçue → en cuisine → prête → en route →
   livrée | échec. Board at `/caisse → Livraisons` (and on the pass screen): columns by state, promised time, lateness
   colours, driver assignment, several orders per run.
5. Drivers: add the role `driver` to `data/permissions.json` (D38): open and count his own bank, see his runs, set
   `delivery.status`, clock in; nothing else. A driver's bank is a `waiter` bank (kit unchanged) opened at the till with
   a change float and counted at the till when he comes back (blind count, prompt 14). His phone, if paired, shows his
   runs and sets `delivery.status`; it never writes payments.
6. Cash on delivery: at "Départ", the till records the payment into the driver's bank with the amount the customer said
   he will pay with ("paie avec 200"), closes the order and prints the receipt for the bag with "Monnaie à rendre" and a
   run sheet (orders, addresses, amounts, change). The receipt is taken at closing (D22); no delivery leaves without one.
7. Failed delivery: "Échec" with a manager approval → a credit note for the order (`refundOf` with `restock: false`,
   reason « livraison échouée »), paid back from the driver's bank. The food does not come back: the stock projection
   records the recipe ingredients as waste (docs/03 §5), so levels stay where they were after the sale and the waste
   report shows the loss.
8. Customer accounts (companies): a customer flagged `account` with a monthly limit; orders paid with the `credit`
   tender; month-end statement; one B2B invoice for the month's tickets (prompt 23, buyer ICE asked); payment by
   transfer or cheque (`other`, reference "chèque n°…") recorded as `kredi.repaid`.
9. Reports in `/gestion`: deliveries per day, promised vs delivered time (median, late %), failed deliveries with their
   value, each driver's bank gap, delivery share of revenue, account customers' balances and aging.
10. Update `docs/03 §5` (new data fields, `delivery.status`) and `docs/06 §7` in the same commit.

## Constraints
Addresses and phone numbers never appear in logs, kitchen tickets (the kitchen sees "LIVRAISON · 7F3K-2Q · Maârif"),
exports to third parties or the control report. They are decrypted only on the devices that show today's orders.
`taxes.byMode` stays empty until the accountant answers (docs/11 §5): the onboarding shows the question. No message is
sent to customers by this prompt.

## Acceptance checks (run them, paste the output)
1. E2E through the Station: a known number finds the customer and his address in ≤ 1 s; order 2 × tajine poulet citron +
   « Livraison » 15,00 = 165,00; "paie avec 200,00" → "Monnaie à rendre 35,00" printed; driver float 100,00 → his bank
   expects 265,00 at return; counted 265,00 → écart 0,00.
2. A failed delivery with approval: the driver's bank expects 100,00; stock levels equal those right after the sale
   (500 g of chicken and 1 preserved lemon still out); the waste report shows them; the Z lists the credit note.
3. An account customer: three lunches on `credit` in May → one invoice `F-2027-…` with the three ticket numbers; a
   transfer repayment clears the balance.
4. `npm run gate`, and `/caisse → Téléphone` and `Livraisons` screenshots in French and Arabic.

## Update docs/STATUS.md
Row 37; the consent wording used and who approved it; the VAT answer for delivery.

## Commit
`feat(resto): phone orders, delivery board, driver banks and customer accounts`
