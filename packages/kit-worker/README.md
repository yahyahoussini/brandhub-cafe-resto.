# @brandhub/kit-worker

Cloudflare side of the kit: TenantStore base Durable Object, sync, auth and control endpoints, cron helpers (prompts 04, 05, 07).

Modules (prompt 04): `http` (headers of docs/08 §7, JSON answers, `/api/*` router, `/api/health`), `jurisdiction`
(`jurisdictionStore`, the only way to a client's store, EU jurisdiction), `tenant-store` (base class), `env` (the
Worker's bindings and vars); `migrations/registry/` holds the D1 registry migrations both products apply. Runtime tests
are `test/*.spec.js` (Vitest inside workerd, `npm test`).
