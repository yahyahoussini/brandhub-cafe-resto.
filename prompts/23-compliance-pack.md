# Prompt 23 — Compliance pack and digital receipt

> Run after prompt 22. Kit module (Resto enables it in prompt 35).

## Goal
The owner and his accountant get, in two taps, the numbers the tax office, the commune and the CNSS declarations need,
B2B clients get proper invoices, and a customer can take his receipt as a QR code.

## Read first
`docs/11-compliance.md` (all) · `docs/10-reports-analytics.md §5` · `data/tax-presets.json` · `DECISIONS.md` D22, D32,
D39–D43 · `packages/kit/src/journal.js`, `receipts.js` (`formatInvoiceNo`).

## Do
1. Revenue splits: drinks vs food (category `taxClass`) and terrasse vs salle (zones), per day/month/quarter.
2. Débit-de-boissons report: drinks revenue HT per quarter, the tax at the configured commune rate, the due dates, and a
   reminder in `/gestion` 15 days before each due date.
3. VAT report per rate and period (TTC, VAT, HT) for the client's declaration.
4. Hours sheet: "Pointer" on the till and phones with the staff PIN (`staff.clock`), a monthly sheet per person
   (days, in/out, total hours), exported for the accountant.
5. B2B invoice: from one or several closed tickets, buyer name/address/ICE (ICE always asked), yearly gapless series
   issued online by the store (`invoice.issued`, concurrency-safe), PDF in French and Arabic stored in R2; credit invoice
   (`invoice.issued` with `creditOf`) for corrections. The model keeps every field UBL 2.1 needs (prompt 46).
6. Integrity page: `verifyChain` over a chosen period, with a printable result.
7. Digital receipt (`digital_receipt`): `/r/:code` (noindex, signed link valid 90 days) shows the receipt; the printed
   receipt carries its QR; at the till, "Ticket numérique" shows the QR instead of printing when the customer prefers —
   switched on per client only after the answer to docs/11 §11 item 12.

## Constraints
No wording that suggests a certification (D39). Invoice numbers are never reused, even after a failed PDF.

## Acceptance checks (run them, paste the output)
1. On the acceptance day: drinks HT and food HT that add up to the net of 96,37 (106,00 − 9,63); the débit-de-boissons
   amount at 8 %.
2. Invoice numbering under 20 concurrent requests: no gap, no duplicate. `verifyChain` passes, then fails on a tampered row.
3. `npm run gate`.

## Update docs/STATUS.md
Row 23.

## Commit
`feat(kit): compliance pack, B2B invoices, hours sheet, integrity check, digital receipt`
