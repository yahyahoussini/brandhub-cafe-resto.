# The 4–5 September 2026 "Restaurant OS" plan — what this pack keeps and what it changes

Sources: BrandHub Restaurant OS Plan (4 Sep), Restaurant OS Master Plan (4 Sep, supersedes the others where they differ),
Restaurant OS Build Guide, Restaurant OS Claude Code Runbook (5 Sep), BrandHUB Product Design System (5 Sep),
BrandHUB Go-Live and Client Operations (5 Sep), Guide BrandHUB (client guide), Moroccan Café Innovation Map (5 Sep).

## Kept
- **Dates and gates.** Pilot 1 in a Casablanca café on Mon 30 Nov 2026; pilots 2–5 from Mon 4 Jan 2027; Gate 2 on Fri
  15 Jan 2027 (pilot 1 ≥ 5 weeks, ≥ 95 % capture against the paper count, no lost payment, support ≤ 6 h/week); first
  invoices Mon 1 Feb 2027; Ramadan freeze 8 Feb–9 Mar 2027; Gate 3 on Wed 30 Jun 2027 (≥ 40 paying sites, churn ≤ 4 %).
  A slip of more than a week triggers a written note of what is cut.
- **Prices.** 199 MAD HT (cafés) and 399 MAD HT (restaurants) per site per month; annual −15 %; extra register +49 DH;
  pilots free for 3 months; resellers 20 % recurring; "Above 300 DH you compete with a one-time Avito pack".
- **Moroccan features** (Innovation Map): dose counter, evening report, visible "mode panne" first; then Borsat, Kredi,
  compliance pack, Mode Ramadan and Aïd order book, coût de la tasse, serveur rend la caisse, rendement par table, Mode
  Match, direct WhatsApp/QR ordering.
- **Order events and money** (Build Guide): client UUIDv7 ids, append-only events, one owner device per order, integer
  centimes, TTC prices, VAT once per line, receipt numbers in blocks (then 200, now 500), "ANNULÉ" never renumbered,
  price snapshot on the line, dead letters "never silently dropped".
- **Security rules**: 4–6 digit staff PINs checked locally with lockout; TOTP for owners; 256-bit device tokens, hashed
  and revocable; manager PIN for voids after sending, refunds, discounts above the cap (cashier 10 %) and reprints after
  the first.
- **Operations**: activation link + 6-digit code valid 72 h; invitation-only in year one; the setup visit (60–90 min, the
  unplug-the-router drill, training 10/5/10 min); support on one WhatsApp number 08:00–00:00; releases Tuesday 03:00–06:00,
  never during service or Ramadan evenings.
- **Design system**: fonts, colours, 2 px radius, 48 px targets, light till / dark kitchen, Arabic rules.
- **Business rules**: never sell hardware; never become the payment facilitator; bill BrandHub's own clients by transfer
  or cash first; never claim a tax certification.

## Changed (and why)
| 4–5 Sep plan | This pack | Why |
|---|---|---|
| One product "BrandHUB", tiers Essentiel/Resto/Multi | Two products: BrandHub Café and BrandHub Resto (D1) | Yahya's decision on 24 Sep 2026 |
| TypeScript, Next.js 15, Prisma, Postgres with RLS | JavaScript + JSDoc, Preact PWA, Cloudflare Workers, one SQLite Durable Object per client (D17–D19) | Yahya's JavaScript-only rule; no server to maintain; same provider as brandhub.ma |
| Hetzner CX43 or Oracle Always Free | Cloudflare Workers Paid ($5/month) | cost and maintenance for a solo founder |
| Offline on one device; LAN hub in V3 | Station from Resto V1 and for cafés with waiters (D24) | multi-device offline is required for kitchens; CLYO has it |
| "Serveur rend la caisse" in V2 after interviews | Café V1 (D5) | Sagatec and CLYO already sell per-server banking |
| "POS never blocked for non-payment" vs read-only/suspended "blocked" (contradiction) | The till never stops during a shift; statuses apply at the next shift opening (D14) | keeps the reputation rule and still enforces payment |
| Multi-branch in V2/V3/Jul–Aug 2027 (contradiction) | Multi-site in Resto V2 (D6) | one date |
| WhatsApp via a BSP vs direct Cloud API (contradiction) | Direct Cloud API, email fallback (D35) | fewer intermediaries |
| Receipt number on void unclear | A number is taken only at close; voids have none (D22) | settles the open question |

## Still open from the September plan
- The legal entity that invoices clients (SARL AU recommended in the Master Plan vs the existing auto-entrepreneur ICE).
- OMPIC check of "BrandHUB"; trademark classes 9, 35, 42.
- MOWAKABA eligibility: competitors advertise it, but a CBO page says the programme targets industrial firms — not confirmed.
- Payzone, Fatourati and Chari fees and eligibility for collecting BrandHub's own subscriptions.
- The Gate 1 result (18 Sep 2026 interviews) is not recorded anywhere: Yahya records it before prompt 00.
