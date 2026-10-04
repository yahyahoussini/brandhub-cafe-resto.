# Prompt 38 — Direct ordering by link, QR and WhatsApp (Resto)

> Run after prompt 37. Needs from Yahya: a Cloudflare Turnstile widget for `resto.brandhub.ma` (free; site key and
> secret) and the lawyer's list of what an order page must show (docs/14 tasks 20 and 22).

## Goal
Customers order from the restaurant's own link — shared in its WhatsApp profile, Instagram bio, Google profile, flyers and
table QR codes — with no commission; the order lands in the till's inbox and reaches the kitchen once staff accept it.

## Read first
`DECISIONS.md` D8, D12, D22, D35, D36, D42 · prompt 27 (`/menu/:slug`) · prompt 37 (customers, fulfilment, zones,
delivery board) · `docs/08-security.md §7` · `docs/11-compliance.md §8, §9` · `docs/04-sync-protocol.md §3, §7`.

## Do
1. Public route `/commande/:slug` (noindex, French and Arabic, phone first, ≤ 150 KB JS): the menu of the current period
   with TTC prices and photos, dishes marked "86" hidden, options and set-menu steps, cart, pickup or delivery (zones,
   fee and minimum from prompt 37), a time slot, notes. Before "Commander" the page shows the restaurant's identity
   (name, address, phone), every price TTC, the delivery fee, the payment method (at pickup or to the driver) and the
   estimated time; the lawyer's list (docs/14 task 20) decides the final set.
2. Customer details: first name and phone (required for delivery, optional for pickup) with a consent checkbox whose
   text version is recorded; without consent nothing is kept after the day.
3. Submission: `POST /api/public/orders/:slug` checks the Turnstile token server-side (`TURNSTILE_SECRET` as a Worker
   secret, the site key as a public var), then rate limits (per network hash and per phone hash: at most 3 pending
   orders; minimum order; opening hours; "Commandes en ligne en pause" set from the till). The TenantStore writes the
   order as `dev_cloud`: `order.opened {mode, source: "web", fulfilment}`, `order.customer_set` when a customer gave his
   details (kept in `customers_pii`, docs/03 §6), and the lines with the catalog
   prices at that moment, then `order.transferred` to the inbox device (`ordering.inboxDeviceId`, default the first
   till), so the inbox works offline once the Station has pulled it.
4. Inbox at `/caisse → Commandes en ligne`: sound until handled; "Accepter" sends the lines to the kitchen (the ticket
   shows "WEB 7F3K-2Q · à emporter 13:00"); "Refuser" voids the order with a reason (nothing sent, no approval).
   Unanswered after 10 minutes (setting), the status page tells the customer to call the restaurant; the order stays in
   the inbox until someone accepts or refuses it (the cloud no longer owns it).
5. Status page `/commande/:slug/suivi/:code` (signed short-lived link, noindex, no personal data): reçue → acceptée → en
   préparation → prête → en route → livrée, from the order's marks.
6. WhatsApp without the API: the confirmation page offers "Écrire au restaurant sur WhatsApp", a click-to-chat link
   `https://wa.me/<restaurant number>?text=<order code>` to the restaurant's own number (settings), so the conversation
   happens on the restaurant's phone at no messaging cost. `/gestion` prints the ordering QR and a flyer with the link.
7. Table QR (setting, off by default): `/commande/:slug?t=<table code>` opens a table order; it goes to the phone of the
   waiter who owns that zone to confirm before the kitchen (a prank never reaches the stove).
8. Payment stays offline: at pickup, to the driver (prompt 37) or at the table. No online card payment (it would need a
   payment contract per restaurant; not studied).
9. CSP on `/commande/*` only: allow `https://challenges.cloudflare.com` in `script-src` and `frame-src`; every other
   route keeps docs/08 §7. Add the routes to `docs/02 §5` and the event fields to `docs/03 §5`.
10. `/gestion → Commandes en ligne`: orders, acceptance time, refusals with reasons, revenue by source (web, QR, phone,
    counter).

## Constraints
The public API accepts only the catalog's own prices and products; totals are recomputed by the kit on the server.
Turnstile and rate limits run before any write. No marketing message, no automatic WhatsApp message (D9, D35).

## Acceptance checks (run them, paste the output)
1. E2E with Turnstile's documented test keys: `/commande/restaurant-demo`, 1 tajine poulet citron + 1 théière for
   pickup at 13:00 with consent → the till's inbox rings → accept → the kitchen ticket "WEB …" appears within 2 s through
   the Station → prête → paid at pickup → the status page showed each step.
2. Refused: a failing Turnstile token; a 4th pending order from the same phone; an order while paused; a dish marked "86";
   a price altered in the request (the server uses the catalog price).
3. `curl -sI` on `/commande/restaurant-demo` shows `X-Robots-Tag: noindex` and the route's CSP; `npm run gate`.

## Update docs/STATUS.md
Row 38; the Turnstile widget name; the lawyer's list applied.

## Commit
`feat(resto): direct ordering by link and QR with inbox, status page and click-to-chat`
