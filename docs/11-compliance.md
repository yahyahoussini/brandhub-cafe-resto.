# 11 · Compliance — receipts, invoices, VAT, local tax, personal data

Not legal or tax advice: every item marked **to confirm** is checked with the client's accountant or a lawyer before the
first paying client. Sources and dates: `docs/research/facts-2026-09.md §A`.

## 1. Receipts (ticket de caisse)
Law 31-08, art. 4: the supplier must deliver "une facture, quittance, ticket de caisse ou tout autre document en tenant
lieu". BrandHub receipts always print: trade name and legal name · address · ICE · IF · RC · patente (TP) · ticket number
(`C1-000123`) · date and time · cashier or waiter · lines with quantities and prices TTC · total TTC · VAT included by
rate · tenders and change · "Merci · شكرا لزيارتكم". Optional: CNSS number, phone, footer lines. The exact minimum list
for consumer tickets is **to confirm** with the accountant; printing more identifiers is allowed.
A voided order never prints as a receipt; a pre-bill prints "NOTE — ne vaut pas ticket de caisse". A refund is a credit
note (negative ticket) with its own number and a reference to the original ticket.

## 2. B2B invoices (facture)
Issued online from one or several closed tickets (or a month of Kredi account), in a yearly gapless series per client
(`F-2027-000123`, D22). Mentions (CGI art. 145 as reported by secondary sources): seller's name, address, IF, TP, RC, ICE;
buyer's name, address and ICE; number; date; description, quantity, unit price HT; VAT rate and amount per rate; total
TTC; payment method. Sources disagree on whether the buyer's ICE is mandatory: the form always asks for it (**to
confirm**). Stored as `invoice.issued` plus a PDF in R2; never edited — a correction is a credit invoice.

## 3. Integrity, and what we never claim
Every stored event is chained (`journal.js`); `/gestion → Réglages → Intégrité` runs `verifyChain` over a period and
prints the result. This is an internal control. Morocco has no certification scheme for POS software as of September
2026, so the products, the sales pages and the staff never say "certifié DGI", "conforme DGI", "agréé" or similar (D39).

## 4. E-invoicing readiness
Legal basis: CGI art. 145-IX (Finance Law 2018): taxpayers must use "un système informatique de facturation qui répond aux
critères techniques déterminés par l'administration". In April 2026 the tax director announced a phased launch during
2026 (Médias24); Sage (May 2026) describes a clearance model with UBL, a qualified electronic signature and a free
portal for small firms; phases reported by Le360: B2B first, about 1,655 companies
above MAD 200 m of turnover in 2026, small and mid-size companies 2027–2028, very small companies after 2028; B2C later,
with retail and restaurants "not planned at this stage". The implementing decree was not published at the date of our
check. The invoice model maps one to one to UBL 2.1 (prompt 46 exports it); connection to the DGI platform waits for the
published technical specifications.

## 5. VAT (D40)
Default 10 % on food and drinks sold for on-site consumption (secondary 2026 sources and the DGI return's line for
"vente de denrées ou de boissons à consommer sur place, réalisées dans les restaurants"). The standard rate is 20 %.
Takeaway and delivery rates are **to confirm**: settings `taxes.byMode` stay empty until the accountant confirms, and the
onboarding shows the question. Products can carry their own rate (for example exempt or 20 % items). The VAT report gives,
per period and per rate: TTC, VAT, HT, for the client's own declaration. `data/tax-presets.json` holds the defaults and
their sources.

## 6. Taxe sur les débits de boissons (D41)
Law 47-06, art. 64–67: paid by operators of cafés, bars and tea rooms, on receipts excluding VAT from drinks consumed on
site; rate 2 %–10 % set by each commune (Casablanca 8 %, Salé 5 %); declaration within 30 days of starting and an annual
declaration before 1 April; payment every quarter before the end of the following month; Casablanca's late penalty 15 %
plus 0.5 % a month, minimum MAD 500. The compliance pack reports drinks revenue HT per quarter (categories carry
`taxClass: drink | food`) and the amount at the configured rate, and reminds the owner of the due dates. Whether a given
restaurant is liable is **to confirm** with its accountant.

## 7. Staff hours
The hours sheet (clock-ins per person per month) is what the accountant needs for CNSS declarations; the products do no
payroll and no declaration. Time and attendance is HR data: the employer (the client) handles its CNDP formality for HR
processing. Biometric clocking is excluded (CNDP deliberation 478-2013): badge or PIN only (D32).

## 8. Personal data (Law 09-08, D42)
- **Roles.** The client is the controller of its customers' and staff data; BrandHub is the processor. The DPA is
  accepted at activation (click-wrap: version, time, account recorded). BrandHub is controller only of its own client
  relationship data (owners' contacts, invoices).
- **Client formalities** (template in onboarding): simplified declaration for customer management (form F-214,
  deliberation 32-2015) when Kredi, loyalty or delivery stores customers; prior authorisation for HR processing; transfer
  formality (form F-118) because data is processed abroad: Cloudflare (Durable Objects, D1 and R2 in the EU
  jurisdiction), Meta (WhatsApp messages) and Resend (fallback emails) are BrandHub's processors. **To confirm** with a
  lawyer who files the transfer formality (controller or processor) and the wording of the templates.
- **Consent.** A customer's phone number is stored only with his consent, recorded with the text shown and the time
  (Kredi, stamp card, delivery). Every WhatsApp message to a customer (Kredi reminder) needs that consent; marketing
  messages are out of scope (D9).
- **Rights.** Access, correction, objection and erasure from the back office; erasure replaces personal fields with an
  anonymous id and keeps the sales.
- **Security.** docs/08 §6. Penalties under the law range from MAD 10,000 to 200,000 and prison for some breaches
  (CNDP list), which is why these rules are not optional.

## 9. Consumer information (Law 31-08)
Prices are shown TTC in dirhams, visible and readable (art. 3 and 5; application decree of 2013). The QR menu and event
menus (Mode Match) show TTC prices and any mandatory service charge in the price. A minimum spend or a deposit for an
event night is displayed before booking.

## 10. Retention (D43)
Sales events and Z reports: 10 years (4 Sep plan, **to confirm** with the accountant). Logs: 90 days. Login and auth logs:
90 days. Customer personal fields: until erasure is requested or 3 years without activity.

## 11. To confirm before the first paying client
1. Takeaway and delivery VAT rates. 2. Minimum mentions on consumer tickets. 3. Buyer's ICE on B2B invoices. 4. Retention
period. 5. Who files the CNDP transfer formality; the DPA and privacy texts. 6. Débit-de-boissons liability for
restaurants. 7. The e-invoicing phase of each client that issues B2B invoices.
Before Resto V1.1 (prompts 37–40): 8. The oral consent text read to a customer on the phone. 9. What an online order page
must show before the order (Law 31-08 on distance selling). 10. VAT when a deposit is received, and on a deposit kept
after a no-show; the VAT rate of the delivery fee. 11. Whether WhatsApp messages to a client's customers may be sent
from BrandHub's number (Meta's opt-in rules); if not, they go by click-to-chat from the client's phone.
Before V2 and the digital receipt: 12. Whether a digital receipt (QR link, kept 90 days) may replace the paper ticket when
the customer asks (Law 31-08 art. 4). 13. The client's CNDP formality for video surveillance when the camera link puts
ticket text and staff first names on the recordings (prompt 42).
