# Prompt 04 — Cloud store: one SQLite database per client

> Run after prompt 03. Needs from Yahya: Cloudflare Workers Paid on the brandhub.ma account (docs/14 task 4).

## Goal
Each product has a Worker, and each client a Durable Object with SQLite in the EU jurisdiction that stores events with
their chain and keeps rebuildable projections.

## Read first
`docs/02-architecture.md §1, §4, §6` · `docs/03-domain-model.md §4–§6` · `docs/12-deploy-runbook.md §2, §4` ·
`DECISIONS.md` D19, D20, D26, D49 · `packages/kit/src/journal.js`, `events.js`, `order.js`, `bank.js`, `marks.js`, `stock.js`, `reports.js`.
Check the current Cloudflare documentation for Durable Objects with SQLite (`ctx.storage.sql`, `transactionSync`,
migrations `new_sqlite_classes`, `jurisdiction("eu")`, point-in-time recovery) before writing code, and note the
`compatibility_date` you use.

## Do
1. `packages/kit-worker/src/schema.sql` from docs/03 §6 and a migration runner (`PRAGMA user_version`); never edit an
   applied migration.
2. `packages/kit-worker/src/tenant-store.js`: base class `TenantStore extends DurableObject` with `append(events,
   caller)`: validate with the kit, check ownership and seq through the aggregate reducers, run the cross-aggregate
   checks of docs/04 §2 (`assertBankAccepts`, move pairs, refunds), compute the chain hashes (`chainHash` is async) under
   the store's append lock, then assign `pos` and write rows, hashes and projections in one `transactionSync` (its
   callback must be synchronous); duplicates acknowledged, rejections to `deadletter`,
   `rebuild()` (drop projections, replay the log), `verify(from, to)`, `pull(after, kind)`; a `jurisdictionStore(env,
   tenantId)` helper that always uses `env.STORE.jurisdiction("eu").idFromName(tenantId)`.
3. `apps/cafe/worker` and `apps/resto/worker`: `index.js` (router: `/api/health`, 404 JSON for unknown `/api/*`,
   everything else to the static assets), `cafe-store.js` / `resto-store.js` extending `TenantStore`, `wrangler.jsonc`
   per docs/02 §4 with `staging` and `production` envs (production routes stay commented until the release prompts), the
   D1 registry schema (`tenants`, `owner_logins`, `control_requests`, `report_schedule`, `message_counts`) and the R2
   binding, both in the EU jurisdiction (docs/12 §2); the personal-data tables of docs/03 §6 outside the event log. Every response carries `X-Robots-Tag: noindex` and the headers of docs/08 §7 (CSP relaxed only for `wrangler dev`).
4. Tests with `@cloudflare/vitest-pool-workers` (JavaScript test files): two tenants are isolated (a store never sees the
   other's events); appending the café acceptance day gives the same `dailyReport` as the kit; a duplicate batch is
   acknowledged without new rows; a tampered row makes `verify` fail at that position; `rebuild()` gives identical projections.
5. Create the staging resources (docs/12 §2), deploy both Workers to staging, and call `/api/health`.

## Constraints
No client data outside its Durable Object. No personal data in logs. Secrets only through `wrangler secret put`.

## Acceptance checks (run them, paste the output)
1. `npm test` (Worker tests included) and `npm run typecheck`.
2. `curl -s https://<staging cafe host>/api/health` and the same for resto (version, build, time).
3. The D1 and R2 resources created (names and jurisdiction).

## Update docs/STATUS.md
Row 04; compatibility date; staging URLs; the measured time to append a 200-event batch.

## Commit
`feat(cloud): per-client SQLite store with chained events, registry and staging deploy`
