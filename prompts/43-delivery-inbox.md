# Prompt 43 — Delivery-app inbox: Glovo first

> Run after prompt 42 (V2), only when a Resto client is a Glovo partner and Glovo has approved the integration (D36).
> Needs from Yahya: Glovo's approval, the staging credentials and store ids, the Partner API documentation Glovo sends
> with them, and one real payout statement from the client's Glovo portal (docs/14 task 18). Without approval, stop
> after step 1 and write what is missing in STATUS.

## Goal
Glovo orders arrive in the restaurant's inbox and kitchen without re-typing, "86" on the till hides the dish on Glovo,
and the owner sees what Glovo owes him after commission, order by order.

## Read first
`DECISIONS.md` D6, D20, D31, D36 · `docs/research/facts-2026-09.md §C5` · `docs/research/market-2026-09.md` (Glovo:
30 % commission cap, no exclusivity) · prompts 37 and 38 (fulfilment, inbox, delivery board) · `docs/08-security.md §6`.

## Do
1. Research first: write `docs/research/glovo-api-<date>.md` from the documentation Glovo provided (version, date,
   URLs): how orders reach the partner, the status updates and their names, cancellation, the menu and the stock and
   price updates with their rate limits, authentication, staging and production hosts, and the payment fields of an
   order. Facts already seen (September 2026): orders arrive by webhook; statuses include ACCEPTED and READY_FOR_PICKUP
   (Glovo's Partner API page), with OUT_FOR_DELIVERY and PICKED_UP_BY_CUSTOMER listed by an integrator (HubRise); the
   first price and stock update must be pushed before going live; single-product updates are limited to 120 calls per
   minute per store; one production token serves all stores; per HubRise, Glovo gives the customer's name and address
   (with coordinates), the phone only for orders the restaurant delivers itself, and cancellation is done through
   Glovo's support, which then notifies the partner. Glovo's documentation exists in several versions for different
   business lines: build only against the one Glovo gives this client, and stop on any contradiction with this prompt.
2. An adapter interface in `apps/resto/worker/platforms/`: `parseOrder`, `acknowledge`, `markReady`, `onCancelled`,
   `pushAvailability`, `pushPrices`, `parseStatement`. Glovo is the first adapter; Yassir, Kooul or others follow only
   when they publish an API.
3. Webhook receiver `POST /api/platforms/glovo/:tenant` (auth as documented, constant-time comparison, idempotent by
   Glovo's order id): the TenantStore writes the order as `dev_cloud` (`mode: delivery`, `source: "glovo"`,
   `externalRef`) with Glovo's prices as line snapshots, transfers it to the inbox device (prompt 38) and flags unmapped
   products. The kitchen ticket shows "GLOVO · code" and the pickup time.
4. Mapping in `/gestion → Plateformes`: Glovo store ids to the site; Glovo product and option ids to `prd_…`/`mod_…`;
   channel prices when the client sells at other prices on Glovo; photos.
5. Statuses: accepting in the inbox sends the acceptance; "prête" at the pass sends ready-for-pickup; retries with
   growing delays. What Glovo reports (cancelled, picked up) is written by the cloud as a mark `platform.status` on the
   order, because the inbox device owns the order: on `cancelled`, that device voids it with reason « annulée par
   Glovo » when nothing was sent, otherwise the manager decides in "À vérifier".
6. Payment: a new tender `platform` in the kit (`order.js` TENDERS, reference `glovo:<order id>`), used when Glovo
   collects from the customer; if the contract says the courier pays at the counter, the tender is the one actually
   received (cash). Update `docs/03 §5` in the same commit.
7. Availability and prices: `catalog.product_availability` ("86") and price changes on the Glovo channel are pushed
   within 1 minute when online (queued otherwise), within the documented rate limits.
8. Reconciliation: `/gestion → Plateformes → Relevés` imports the payout statement file the client downloads from Glovo,
   parsed from the real sample (columns never guessed); matches it to orders; shows per order the total, the commission
   at the contract rate (settings), the expected net, the amount paid and the gap; lists orders missing from the
   statement and payouts without an order.

## Constraints
Glovo's customer data follows docs/08 §6 and docs/03 §6 (in `customers_pii`, never in events): encrypted, never logged,
kept 30 days after delivery (setting) and then
erased, the order keeping an anonymous id (D42, D43). Webhook bodies are stored only as the events they become. No
scraping, no unofficial API.

## Acceptance checks (run them, paste the output)
1. Against Glovo's staging (or, before access, recorded fixtures copied from the documentation): order received → inbox
   → accepted → kitchen ticket → ready → the status calls sent; the same webhook twice → one order.
2. "86" on the till → availability update sent within 1 minute; offline → sent at reconnection.
3. Statement import on the real sample: expected net = total − commission for each order; one missing payout flagged.
4. `npm run gate`.

## Update docs/STATUS.md
Row 43; API version and date; the stores live; the contract's commission rate (the rate only, no client name).

## Commit
`feat(resto): delivery-app inbox with the Glovo adapter, availability sync and payout reconciliation`
