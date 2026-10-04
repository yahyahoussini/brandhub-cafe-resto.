# Prompt 22 — Kredi: customer tabs and staff advances

> Run after prompt 21. Kit module (Resto enables it in prompt 37).

## Goal
Regulars can "pay later" within a limit, the café sees who owes what and reminds them on WhatsApp with their consent, and
staff advances are tracked until payday.

## Read first
`docs/research/innovation-map-2026-09.md` (feature 4) · `docs/11-compliance.md §8` · `docs/08-security.md §6` ·
`DECISIONS.md` D35, D42, D43 · `docs/03-domain-model.md §5` (customers, `kredi.repaid`, `bank.cash_out advanceTo`).

## Do
1. Customers (`cus_…`) with the personal-data model of docs/03 §6: name and phone in `customers_pii` (encrypted with
   `DATA_KEY`, never in an event), lookup by keyed hash with the client's `LOOKUP_KEY`, `POST /api/customers` for
   customers created on a device, today's rows on the devices; limit; consent (text version and time) required before
   the first tab; erasure deletes the row and the events keep only `cus_…`. This model is reused by every later prompt
   that stores a customer.
2. Tender `credit` (reference = customer id) at the till and on phones, the customer attached with
   `order.customer_set`: checks the limit against the balance cached on the device; offline sales over the limit need
   approval; the server re-checks and flags.
3. Repayments (`kredi.repaid`) in any tender; cash goes into the collector's own open bank (`assertBankAccepts`) and
   counts in its expected cash; transfers and cheques carry no bank; money given back is a negative amount with an
   approval. The customer's balance and history; aging (7, 30, 60 days) in `/gestion`.
4. Reminders, following the answer of docs/14 task 23: the utility template `rappel_kredi` (French and Arabic, Darija
   after review) from BrandHub's number, or a click-to-chat message prepared for the café's own phone; only to
   consenting customers, at most once a week per customer, counted in `messages`.
5. Staff advances: the cash-out with `advanceTo` (prompt 14) listed per staff member with a monthly payday summary for the
   accountant.

## Constraints
No phone number in logs, exports to third parties or the control report. A customer's data is erased on request.

## Acceptance checks (run them, paste the output)
1. E2E: consent → tab of 45,00 → repayment of 20,00 → balance 25,00 → reminder queued once; over-limit offline sale needs approval.
2. Erasure test: the customer disappears from lists; sales stay with an anonymous id.
3. `npm run gate`.

## Update docs/STATUS.md
Row 22; templates submitted.

## Commit
`feat(kit): Kredi customer tabs with consent and reminders, staff advances`
