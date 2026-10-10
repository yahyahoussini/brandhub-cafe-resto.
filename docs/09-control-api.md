# 09 · Control API v1 — how admin.brandhub.ma (and tools/admin.mjs) controls each product

The contract is the Master Spec's (section "Control API v1"); both products implement it identically on their own host:
`https://cafe.brandhub.ma/api/control/v1/…` and `https://resto.brandhub.ma/api/control/v1/…`.

## 1. Endpoints
| # | Endpoint | Admin sends | Product returns |
|---|---|---|---|
| 1 | `POST /api/control/v1/tenants` | business name, owner (name, WhatsApp, email), language (fr/ar), plan, limits, end date, grace end date, admin client ref | tenant id, owner login, one-time activation link and code (72 h) |
| 2 | `PUT /api/control/v1/tenants/{id}/subscription` | plan, limits, end date, grace end date, signed licence | the status now stored |
| 3 | `POST /api/control/v1/tenants/{id}/suspend` and `/restore` | reason | new status |
| 4 | `POST /api/control/v1/tenants/{id}/owner-reset` | nothing | a new one-time activation link and code |
| 5 | `GET /api/control/v1/report` | optional `tenant` | per tenant: last activity, active users (30 days), devices, usage counts, app version, last sync, signals |
| 6 | `GET /api/control/v1/health` | — | product, version, build, time, status |
A new tenant has no licence until endpoint 2 runs: it can log in and set up, but no shift can open. The test sequence is
create → set subscription → suspend → restore → owner reset → report.
Outside the contract, one maintenance endpoint uses the same signature and request ids (§3): `POST /api/admin/restore
{tenantId, at, dryRun?}`, the point-in-time restore of one tenant's Durable Object (D28, D49, docs/12 §8).

## 2. Bodies
**1 · Create**
```json
{
  "businessName": "Café Démo",
  "owner": { "name": "…", "whatsapp": "+2126XXXXXXXX", "email": "…" },
  "lang": "fr",
  "plan": "cafe",
  "limits": { "sites": 1, "tills": 1, "handhelds": 5, "screens": 1, "stations": 1 },
  "valid_until": "2027-02-28",
  "grace_until": "2027-03-15",
  "adminRef": "ADM-0001"
}
```
→ `201 { "tenantId": "tnt_…", "ownerLogin": "<email>", "activation": { "url": "https://cafe.brandhub.ma/activer#…", "code": "123456", "expiresAt": "…" }, "status": "active" }`

**2 · Subscription**
```json
{ "plan": "cafe", "limits": { "sites": 1, "tills": 2, "handhelds": 5, "screens": 1, "stations": 1 },
  "valid_until": "2027-09-30", "grace_until": "2027-10-15", "licence": "<signed token>" }
```
The product verifies the licence with `LICENCE_PUBLIC_KEYS` (`licence.js`) and refuses it (`422 licence_mismatch`) if its
tenant, product, plan, limits or dates differ from the body. → `200 { "status": "active", "valid_until": "…", "grace_until": "…", "licenceKid": "lic-2026" }`

**3 · Suspend / restore** `{ "reason": "impayé depuis 60 jours" }` → `200 { "status": "suspended" }` / `{ "status": "active" }`
(restore returns the status the dates give). Suspension applies at the next shift opening (D14).

**4 · Owner reset** `{}` → `200 { "activation": { … } }`; every session of the owner is revoked.

**5 · Report** → `200 { "product": "cafe", "version": "1.0.3", "generatedAt": "…", "tenants": [ { "tenantId": "…",
"adminRef": "…", "status": "active", "lastActivityAt": "…", "lastSyncAt": "…", "activeUsers30d": 6, "devices": [ { "deviceId": "…",
"kind": "till", "name": "Caisse 1", "lastSeenAt": "…", "appVersion": "1.0.3" } ], "usage": { "orders30d": 5120,
"messages30d": 31 }, "signals": { "lossAboveThreshold2w": false, "emptyHours": true, "manualSupplierOrders": false,
"secondSite": false } } ] }`. Counts and flags only: no revenue, no names, no phone numbers (D9, D42).

## 3. Signature and idempotency (`packages/kit/src/control-signature.js`)
Headers: `X-BH-Timestamp` (Unix seconds, refused beyond ±300 s), `X-BH-Request-Id` (UUID), `X-BH-Key-Id`,
`X-BH-Signature` (Ed25519 over `METHOD\nPATH\nTIMESTAMP\nREQUEST_ID\nSHA256(body)`, base64url). The Worker verifies
against `CONTROL_PUBLIC_KEYS`, then looks up the request id in the registry table `control_requests` (kept 24 h): a known
id returns the stored response and changes nothing. Every command is logged on both sides (who, what, when, why).
Errors: `400 invalid_body` · `401 missing_headers | stale_timestamp | unknown_key | bad_signature` · `404 unknown_tenant` ·
`409 conflict` · `422 licence_invalid | licence_mismatch`.

## 4. Status and dates
Active → Grace (after `valid_until`) → Read-only (after `grace_until`); Suspended by command; payment or restore brings
Active back (Master Spec state diagram). Dates are inclusive, in the client's time zone (`accessStatus` in `licence.js`).
What each status does on the till: `tillPermissions` (D14). The status a device uses is the stricter of the one its
licence gives and the last one the server sent.

## 5. Licence payload (`licence.js`)
`{ v: 1, kid, tenant, product: "cafe" | "resto", plan, limits, modules, valid_until, grace_until, suspended, issued_at }`.
`modules` are keys from `data/modules.json`; `limits` keys from `data/plans.json`. Admin signs it with the licence key.

## 6. tools/admin.mjs (until admin.brandhub.ma exists)
```bash
node tools/admin.mjs keys:generate                       # two Ed25519 pairs in ~/.brandhub/keys (mode 600); prints the public keys
node tools/admin.mjs tenant:create --product cafe --name "Café Démo" --owner-name "…" --owner-whatsapp +2126… \
     --owner-email … --lang fr --plan cafe --valid-until 2027-02-28 --grace-until 2027-03-15 --ref ADM-0001
node tools/admin.mjs tenant:subscription --product cafe --tenant tnt_… --plan cafe --valid-until … --grace-until …
node tools/admin.mjs tenant:suspend --product cafe --tenant tnt_… --reason "…"
node tools/admin.mjs tenant:restore --product cafe --tenant tnt_… --reason "…"
node tools/admin.mjs tenant:owner-reset --product cafe --tenant tnt_…
node tools/admin.mjs tenant:pitr --product cafe --tenant tnt_… --at <ISO time> [--dry-run] \
     [--base https://<staging host>]   # POST /api/admin/restore
node tools/admin.mjs report --product cafe [--tenant tnt_…]
node tools/admin.mjs health --product resto
node tools/admin.mjs test-sequence --product cafe --base https://<staging host>
```
Every command is written first to `~/.brandhub/outbox.jsonl` and retried with growing delays until the product confirms
(the Master Spec's outbox rule); `admin.mjs outbox` shows pending and failed commands. The tool prints activation links
and codes for Yahya to send on WhatsApp; it never prints private keys.
`tenant:pitr` skips the outbox: it runs once and prints the result, so a late retry never rolls back newer events.

## 7. Registering the product in admin.brandhub.ma (later)
Name, slug (`cafe`, `resto`), subdomain, API base URL, plans and limit keys (`data/plans.json`), module keys
(`data/modules.json`), command and licence key ids. Then run the test sequence from admin.
