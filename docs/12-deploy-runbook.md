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
npx wrangler deploy -c apps/cafe/worker/wrangler.jsonc --env staging   # creates the Durable Object class via migrations
```
R2: create `brandhub-cafe-files` in the EU jurisdiction (dashboard → R2 → Create bucket → Specify jurisdiction → EU, or
`npx wrangler r2 bucket create … --jurisdiction eu` if the installed Wrangler offers the flag) and declare
`"jurisdiction": "eu"` in the binding. Record in STATUS where each resource lives.
Secrets (`npx wrangler secret put <NAME> -c apps/cafe/worker/wrangler.jsonc`): `CONTROL_PUBLIC_KEYS`,
`LICENCE_PUBLIC_KEYS`, `DATA_KEY`, `EXPORT_KEY`, `WHATSAPP_TOKEN`, `RESEND_API_KEY`. Values never appear in the terminal
history: paste them when Wrangler asks.

## 3. Keys (you, once, on your computer)
```bash
node tools/admin.mjs keys:generate
```
It writes the command and licence key pairs to `~/.brandhub/keys/` (mode 600) and prints the two public-key JSON maps to
paste as `CONTROL_PUBLIC_KEYS` and `LICENCE_PUBLIC_KEYS` for both products. Back up `~/.brandhub/keys/` in your password
manager. `DATA_KEY` and `EXPORT_KEY`: `node tools/admin.mjs keys:data` prints two random 32-byte keys in base64; keep a
copy of `EXPORT_KEY` offline (it decrypts the 10-year backups).

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
  endpoint `POST /api/admin/restore {tenantId, at}` (command-key signed) takes a bookmark with `getBookmarkForTime` and
  applies it with `onNextSessionRestoreBookmark`, then restarts the object.
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
Rotate the command and licence keys (new kid, both accepted for a month), `DATA_KEY` only after an incident (re-encrypt),
check the WhatsApp price, renew the code-signing certificate if bought.
