# Prompt 17 — Owner back office and reports (`/gestion`)

> Run after prompt 16.

## Goal
The owner, on his phone, sees today live, any past period, every gap with the events behind it, and can hand the
accountant clean exports.

## Read first
`docs/06-ux-flows.md §5` · `docs/10-reports-analytics.md` (all) · `DECISIONS.md` D9, D13, D38, D42 · `packages/kit/src/reports.js`.

## Do
1. Sections of docs/06 §5: Aujourd'hui (live through the cloud socket), Rapports (day, week, month; by category, product,
   staff, zone, hour; tenders; VAT by rate; voids, discounts, openings without sale, reprints), Carte (full menu editor:
   categories, products, options, zone prices, availability, CSV import with a preview), Équipe, Appareils, Stock,
   À vérifier (dead letters with resolution actions), Réglages (docs/03 §8), Abonnement (licence dates and status, WhatsApp
   link to BrandHub).
2. Every number links to the list of events behind it (an audit view with who, device, time, approval).
3. Staff see only their own numbers in a "Mes chiffres" view (on their device, from their PIN session).
4. Exports: CSV (sales lines, payments, Z, stock, doses; UTF-8 BOM, `;`, decimal comma) and the Sage journal of
   docs/10 §5 with account codes from settings (suggested PCGE values marked "à valider par votre comptable").
5. The accountant role: reports and exports only.

## Constraints
Numbers come from the cloud store's projections through the kit; the back office never recomputes money in the UI.
Exports need the password again (docs/08 §1).

## Acceptance checks (run them, paste the output)
1. On the acceptance day data: the dashboard, the day report and the CSV totals all show 106,00 TTC and VAT 9,63; the
   gap list shows Sara −5,00 and the dose gap.
2. The Sage file passes a format test (tab-separated, no header row, `DD/MM/YYYY`, debit = credit per document).
3. `npm run gate` and screenshots at 360 px in French and Arabic.

## Update docs/STATUS.md
Row 17.

## Commit
`feat(cafe): back office with live day, reports, audit trail and exports`
