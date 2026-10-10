# @brandhub/kit-worker

Cloudflare side of the kit: TenantStore base Durable Object, sync, auth and control endpoints, cron helpers (prompts 04, 05, 07).

Modules (prompt 04): `http` (headers of docs/08 §7, JSON answers, `/api/*` router, `/api/health`), `jurisdiction`
(`jurisdictionStore`, the only way to a client's store, EU jurisdiction), `tenant-store` (the base Durable Object, a
thin RPC wrapper around `store`), `store` (append, pull, verify, rebuild, day's numbers on the client's SQLite),
`sync-rules` (the push and pull rules of docs/04 §2–§3), `projections` (the only writer of the rebuildable tables),
`src/schema.sql` with `migrations` and `migrate` (forward-only migrations, version in `_schema`), `env` (the Worker's
bindings and vars); `migrations/registry/` holds the D1 registry migrations both products apply.
Tests: `test/*.test.js` run with `node --test` on `node:sqlite` (the store's own code through `test/node-storage.js`);
`test/*.spec.js` run in workerd with Vitest (`npm test` runs both): `cloud-store.spec.js` is prompt 04's step 4 (the
café acceptance day of `packages/kit/test/acceptance-day-events.js` against the kit's report, isolation, duplicates,
tampering, rebuild, dead letters), `append-timing.spec.js` prints the time of a 200-event push, and `test/workerd.js`
holds their helpers. The lint rule `bh/store-through-jurisdiction` keeps every other read of `env.STORE` out of the
Workers' source.
