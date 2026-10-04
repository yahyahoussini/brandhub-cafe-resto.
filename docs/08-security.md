# 08 · Security — accounts, PINs, devices, permissions, keys, data

## 1. Owner, manager and accountant accounts
- **First access** only through the control API (D28): `POST /api/control/v1/tenants` or `/owner-reset` returns an
  activation link (`/activer#<token>`, token 32 random bytes) and Yahya sends it with a 6-digit code on WhatsApp. Both are
  stored hashed, expire after 72 h, and work once. Other managers and the accountant are invited by the owner the same way.
- **Password:** at least 10 characters, refused if it appears in the bundled list of 10,000 common passwords; stored as
  PBKDF2-SHA-256 with 100,000 iterations and a 16-byte salt (WebCrypto; needs Workers Paid, D19). 100,000 is the most
  Cloudflare Workers accept (workerd issue 1346); the iteration count is stored with each hash, so it can be raised and
  old hashes upgraded at the next login when the platform allows.
- **TOTP** (RFC 6238, 6 digits, 30 s, ±1 step) is required for owner and manager; 10 single-use recovery codes, hashed.
- **Sessions:** a random 32-byte id in an `HttpOnly; Secure; SameSite=Strict` cookie, stored hashed, 12 h idle, 30 days
  maximum. Revoking a device, changing permissions or exporting data asks for the password again.
- **Lockouts:** 5 failed logins → the account waits 15 minutes; 20 attempts an hour per network (IP kept only as a
  salted hash for 24 h).
- `owner-reset` revokes every session of the owner and issues a new activation link.

## 2. Staff PINs
- 4 to 6 digits, per staff member; obvious PINs are refused (1234, 0000, repeated or sequential digits, birth years
  1950–2010). Stored as PBKDF2-SHA-256 (100,000 iterations, per-staff salt) and synced to the venue's devices so they work
  offline. 5 wrong tries on a device → that device refuses that staff member for 15 minutes.
- A PIN identifies who acts; it does not protect a stolen tablet. What protects a stolen device: Android's own screen
  lock (set at installation), remote revocation, and the fact that a device holds only its venue's current data.
- Approvals are given by a staff member flagged `canApprove` (managers and the owner by default) typing their own PIN;
  the approver's id is written into the event.

## 3. Devices
Pairing code: 6 digits, 10 minutes, single use, 5 pairings an hour per client. Token: `bhd1.<tenant>.<device>.<secret>`
(32-byte secret), stored as SHA-256, never shown again. Revocation is immediate at the next contact. Each device may make
120 sync requests a minute. The device list shows last contact, app version and IP-free network type (LAN / cloud).

## 4. Permissions (D38)
The default matrix is `data/permissions.json`. A client can tighten any action or relax it down to the floor marked
`floor` there (for example: an opening of the drawer without a sale always needs an approval; a credit note always needs
an approval; discount caps can go down, not above the floor). The app checks permissions before creating the event; the
server re-checks the approval fields; the kit re-checks the approval's presence.

## 5. Keys
| Key | Algorithm | Private key lives | Public key lives | Rotation |
|---|---|---|---|---|
| Command key (control API) | Ed25519 | `~/.brandhub/keys/command-<year>.jwk` on Yahya's computer, later admin.brandhub.ma secrets | Worker secret `CONTROL_PUBLIC_KEYS` (JSON kid → key) | yearly; both kids accepted during the switch |
| Licence key | Ed25519 | same place, separate file | Worker secret `LICENCE_PUBLIC_KEYS`, shipped to devices at pull | yearly |
| Data key | AES-256-GCM | Worker secret `DATA_KEY` | — | on incident; re-encrypt |
| Export key | AES-256-GCM | Worker secret `EXPORT_KEY` + a paper copy in Yahya's safe | — | yearly |
| Lookup key | HMAC-SHA-256 | made by each client's store at activation | sent to that client's paired devices and Station, to look up phone numbers offline | on incident |
Private keys never enter the repository, a log or a chat. Losing the command key: generate a new pair, publish the new
public key, remove the old kid; licences stay valid until their dates. Ed25519 in WebCrypto is available in Node 22,
Workers and current Chrome; if a device's Chrome lacks it, the app falls back to `@noble/ed25519` for verification only.

## 6. Personal data
Customer phone numbers, names and addresses (Kredi, loyalty, delivery, bookings), owners' TOTP secrets and staff phone
numbers are encrypted with `DATA_KEY` (AES-256-GCM, random 12-byte IV per value) in the personal-data tables, never in
events (docs/03 §6); lookups use a keyed hash with the client's `LOOKUP_KEY`. `DATA_KEY` never leaves the Worker: devices
receive the few decrypted rows they need for today over the authenticated API and delete them after 7 days.
Nothing personal is written to logs, error reports or the control API report (counts only). Exports for the client
contain his own data; the nightly backup export is encrypted with `EXPORT_KEY`.

## 7. HTTP
HTTPS only (HSTS one year). Headers on every response: `Content-Security-Policy: default-src 'self'; img-src 'self' data:
blob:; connect-src 'self' wss://<product host> http://*:17800; font-src 'self'; frame-ancestors 'none'; base-uri 'none';
form-action 'self'` · `X-Robots-Tag: noindex` · `Referrer-Policy: no-referrer` · `X-Content-Type-Options: nosniff` ·
`Permissions-Policy: camera=(self), usb=(self), serial=(self), bluetooth=(self), geolocation=()`. JSON APIs refuse
cross-origin requests except from the product origin and the Station.

## 8. Threats and answers
| Threat | Answer |
|---|---|
| A cashier voids a paid ticket to pocket the cash | a closed ticket cannot be voided; refunds are credit notes with approval, listed in the report |
| Drawer opened without a sale | approval required; counted per bank; shown in the evening report |
| A waiter keeps cash after handing over his bank | take-over makes his late events land in review with the amount; payments into a bank he no longer holds are refused (`assertBankAccepts`) |
| Device clock turned back to extend access | trusted clock; shift opening requires an online check (D27) |
| Replayed or forged control call | Ed25519 signature, ±5 min timestamp, request id stored 24 h |
| Forged licence | only admin's licence key signs; devices verify |
| Cross-client access | one Durable Object per client; the token carries the tenant and the store re-checks it |
| A product server compromised | it holds public keys only; it cannot sign licences or commands for other products |
| Owner phishing | TOTP; sessions bound to the product origin |
| WhatsApp account takeover of the owner | activation codes expire in 72 h and work once; owner-reset revokes sessions |
| Stolen tablet | revocation, Android lock, only current venue data on the device |

## 9. P0 list before any pilot (checked in prompt 19)
1. No secret in the repository (`git grep` of token patterns returns nothing; names only are printed).
2. Cross-tenant tests pass (a token of client A cannot read or write client B).
3. Every approval-requiring action refuses without `approvedBy`, in the kit, the app and the server.
4. Lockouts work (login, PIN, pairing).
5. CSP and headers present on every route.
6. A restore drill from point-in-time recovery done and timed.
7. Error reports contain no personal data (checked on a forced error).
8. The admin CLI keys are outside the repository with file mode 600.
