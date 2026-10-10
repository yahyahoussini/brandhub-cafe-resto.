# Decisions — BrandHub Café and BrandHub Resto

50 decisions, each with its reason. They replace the 4–5 September 2026 "Restaurant OS" plan where they differ
(`docs/research/prior-plan-digest.md` lists what was kept). To change one: edit it here first, then tell Claude Code
"Apply the change to Dnn". Research behind the facts: `docs/research/market-2026-09.md` and `docs/research/facts-2026-09.md`.

---

## A. Products and business

### D1 · Two products, one kit
**Decision.** BrandHub Café and BrandHub Resto are two products: two domains, two Workers, two databases, two price
lists, two release trains. Inside one repository, a private kit (`packages/kit*`) holds the invisible plumbing: business
rules, sync, printing, Station client, licence, UI parts. `apps/cafe` never imports `apps/resto` and the reverse.
**Why.** A café owner and a restaurateur buy different things; one product with tiers makes the café pay for kitchen
screens. Writing printing, offline sync and the device hub twice would double every device bug for a one-person team.
**Rejected.** One product with three tiers (4 Sep plan). Two repositories with copied code (+30–40 % build time).

### D2 · Names and domains
**Decision.** BrandHub Café on `cafe.brandhub.ma`, BrandHub Resto on `resto.brandhub.ma`. CLYO Systems is an internal
reference only: its name, screenshots and texts never appear in the product or its marketing.
**Why.** CLYO is a live French brand resold in Morocco; BrandHub is Yahya's brand and the entity that sells.

### D3 · Who belongs to which product
**Decision.** If a kitchen cooks to order more than half of the revenue, the client belongs to Resto; otherwise Café.
Coffee shops, salons de thé, counter snacks and pâtisseries with a salon are Café. Restaurants, pizzerias, fast food
with a grill and caterers are Resto.
**Why.** One simple rule for sales conversations; the modules follow the operating model, not the sign above the door.

### D4 · Order and dates
**Decision.** Café first: pilot 1 in a Casablanca café on Mon 30 Nov 2026, features frozen on Fri 20 Nov. Café V1.1
before 1 Feb 2027 (Ramadan 1448 starts about 8 Feb). Resto built from 25 Jan 2027, pilot 1 on 12 Apr 2027, on sale
by 30 Jun 2027 (Gate 3).
**Why.** Pilot 1 was already a café in the 4 Sep plan; the café needs fewer modules and is the larger market.

### D5 · Café scope by version
**Decision.** V1: counter till, waiter banking, tables (salle/terrasse), shifts and Z, dose counter, light stock,
owner back office, evening report, visible offline. V1.1: Borsat tip pool, Kredi tabs and staff advances, compliance
pack and digital receipt, Mode Ramadan, coût de la tasse and supplier prices, stamp card. V2: Mode Match, yield per
table, camera link, order book. Module keys: `data/modules.json`.
**Why.** V1 is what the pilot pitch promises ("vous voyez vos doses, vous recevez vos chiffres chaque soir, ça marche
sans internet") plus how Moroccan cafés really move cash. Per-waiter banking moves up from V2 because Sagatec ("Z par
serveur") and CLYO ("vendeur flottant") already sell it.

### D6 · Resto scope by version
**Decision.** V1: Station, floor plan, handheld ordering, kitchen screens and printers by station, bills, menu with
set menus and menus by time of day, recipes and food cost, stock and suppliers, staff and time clock, Borsat tip pool,
compliance pack, evening report. V1.1: phone and delivery orders with customer accounts (Kredi), direct ordering
(WhatsApp/QR), reservations and Mode Match, order book, menu engineering. V2: delivery-app inbox (Glovo after
approval), multi-site, camera link.
**Why.** The kitchen path and food cost decide a restaurant's switch; delivery apps need partner approval first.

### D7 · Prices to test (pilots 2–5, confirm at Gate 2)
**Decision.** Café 199 MAD HT per site per month (1 till, 5 waiter phones, 1 bar screen, unlimited staff). Resto
399 MAD HT per site per month (Station, 2 tills, unlimited handhelds and kitchen screens). 12 months prepaid −15 %
(2,030 / 4,070 MAD HT). Extra till +49 MAD/month. Setup 990 MAD HT (Café) and 2,490 MAD HT (Resto, with recipe import).
Month to month, cancel any time, free data export. Pilots: free for 3 months.
**Why.** Local cluster 149–499 DH/month; one-off packs 2,790–7,800 DH; owners distrust lock-in. The price is anchored
to the leak the product reveals (a vendor's client quotes 2,000–4,000 DH lost per month per point of sale).

### D8 · Payment and access
**Decision.** Yahya collects cash or bank transfer, records it in admin.brandhub.ma, and admin sets the plan through
the control API (D28). The products never take card payments from clients and never store bank details.
**Why.** Yahya's operating rule; Stripe has no Moroccan licence (4 Sep plan).

### D9 · The data opens BrandHub's services
**Decision.** Each product computes signals Yahya reads monthly in the report endpoint (D28): weak visibility (few new
customers), empty hours, loss above threshold for two weeks, manual supplier orders, a second site. BrandHub offers the
matching service (Google profile and reviews, campaigns, loss review, automation, dashboards). No automated sales
message is ever sent to a client's customers.
**Why.** One-Man Empire: the software sells the services; the owner sees his own numbers first.

### D10 · No hardware sales
**Decision.** BrandHub recommends reference kits (`docs/05-devices.md §9`) that owners buy from Moroccan shops, and
installs them. No stock, no hardware margin, no hardware warranty.
**Why.** 4 Sep plan rule; hardware support would eat the founder's time.

---

## B. UX and UI

### D11 · Languages
**Decision.** French by default, Arabic (right to left) per user, English later. Staff-facing words follow what staff
say (`data/glossary.json`); Darija appears in WhatsApp messages and the quick card, not in the app's menus. Western
digits by default, Arabic-Indic digits as a per-user option.
**Why.** Staff switch languages; menus stay predictable; WhatsApp is where Darija is natural.

### D12 · Speed budgets
**Decision.** A coffee is sold in at most 2 taps; payment with the exact amount takes 1 tap; product tiles are at least
96 × 96 px and every target on the till, handhelds and kitchen screens at least 48 px; a sent order reaches its kitchen
screen within 2 s through the Station; the till route loads in under 3 s on a 2,000 DH Android tablet.
**Why.** Café tickets average 8–15 DH; if the till is slower than paper, staff go back to paper.

### D13 · Numbers, not accusations
**Decision.** Loss signals read "Écart : −35 DH", never "vol". Staff see their own numbers; managers and owners see
everyone's. Every signal links to the events behind it.
**Why.** Staff accept a system that protects them; the owner gets facts he can discuss calmly.

### D14 · The till never stops during a service
**Decision.** A change of access status (grace, read-only, suspended) or a licence that expires offline applies at the
next shift opening, never during an open shift. Read-only: no new shift, back office read-only, export available.
Suspended: same, with a message to call BrandHub.
**Why.** Blocking a café mid-service is a reputation-ending event in a word-of-mouth market (4 Sep plan); the
next-shift rule still enforces payment. The Master Spec's generic read-only rule ("no new records") maps to "no new shift".

### D15 · Offline is visible
**Decision.** A sync badge on every staff screen: green "Synchronisé", orange "N en attente", red after 10 minutes
without contact; a printed proof at reconnection ("12 tickets synchronisés, 0 perdu"); an unplug-the-router drill at
every installation.
**Why.** Owners trust what they can see (Innovation Map feature 12).

### D16 · Design system
**Decision.** The BrandHUB Product Design System v1 (`docs/07-design-system.md`): DM Sans / DM Serif Display / DM Mono,
IBM Plex Sans Arabic and Noto Kufi Arabic, brand blue #1A1BBF, 2 px radius, light till, dark kitchen screen. Fonts are
bundled with the app so it works offline.
**Why.** Already designed and contrast-checked for POS use on 5 Sep 2026.

---

## C. Architecture and data

### D17 · JavaScript only
**Decision.** Every source file is JavaScript (ES modules). Types come from JSDoc comments, checked with
`tsc --checkJs --noEmit` in strict mode. No `.ts` or `.tsx` file, no TypeScript syntax.
**Why.** Yahya's rule for all code; JSDoc keeps type safety without a second language.

### D18 · Front end
**Decision.** Preact with `@preact/signals`, built by Vite as a PWA, one app per product, with routes for the till
(`/caisse`), the waiter phone (`/serveur`), the bar or kitchen screen (`/ecran`), the back office (`/gestion`) and the
account pages (`/connexion`, `/activer`, `/appairer`). Tailwind CSS 4 with logical properties only.
**Why.** Small and fast on cheap tablets; the same stack as brandhub.ma's islands.

### D19 · Cloud
**Decision.** One Cloudflare Worker per product serves the app and the API. Each client's data lives in its own
Durable Object with SQLite storage, created in the EU jurisdiction (`namespace.jurisdiction("eu")`). One D1 database per
product, created in the EU jurisdiction, is the registry (tenants, owners' logins, control-request ids, report
schedule). R2, in the EU jurisdiction, holds files. Cron triggers run the evening reports and nightly exports. Workers
Paid ($5/month) from prompt 04.
**Why.** No server to maintain; each client isolated by construction; 30-day point-in-time recovery built in; same
provider as brandhub.ma. Workers Free allows 10 ms of CPU per request, too little for password hashing.
**Rejected.** Hetzner/Oracle VPS with Postgres and row-level security (4 Sep plan): patching, backups and monitoring
fall on the founder.

### D20 · Events, never edits
**Decision.** Every change is an event, created on the device with a UUIDv7 id, never updated or deleted
(`docs/03-domain-model.md §4`). Money aggregates (order, bank, tip pool) have one writer at a time and a strict seq;
ownership moves by `transferred` or by a manager-approved `taken_over`. Movements (stock, Kredi, clock punches) commute.
Operational marks (kitchen status, table cleaning, heartbeats, settings fields) are last-writer-wins. Each stored event
is chained by SHA-256 (D39).
**Why.** Offline devices can never overwrite each other's money; the history explains every number.

### D21 · Money
**Decision.** Integer centimes; prices TTC; VAT computed per line after spreading order discounts, rounded half away
from zero once per line; quantities in thousandths. Implemented in `packages/kit/src/money.js` and `order.js`.
**Why.** Exact totals everywhere, including weight-priced items later.

### D22 · Receipt numbers
**Decision.** Each till has its own series ("C1", "C2"), consumed from blocks of 500 reserved from the cloud or the
Station, a new block requested below 150. A number is assigned only when an order closes; a voided order has none but
stays in the void report. A reset till declares the rest of its block abandoned. B2B invoices use a yearly series per
client (`F-2027-000123`), issued online.
**Why.** Gapless numbering offline without coordination between tills.

### D23 · Device storage
**Decision.** IndexedDB through Dexie on tablets and phones (catalog, own events, outbox, open orders, today's data);
the service worker caches the app shell and fonts and never caches `/api/*`.
**Why.** Proven in browsers; small; the same pure rules run on it.

### D24 · The Station
**Decision.** A Windows app (Electron, which embeds its own Node, and better-sqlite3 rebuilt for it) on the counter PC
or a mini-PC wired to the router. It stores today's events, relays between devices on the local network and the cloud,
and drives network printers, the cash drawer, the camera overlay and the time clock. Required for every Resto client and
for cafés with waiter phones or network printers. Devices reach it with `fetch` over HTTP on the local network (Chrome's
Local Network Access permission), long-polling for updates.
**Why.** A web page cannot talk to a network printer; a kitchen cannot run offline without a local relay; CLYO's
handhelds work without Wi-Fi.

### D25 · Sync ladder
**Decision.** Device → Station (if present) → cloud, the same push and pull at both hops: push batches of at most 200
events, pull by position (`docs/04-sync-protocol.md`). News come by long-poll from the Station (Chrome's Local Network
Access covers `fetch`, not WebSockets) and by hibernated WebSocket nudges from the cloud. A device keeps each event until
the cloud has it, so it can change hop at any moment without a gap. A device without a Station syncs with the cloud.
**Why.** One protocol to test; the Station is optional for the smallest cafés; a hibernated WebSocket bills no duration
while a held request would.

### D26 · Time
**Decision.** Dates use the IANA zone `Africa/Casablanca` (UTC+1, and UTC+0 during Ramadan), never a fixed offset.
A business day ends at 05:00 by default, so a café closing at 01:30 reports one day.
**Why.** Morocco changes its offset for Ramadan; reports must not split a night in two.

### D27 · Licence on devices
**Decision.** admin.brandhub.ma signs the licence (Ed25519, licence key pair); the product stores it; devices verify
it with the public keys, keep a trusted clock (never earlier than the latest time seen) and work offline until the grace
date (D14 applies at shift opening). Implemented in `packages/kit/src/licence.js`.
**Why.** Master Spec §5; a device or a product server cannot forge access.

### D28 · Control API v1
**Decision.** Exactly the Master Spec contract on each product: `POST /api/control/v1/tenants`, `PUT …/{id}/subscription`,
`POST …/{id}/suspend` and `/restore`, `POST …/{id}/owner-reset`, `GET /api/control/v1/report`, `GET /api/control/v1/health`,
signed with the command key (Ed25519, timestamp ±5 min, request id). Until admin.brandhub.ma exists, `tools/admin.mjs`
makes the same signed calls from Yahya's computer. Details: `docs/09-control-api.md`. One maintenance endpoint sits
outside the contract: `POST /api/admin/restore` (point-in-time restore, signed with the command key, docs/12 §8).
**Why.** One contract for every BrandHub SaaS; the products keep working if admin is down.

---

## D. Devices and integrations

### D29 · Printing
**Decision.** ESC/POS (`packages/kit/src/escpos.js`). Latin text in Windows-1252; Arabic always rendered to a bitmap and
sent as a raster image. Transports: WebUSB and Web Serial over Bluetooth from a tablet; TCP 9100, USB and COM ports from
the Station. The drawer opens through the printer (ESC p).
**Why.** Arabic code pages differ between models and do not join letters; web pages cannot reach port 9100.

### D30 · Hardware test before recommendation
**Decision.** No kit is recommended before it passes `docs/05-devices.md §8`: French and Arabic receipt, kitchen ticket,
drawer, 50 tickets in a row, and the unplug-the-router drill.
**Why.** "If Bluetooth fails, choose another tablet, not another architecture" (4 Sep plan).

### D31 · Card terminals and Maroc Pay
**Decision.** No integration with CMI or NAPS terminals, tap-to-phone apps or Maroc Pay: the tender is recorded with
its reference (last digits or transaction code) and reconciled against the terminal's batch in the Z report.
**Why.** No public API or SDK exists (September 2026 check).

### D32 · Time clock
**Decision.** Clock-in by PIN on the till or handheld (V1.1 in Café, V1 in Resto); ZKTeco clocks in badge or PIN mode
push to the Station (ADMS protocol). Never fingerprints or faces.
**Why.** CNDP deliberation 478-2013 rules out biometrics for time and attendance.

### D33 · Camera link (V2)
**Decision.** The Station sends each ticket's text, voids and drawer openings to the NVR's POS overlay (Hikvision
"Universal Protocol" over TCP/UDP), so a recording can be searched by ticket.
**Why.** Owners already have Hikvision recorders; the feature needs no new hardware.

### D34 · Android shell only if needed
**Decision.** A Capacitor 8 shell for all-in-one Android tills (Sunmi, iMin) is built only if the hardware test shows
the web app cannot print on them (prompt 45).
**Why.** One more app to publish and update; the test decides, not opinion.

### D35 · WhatsApp and email
**Decision.** The evening report, Kredi reminders and tip statements go through the WhatsApp Cloud API (Meta) with
approved utility templates, from BrandHub's WhatsApp Business number, only to people who opted in; email (Resend) is the
fallback. Messages are counted per client. Before prompt 22, Meta's opt-in rules are checked for messages sent from
BrandHub's number to a client's customers (docs/14 task 23); if they are not allowed, those reminders go by
click-to-chat from the client's own phone.
**Why.** WhatsApp is where owners read; from 1 Oct 2026 Morocco has its own rate card and every message is charged
(about $0.023 per utility message per a reseller), so counting per client keeps the cost visible.

### D36 · Delivery apps
**Decision.** Direct orders by WhatsApp and QR first (Resto V1.1). Glovo through its Partner API (Orders API, Stock &
Price API) only after Glovo approves; other apps when they offer an API.
**Why.** Glovo requires commercial approval; direct orders cost no commission.

---

## E. Security and compliance

### D37 · Accounts and devices
**Decision.** Owners and managers: email + password (PBKDF2-SHA-256, 100,000 iterations, the most Cloudflare Workers'
WebCrypto accepts; the count is stored with each hash so it can be raised later) + TOTP. First login through the
activation link and 6-digit code (72 h) created by the control API. Staff: 4–6 digit PIN checked on the device, 5 tries
then 15 minutes locked. Devices: paired by QR code, 256-bit token stored hashed, revocable. Details: `docs/08-security.md`.
**Why.** TOTP carries most of the protection; Workers refuse PBKDF2 above 100,000 iterations (workerd issue 1346, open
in September 2026).

### D38 · Permissions
**Decision.** Roles owner, manager, cashier, waiter, kitchen, accountant, and driver (added with deliveries in prompt 37);
the default matrix and approval rules live in `data/permissions.json` and each client can tighten or relax them in
settings (never below the floor marked there).

### D39 · Receipts and the journal
**Decision.** Receipts carry the mentions of `docs/11-compliance.md §1` in French and Arabic. B2B invoices carry the
client's ICE. The chained journal (`packages/kit/src/journal.js`) is an internal integrity control; the product never
claims "certifié DGI" or any certification.
**Why.** We found no POS certification scheme in Morocco (September 2026); e-invoicing is announced for large B2B
companies first, and its decree was not published at our check.

### D40 · VAT defaults
**Decision.** 10 % on on-site food and drink sales by default; per-product and per-sale-mode overrides; takeaway and
delivery rates confirmed with the client's accountant during onboarding (`data/tax-presets.json`).
**Why.** Secondary sources and the DGI return list 10 % for on-site restaurant sales; takeaway is not confirmed.

### D41 · Débit-de-boissons tax
**Decision.** The compliance pack reports drinks revenue HT per quarter and applies the commune's rate (Casablanca 8 %,
Salé 5 %, others 2–10 %, set in settings).

### D42 · Personal data (Law 09-08)
**Decision.** The client is the controller, BrandHub the processor (DPA at activation). Customer phone numbers (Kredi,
loyalty, delivery) need recorded consent; staff hours are HR data kept to the minimum. Personal fields never enter the
event log: they live in erasable tables (docs/03 §6). The client files its own CNDP declaration (template in
onboarding); who files the transfer formality for hosting and processing abroad (Cloudflare EU, Meta, Resend) is to be
confirmed with a lawyer (docs/11 §8).

### D43 · Retention
**Decision.** Sales events 10 years; customer personal fields, kept outside the event log, erased on request or after
3 years without activity (events keep only the `cus_…` id); logs 90 days.

---

## F. Build and operations

### D44 · Repository and tools
**Decision.** npm workspaces; tests with `node:test` (units), `@cloudflare/vitest-pool-workers` (Worker and Durable
Object tests, JavaScript files, also run by `npm test`) and Playwright (end to end, French and Arabic, 360 px and tablet
sizes); GitHub Actions; Wrangler for deploys; electron-builder for the Station installer.
**Changed 10 Oct 2026** (prompt 00 finding 5): Worker tests need the Workers runtime, which `node:test` does not give.

### D45 · Environments
**Decision.** Local (Wrangler dev + Station dev), staging on `workers.dev`, production on `cafe.brandhub.ma` and
`resto.brandhub.ma` after the coming-soon Worker hands the subdomain over (brandhub.ma pack, runbook §9).

### D46 · Releases
**Decision.** Once a product has a live client: releases on Tuesday 03:00–06:00; never Friday afternoon, never
11:30–15:00 or 19:00–00:00, never on Ramadan evenings; no Café release 8 Feb–9 Mar 2027. Before its first client uses it
(the pilot release included), a product may be deployed at any time. The Station updates only when its shifts are closed.

### D47 · Support
**Decision.** One WhatsApp Business number, 08:00–00:00, target answer within 1 hour during pilots; incidents posted
within 15 minutes; remote access to a client's data only after a written request.

### D48 · Gates
**Decision.** Gate 2 (15 Jan 2027): pilot 1 ran 5 weeks with ≥ 95 % of sales captured against the paper count, no lost
payment, support ≤ 6 h/week. Gate 3 (30 Jun 2027): ≥ 40 paying sites, monthly churn ≤ 4 %, Resto on sale.

### D49 · Backups
**Decision.** Durable Object point-in-time recovery (30 days) plus a nightly export of each client's new events to R2,
kept 10 years; a restore drill before every pilot.

### D50 · Performance budgets
**Decision.** Till and handheld routes: ≤ 150 KB of JavaScript gzip on first load, ≤ 100 ms per tap on the reference
tablet; kitchen screen ≤ 2 s from send to display via the Station; Worker API p95 ≤ 300 ms from Casablanca.
