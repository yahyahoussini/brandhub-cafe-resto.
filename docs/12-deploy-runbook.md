# 12 · Deploy runbook — accounts, resources, keys, releases, backups, rollback

Steps marked **(you)** are Yahya's; Claude Code prepares everything else and says when each step is due.

## 1. Accounts (you)
- Cloudflare: the same account as brandhub.ma. Switch to **Workers Paid** ($5/month) before prompt 04 (password hashing
  needs more than the free plan's 10 ms of CPU per request).
- GitHub: private repository `brandhub-cafe-resto`.
- Meta: a Business account, business verification, a WhatsApp Business phone number for BrandHub on the Cloud API (before
  prompt 18). Keep the number only for reports and reminders; support uses your normal WhatsApp Business app.
- Resend: the account already used by brandhub.ma; a sending domain such as `notify.brandhub.ma`.
Turn on two-step verification everywhere.

## 2. Cloudflare resources (Claude Code runs the commands, you approve)
Per product (`cafe`, then `resto`):
```bash
npx wrangler d1 create brandhub-cafe-registry --jurisdiction eu   # the jurisdiction is fixed at creation
# put the printed database_id into env.staging.d1_databases of apps/cafe/worker/wrangler.jsonc, then:
npx wrangler d1 migrations apply brandhub-cafe-registry --remote -c apps/cafe/worker/wrangler.jsonc --env staging
node tools/scripts/build-web.mjs cafe staging   # the pages' CSP names env.staging's APP_ORIGIN, never production
npx wrangler deploy -c apps/cafe/worker/wrangler.jsonc --env staging --no-x-provision   # creates the Durable Object class via migrations
```
`node tools/scripts/staging.mjs` prints these commands for both products (it runs nothing). Create the D1 first:
Wrangler 4.149 creates a missing D1 by itself at deploy, without a jurisdiction; `--no-x-provision` stops that.
Always pass `--env`: the top level of each wrangler.jsonc is local only (`wrangler dev` and the tests). It is named
`brandhub-<product>-local` and has no workers.dev URL, and its REGISTRY `database_id` is `local-only` (the key of the
local database), so a deploy without `--env` never reaches the production name, and Wrangler neither binds the staging
registry by its name nor creates a registry outside the EU.
R2: create `brandhub-cafe-files` in the EU jurisdiction (dashboard → R2 → Create bucket → Specify jurisdiction → EU, or
`npx wrangler r2 bucket create … --jurisdiction eu` if the installed Wrangler offers the flag) and declare
`"jurisdiction": "eu"` in the binding. Record in STATUS where each resource lives.
Secrets (`npx wrangler secret put <NAME> -c apps/cafe/worker/wrangler.jsonc --env staging`; without `--env` the secret
goes to the top-level Worker `brandhub-cafe-local`, which is never deployed): `CONTROL_PUBLIC_KEYS`,
`LICENCE_PUBLIC_KEYS`, `DATA_KEY`, `EXPORT_KEY`, `WHATSAPP_TOKEN`, `RESEND_API_KEY`. Values never appear in the terminal
history: paste them when Wrangler asks.

## 3. Keys (you, once, on your computer)
```bash
node tools/admin.mjs keys:generate
```
It writes the command and licence key pairs to `~/.brandhub/keys/` (mode 600) and prints the two public-key JSON maps to
paste as `CONTROL_PUBLIC_KEYS` and `LICENCE_PUBLIC_KEYS` for both products; the licence map also goes into each app
build (docs/08 §5). Back up `~/.brandhub/keys/` in your password manager. `DATA_KEY` and `EXPORT_KEY`:
`node tools/admin.mjs keys:data` prints two random 32-byte keys in base64; keep a copy of `EXPORT_KEY` offline (it
decrypts the 10-year backups).

## 4. Environments
| Env | Host | Data | Used for |
|---|---|---|---|
| local | `wrangler dev` + `npm run dev:station` | local SQLite, Miniflare | every prompt |
| staging | `brandhub-cafe-staging.<account>.workers.dev` | demo tenants only | end-to-end tests, pilot rehearsal |
| production | `cafe.brandhub.ma`, `resto.brandhub.ma` | real clients | after the hand-over (§5) |

## 5. Taking over the subdomain from the coming-soon Worker
The brandhub.ma pack's `brandhub-soon` Worker answers `cafe.brandhub.ma` and `resto.brandhub.ma` until the product is
ready (brandhub.ma runbook §9). For each product, at its release prompt (20 for Café, 36 for Resto):
1. In the brandhub.ma repository, remove the host from `soon/wrangler.jsonc` routes and deploy `brandhub-soon`.
2. Here, add `routes: [{ "pattern": "cafe.brandhub.ma", "custom_domain": true }]` to the production env and deploy.
3. Check: `curl -sI https://cafe.brandhub.ma/api/health` → 200 with `X-Robots-Tag: noindex`; `/caisse` loads.
4. In the brandhub.ma repository, change the product's status in `data/catalog.json` when sales open (and only then).

## 6. CI/CD (GitHub Actions, prompt 10 writes them)
- Pull request: `npm ci`, `npm run gate`, `npm run e2e` (headless Chromium, French and Arabic).
- Push to `main`: the same, then deploy both products to staging.
- Tag `cafe-v*` / `resto-v*`: deploy that product to production, only in the release window (D46), after a manual approval.
- Tag `station-v*`: Windows runner builds the installer, uploads it to R2 with its SHA-256; the product Worker publishes
  the new version number and hash; Stations offer the update when their banks are closed. The first one is
  `station-v1.0.0` (prompt 20).
- The release-window check (D46) is on for a product once its repository variable `LIVE_CAFE` / `LIVE_RESTO` is `true`;
  set it the day its first client starts using it.

## 7. WhatsApp Cloud API (prompt 18)
1. (you) Meta Business verification and the WhatsApp number; create a System User with a permanent token for the app.
2. Submit the utility templates `rapport_du_soir` (FR and AR, docs/10 §3); approval can take from minutes to days.
3. Put the phone number id in `vars.WHATSAPP_PHONE_ID` and the token in the `WHATSAPP_TOKEN` secret.
4. Until approval, reports go by email automatically.
Pricing changes on 1 Oct 2026 for Morocco (own rate card, every message charged): check the rate card in the Meta
dashboard and write the real per-message price in STATUS.

## 8. Backups and restore
- Point-in-time recovery: each TenantStore can restore its SQLite to any moment of the last 30 days. The admin-only
  endpoint `POST /api/admin/restore {tenantId, at, dryRun?}` (command-key signed) takes a bookmark with
  `getBookmarkForTime` and applies it with `onNextSessionRestoreBookmark`, then restarts the object; `dryRun: true`
  returns the bookmark and changes nothing. `node tools/admin.mjs tenant:pitr` calls it (prompt 07).
- Nightly export (02:30 UTC cron): each client's new events, encrypted with `EXPORT_KEY`, to
  `r2://brandhub-<product>-files/exports/<tenant>/<date>.jsonl.enc`, kept 10 years.
- Restore drill before every pilot: restore the demo tenant to one hour earlier, check the day's totals, time it, write it
  in STATUS.

## 9. Monitoring
`/api/health` on both products checked every 5 minutes by a free uptime monitor of your choice, alerting your phone;
`wrangler tail` for live logs (no personal data in them, D42); the control API report weekly (last sync per client).

## 10. Rollback
Workers: `npx wrangler deployments list` then `npx wrangler rollback <version-id>` (seconds). Database changes are forward
only: never edit an applied migration; a bad projection is rebuilt from events. Station: reinstall the previous installer
from R2; its SQLite stays.

## 11. Yearly
Rotate the command key (new kid, both accepted for a month). Rotate the licence key in this order, so a 12-month
licence never outlives its key: (1) publish the new public key in an app build and in `LICENCE_PUBLIC_KEYS` first;
(2) during the month both kids are accepted, re-sign every live licence with the new key and nothing else changed
(plan, limits, modules, dates, `suspended`: a suspended tenant stays suspended) through `tenant:subscription` (the
control API's licence issue call, docs/09 §1 #2); (3) only then drop the old kid.
`DATA_KEY` only after an incident (re-encrypt), check the WhatsApp price, renew the code-signing certificate if bought.
