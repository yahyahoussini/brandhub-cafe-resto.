# Prompt 46 — E-invoicing export: UBL 2.1 invoices and credit notes

> Run after prompt 45 (V2), or earlier if a client that issues B2B invoices enters its e-invoicing phase (docs/11 §4).
> Before starting, check whether the DGI has published its technical specifications and the implementing decree (docs/14
> task 26); if it has, stop and write what they require in STATUS — this prompt then needs a revision, not a guess.

## Goal
Every B2B invoice and credit invoice the products issue can be exported as a valid UBL 2.1 XML file, so the client's
accountant or a future DGI connection receives structured invoices without re-typing, while the connection itself waits
for the official specifications.

## Read first
`docs/11-compliance.md §2, §4` · `docs/research/facts-2026-09.md §A2, §A3` · prompt 23 (invoice model, `invoice.issued`,
PDF) · `packages/kit/src/receipts.js` (`formatInvoiceNo`), `money.js` · `DECISIONS.md` D22, D39.

## Do
1. Kit, `packages/kit/src/ubl.js` (pure, tested): builds the XML of an `Invoice` (type code 380) or a `CreditNote` (381,
   with `BillingReference` to the original invoice) from the stored invoice: `UBLVersionID` 2.1, the invoice number,
   issue date, currency MAD; the seller and the buyer with name, address and their identifiers (ICE, IF, RC); one line per
   item with quantity, unit price HT and line amount HT; `TaxTotal` with one `TaxSubtotal` per rate (taxable amount, tax
   amount, percent, scheme VAT); `LegalMonetaryTotal` (line total HT, tax exclusive, tax inclusive, payable); the
   payment method. Amounts come from the invoice's own totals (VAT per line, D21), written with 2 decimals from centimes.
2. One mapping table in the module for what the DGI has not fixed yet — `CustomizationID`, `ProfileID`, the scheme
   names of ICE, IF and RC, the unit codes — each marked "à confirmer à la publication des spécifications DGI". When the
   specifications appear, only this table changes.
3. Validation: the OASIS UBL 2.1 XSD schemas stored under `tools/ubl/xsd/` (with their licence file); CI installs
   `libxml2-utils` and runs `xmllint --noout --schema` on generated fixtures; the Node test runs the same command when
   `xmllint` is present and says it skipped it otherwise.
4. `/gestion → Factures`: download the XML of one invoice, or a monthly archive of all XML and PDF files for the
   accountant (a small zip library, its reason and weight in the commit). Nothing is sent automatically to any third
   party (docs/10 §5).
5. Totals check: the XML's totals equal the PDF's and the stored `invoice.issued` totals; a difference fails the export.
   If the per-rate VAT in the invoice (sum of line VATs) and the per-rate recomputation differ by a centime, the export
   keeps the invoice's own figures and notes the difference in the test output; the rule is settled when the DGI
   publishes its business rules.
6. Update `docs/11-compliance.md §4` with what the export covers and what it does not: no qualified electronic
   signature, no transmission to a DGI platform, no clearance.

## Constraints
No wording that suggests the export is DGI-approved or certified (D39). The XSD files are never edited.

## Acceptance checks (run them, paste the output)
1. `xmllint --schema` passes on three fixtures: an invoice at one rate (10 %), an invoice at two rates (10 % and 20 %),
   and a credit invoice that references the first one.
2. Unit test: for each fixture, the XML totals equal the stored invoice totals and the PDF totals.
3. `npm run gate` (the XSD check runs in CI).

## Release
Tag `cafe-v2.1.0` and `resto-v2.1.0` in the release window (D46).

## Update docs/STATUS.md
Row 46; the state of the DGI specifications on the day; V2 complete.

## Commit
`feat(kit): UBL 2.1 export of B2B invoices and credit invoices with XSD validation`
