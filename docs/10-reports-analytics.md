# 10 · Reports and analytics — definitions, Z, evening report, loss signals, exports

Every figure is computed in the TenantStore (and for today on the Station) from events, with the kit's functions.

## 1. Definitions
| Measure | Definition |
|---|---|
| Business day | `businessDate(at)` with the client's cut-off (default 05:00, D26) |
| Revenue TTC | Σ totals of closed orders of the day (credit notes negative) |
| Net HT, VAT | from each order's `totals.vat` rows (VAT per line, D21) |
| Tickets | closed orders; credit notes counted apart |
| Average ticket | revenue TTC ÷ tickets |
| Covers (Resto) | Σ `covers` of closed table orders |
| Voids | lines voided after sending, orders voided (count and TTC value at the time); an order emptied by moving all its lines to another table (merge) counts apart as merged, not as a void |
| Discounts | Σ `discountCentimes`, by staff and reason |
| Openings without sale | `bank.no_sale` events |
| Reprints | `bank.reprint` events |
| Cash gap | `cashVariance(bank, cash)` per bank (`bank.js`), where `cash` is the bank's cash payments and its cash `kredi.repaid` (repayments, deposits, refunds) |
| Dose gap | `doseVariance` between the open and close readings (`bank.js`); money value at the day's average dose price = coffee revenue ÷ coffee doses sold. With several machines, every machine needs both readings and none may have a counter reset, otherwise the gap is "missing reading" or "counter reset", never a guess |
| Stock gap | last count − (previous count + received − wasted + adjusted − sold by deductions) (`stock.js`) |
| Food cost % (Resto) | Σ recipe cost of dishes sold ÷ net HT of those dishes |
| Kitchen time (Resto) | from `lines.fired` (or `lines.sent`) to `kitchen.status = ready`, median per station |

## 2. Z report (per bank, and per day)
Header (venue, legal line, business day, bank holder, device, opened/closed at) · tickets and credit notes (first and
last numbers) · revenue TTC, VAT by rate, net HT · tenders (cash, card with count of slips, Maroc Pay, transfer,
voucher, credit, other) · float, cash in, cash out (with reasons), expected, counted, gap · voids, discounts, openings
without sale, reprints · dose counter (Café). The day Z adds banks side by side and the dead letters still open. A
bank's Z covers the payments made into it (`payment.bankId`): an order paid into two banks shares its revenue and VAT
between them in proportion to the amounts paid (largest remainder), and cash Kredi repayments have their own line, so
float + cash sales + Kredi cash + cash in − cash out = expected. Receipt numbers are listed per device series. Printed
at closing and stored as a `z.closed` record with its hash (docs/03 §5): the Z shown later is that record, never a
recomputation.

## 3. Evening report (`evening_report`, D35)
One report per business day, sent at the first of: the manager's "Clôturer la journée" (`day.closed`), or the fallback
time `reports.eveningTime` (default 23:30, client time zone; Mode Ramadan can set another). A fallback report says
"journée en cours" and gives the numbers so far; no second message follows (one message a day keeps the cost known).
Content: business day · revenue TTC and its change against the same weekday last week, as one phrase ("+8 % vs lundi
dernier", or "première journée") · tickets and average ticket · cash gaps per bank above 0 · dose gap in doses and DH ·
voids after sending and openings without sale · low-stock items (up to 3) · open dead letters · a button to the day in
`/gestion`.
WhatsApp utility template `rapport_du_soir` (submit to Meta in prompt 18). The body starts and ends with fixed text,
because Meta rejects a template that starts or ends with a variable; the link is a URL button whose last part is the
date (`https://cafe.brandhub.ma/gestion/jour/{{1}}`):
```
FR  Rapport du {{1}} — {{2}}
    Chiffre : {{3}} ({{4}})
    Tickets : {{5}} · Panier moyen : {{6}}
    Écarts caisse : {{7}}
    Doses : {{8}}
    Annulations : {{9}} · Tiroir sans vente : {{10}}
    Stock bas : {{11}}
    Le détail de la journée est dans BrandHub.
AR  تقرير {{1}} — {{2}}
    رقم المعاملات: {{3}} ({{4}})
    التذاكر: {{5}} · متوسط التذكرة: {{6}}
    فروقات الصندوق: {{7}}
    الجرعات: {{8}}
    الإلغاءات: {{9}} · فتح الدرج بدون بيع: {{10}}
    مخزون منخفض: {{11}}
    تفاصيل اليوم في BrandHub.
```
A Darija variant is drafted in `data/evening-report.json` and must be reviewed by Yahya before it is submitted. If the
template is not approved yet, or the owner has not opted in, the report goes by email (Resend) with the same content.
Every message is counted in `messages` (channel, kind, status) for the monthly pass-through line (D35).

## 4. Loss signals (D13: numbers, not accusations)
| Signal | Rule (default thresholds in settings) |
|---|---|
| Cash gap | a bank's gap beyond ±20,00 DH; two banks of the same holder in a row beyond it = alert |
| Dose gap | `doseAlert`: gap > max(5 doses, 3 % of machine doses) on two periods in a row |
| Voids after sending | per staff per week, value and count, against the team median; > 2 × median = alert |
| Discounts | per staff per week against the median; any discount above the role's cap without approval is impossible (blocked) |
| Openings without sale | more than 3 per bank per day |
| Reprints | more than 2 per bank per day |
| Late events after a take-over | every one is shown with its amount |
| Payments corrected after 2 minutes | listed with the approver |
| Stock gap | a counted item more than 5 % below the expected level |
Each signal line shows: the number in DH, the period, the person, and a link to the events. The weekly staff view shows
each person their own numbers only; the owner sees the table for everyone.

## 5. Exports
- CSV: sales lines, payments, Z by bank, stock movements, dose readings (UTF-8 with BOM for Excel, `;` separator,
  decimal comma).
- Sage 100 "journal des ventes", one file per period: tab-separated, no header row, columns journal code, date
  `DD/MM/YYYY`, general account, third-party account, document number, label, debit, credit. Account codes come from
  settings, filled with the client's accountant; the onboarding suggests PCGE accounts (5161 caisse, 5141 banque, 4455
  TVA facturée, a 71xx sales account) marked "à valider par votre comptable".
- The accountant role downloads exports; nothing is sent automatically to third parties.

## 6. Signals for BrandHub (D9)
The control API report (docs/09 §2) carries flags only: `lossAboveThreshold2w`, `emptyHours` (hours with < 20 % of the
day's average revenue while open), `manualSupplierOrders` (Resto: goods received without purchase orders), `secondSite`
(the owner tapped « Ajouter un établissement » beyond the sites his licence allows).
Cross-client benchmarks (for example "average ticket of Casablanca cafés") are V2, opt-in only, written into the DPA,
and computed from aggregates that cannot identify a client.
