# 02 · Architecture — components, flows, deployment, costs

## 1. Components
| Component | Runs on | Holds | Does |
|---|---|---|---|
| Product app (PWA) | Chrome on Android tablets and phones; Chrome/Edge on the counter PC | Dexie store: catalog, settings, licence, its own events and outbox, open orders, today's data | till, waiter phone, bar/kitchen screen, back office; prints over WebUSB or Web Serial when no Station |
| BrandHub Station | Windows 10/11 counter PC or mini-PC (Electron, with its embedded Node) | SQLite: every event of the last 7 days, catalog, open orders, banks, kitchen tickets, receipt blocks | LAN relay between devices, cloud relay, network/USB/COM printing, drawer, kitchen ticket printing, time clock receiver, NVR overlay (V2) |
| Product Worker | Cloudflare (one per product: `brandhub-cafe`, `brandhub-resto`) | nothing itself | serves the PWA (static assets), `/api/*`, the control API, cron jobs |
| TenantStore | Cloudflare Durable Object with SQLite, EU jurisdiction, one per client | the client's full event log (chained), projections, settings, owners, devices, receipt ledgers | validates and stores events, answers sync, runs reports, builds the evening report |
| Registry | Cloudflare D1, one per product | tenants (id, name, status mirror, time zone, report time), owner logins (email → tenant), control request ids (24 h), message counts | routing, control API idempotency, cron schedules |
| Files | Cloudflare R2, one bucket per product | menu photos, delivery-note photos, dose-counter photos, exports, nightly event exports | presigned upload/download through the Worker |
| Messaging | Meta WhatsApp Cloud API, Resend | — | evening report, reminders, statements; email fallback |
| Control | `tools/admin.mjs` now, admin.brandhub.ma later | the private keys (never in the product) | signed control calls, signed licences |

## 2. Repository layout
```
package.json                 npm workspaces: packages/*, apps/*
packages/kit/                pure rules (provided): money, ids, order, bank, receipts, escpos, timezone, crypto, licence, control-signature, journal
packages/kit-web/            browser: db (Dexie), sync-client, station-client, print (webusb, webserial, raster), i18n, pin, ui (Preact components), licence-check
packages/kit-worker/         Cloudflare: src/tenant-store (base Durable Object class), src/schema.sql + migrations, sync-api, auth-api, devices-api, control-api, reports, messaging, cron
apps/cafe/worker/            index.js (routes), cafe-store.js (extends TenantStore), cron.js, wrangler.jsonc
apps/cafe/web/               Vite + Preact PWA: src/routes/{caisse,serveur,ecran,gestion,connexion,activer,appairer}
apps/resto/worker/           same structure, resto-store.js
apps/resto/web/              same structure plus plan-de-salle, cuisine, recettes, achats
apps/station/                Electron: main/ (server, db, relay, printers, adms, nvr), renderer/ (status window), print-renderer/
tools/admin.mjs              signed control API calls and licences (keys in ~/.brandhub/keys)
tools/hardware-test/         printer and drawer test scripts, the unplug drill checklist
data/                        JSON sources shared by apps (templates, permissions, plans, modules, printers, taxes, glossary)
docs/                        specifications and STATUS.md
prompts/                     the build
```

## 3. Flows
**A. Small café, one tablet, no Station.** The till writes events to Dexie, prints over WebUSB or Bluetooth, pushes to
the cloud every 3 s when online. Offline: sells, prints, keeps receipt numbers from its block, shows "N en attente".

**B. Café with waiters (Station).** Phones and the till push to the Station on the local network; the Station prints the
bar ticket on the bar printer and relays to the cloud. Offline: everything continues inside the café; the cloud catches
up when the Station reconnects. Without a Station, waiter phones sync through the cloud and work alone when offline.

**C. Restaurant (Station required).** Handhelds send orders to the Station; the Station prints kitchen tickets by station
and feeds the kitchen screens (long-poll); tills settle bills. The cloud receives everything through the Station.

**D. Owner's phone.** `/gestion` talks only to the cloud (it is never on the venue's network). When the venue is offline,
the owner sees data up to the last sync and a "dernière synchro" time.

**E. Control call.** `tools/admin.mjs` (later admin.brandhub.ma) signs `PUT /api/control/v1/tenants/{id}/subscription`;
the Worker verifies the signature and the request id, the TenantStore stores the new licence; devices fetch it at their
next pull and apply it at the next shift opening (D14).

**F. Evening report.** A cron every 15 minutes asks the registry which clients reach their report time in the window; the
Worker calls each TenantStore, which builds the report from its projections and sends it (WhatsApp, else email).

## 4. Deployment (per product)
`apps/<product>/worker/wrangler.jsonc` declares:
- `name` (`brandhub-cafe` or `brandhub-resto`), `main`, `compatibility_date` (the day of prompt 04), `compatibility_flags: ["nodejs_compat"]` only if a dependency needs it;
- `assets` (the built PWA, `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*", "/r/*"]`), with a
  `_headers` file in the build output so every static route — `/caisse`, `/menu/:slug`, `/commande/*`, `/reserver/*`
  included — carries `X-Robots-Tag: noindex` and the headers of docs/08 §7 (the Turnstile exception of prompt 38 on
  `/commande/*` and `/reserver/*` only);
- `durable_objects.bindings`: `STORE` → `CafeStore` / `RestoStore`, plus `migrations` with `new_sqlite_classes`;
- `d1_databases`: `REGISTRY` (created with `--jurisdiction eu`); `r2_buckets`: `FILES` (an EU-jurisdiction bucket; the
  binding declares `jurisdiction: "eu"`); `triggers.crons`: `["*/15 * * * *", "30 2 * * *"]` (reports, nightly export);
- `vars`: `PRODUCT` (`cafe`/`resto`), `APP_ORIGIN`, `CONTROL_KEY_IDS`, `LICENCE_KEY_IDS`, `WHATSAPP_PHONE_ID`, `REPORT_FROM_EMAIL`;
- secrets (never in the file): `CONTROL_PUBLIC_KEYS`, `LICENCE_PUBLIC_KEYS` (JSON maps kid → base64url), `WHATSAPP_TOKEN`,
  `RESEND_API_KEY`, `DATA_KEY` (AES key for encrypted personal fields), `EXPORT_KEY`.
Routes: staging on `workers.dev`; production `custom_domain: true` on `cafe.brandhub.ma` / `resto.brandhub.ma` after the
brandhub.ma coming-soon Worker releases the host (brandhub.ma runbook §9). Every response carries `X-Robots-Tag: noindex`.

The TenantStore is always reached through `env.STORE.jurisdiction("eu").idFromName(tenantId)`.

## 5. Routes
| Path | What |
|---|---|
| `/caisse` | till (tablet or PC) |
| `/serveur` | waiter phone |
| `/ecran` | bar screen (Café) or kitchen screen (Resto), set per device |
| `/gestion` | back office (owner, manager, accountant) |
| `/connexion`, `/activer`, `/appairer` | login, activation link, device pairing |
| `/r/:code` | digital receipt (V1.1), noindex |
| `/menu/:slug` | view-only QR menu (Resto V1), noindex |
| `/commande/:slug`, `/commande/:slug/suivi/:code` | direct ordering and its status page (Resto V1.1, prompt 38), noindex |
| `/reserver/:slug` | booking requests (Resto V1.1, prompt 39), noindex |
| `/api/auth/*`, `/api/devices/*`, `/api/sync/*`, `/api/licence`, `/api/receipts/blocks`, `/api/files/*`, `/api/reports/*` | product API (docs/04, docs/08) |
| `/api/control/v1/*` | control API (docs/09) |
| `POST /api/admin/restore` | maintenance: point-in-time restore, signed with the command key (docs/12 §8), outside the control API |
| `GET /api/station/directory` | the Station's directory (Station token only; docs/04 §7) |
| `POST /api/customers` | personal fields of a customer created on a device (docs/03 §6), not an event |
| `/api/public/*` | public order and booking requests, behind Turnstile and rate limits (prompts 38–39) |
| `/api/platforms/glovo/:tenant` | Glovo webhook (V2, prompt 43) |
| `/api/health` | version, build, time |

## 6. Costs (checked September 2026, `docs/research/facts-2026-09.md`)
| Item | Price | At pilot scale |
|---|---|---|
| Workers Paid | $5/month minimum, 10 M requests and 30 M CPU-ms included | covers both products |
| Durable Objects | 1 M requests/month included, then $0.15 per million; 5 GB-month stored included, then $0.20/GB-month; hibernated WebSockets bill no duration | a café makes roughly 5,000–10,000 store requests a day (estimate) |
| D1 | 25 billion rows read and 50 M written per month included on Paid | registry only |
| R2 | free tier 10 GB (to confirm in prompt 04) | photos and exports |
| WhatsApp Cloud API | per message; Morocco's own rate card from 1 Oct 2026, about $0.023 per utility message (reseller figure) | about 7 MAD per owner per month for daily reports |
| Resend | free tier | fallback email |

## 7. Performance budgets (D50)
Till and handheld first load ≤ 150 KB JS gzip; tap to screen update ≤ 100 ms on the reference tablet; send to kitchen
screen ≤ 2 s via the Station; Worker API p95 ≤ 300 ms from Casablanca; Station relay ≤ 200 ms on the LAN. Prompt 10 adds
the budget checks to `npm run gate`.

## 8. Failure modes
| What fails | What keeps working | What the staff see | Recovery |
|---|---|---|---|
| Internet | selling, printing, kitchen (with Station), receipt numbers from blocks | orange badge "N en attente" | automatic push on reconnection; printed proof |
| Station | tablets sell alone and print over USB/Bluetooth if configured; phones sync through the cloud | "Station injoignable" | restart the Station; events relay on return |
| A tablet dies | other devices; its unsynced events are lost only if never pushed | its orders stay open elsewhere | manager takes over its orders and bank (D20); receipt block rest abandoned |
| Printer | sales; tickets queue on the Station | "Imprimante hors ligne" | reprint from the queue (counted) |
| Power | UPS keeps router, Station and printer 30–60 min | — | shutdown order in the pilot playbook |
| Cloudflare region | venue fully (local) | back office shows last sync | nothing to do; cloud catches up |
| admin.brandhub.ma | everything (products keep their own licence copy) | — | admin outbox retries |
| Device clock wrong | selling | warning; next shift opening needs an online check | trusted clock (D27) |
