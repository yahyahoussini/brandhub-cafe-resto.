# Prompt 05 — Accounts, device pairing, staff PINs, permissions

> Run after prompt 04.

## Goal
Owners log in with password and TOTP, devices are paired by QR code and revocable, staff act with PINs that work
offline, and every action is checked against the permissions.

## Read first
`docs/08-security.md §1–§4, §7` · `docs/05-devices.md §1–§2` · `docs/06-ux-flows.md §1, §6` · `docs/04-sync-protocol.md §1` ·
`DECISIONS.md` D37, D38 · `data/permissions.json` · `packages/kit/src/permissions.js`.

## Do
1. `packages/kit-worker/src/auth-api.js`: activation (`POST /api/auth/activate` with token + 6-digit code → set password →
   TOTP enrolment with QR → 10 recovery codes → accept CGU/DPA with version and time), login (`/api/auth/login`: email,
   password, TOTP), logout, session check, invitations for managers and the accountant. PBKDF2-SHA-256 with 100,000
   iterations (the Workers maximum) and the count stored per hash, the common-password list, lockouts and session rules
   of docs/08 §1. The email → tenant lookup uses the registry.
2. A development seed (`npm run seed:dev -- --product cafe`) that creates a demo tenant and an activation directly in the
   store (the control API arrives in prompt 07) and prints the activation URL and code to the terminal only.
3. `packages/kit-worker/src/devices-api.js`: pairing codes (6 digits, 10 min, single use, plan limits of docs/01 §5),
   `POST /api/devices/pair` → token `bhd1.<tenant>.<device>.<secret>` (hash stored), device list, revoke (immediate).
   Receipt prefixes assigned per device kind (`C1…`, `S1…`).
4. Staff: `staff.set` events from the back office; the PIN is chosen on a device, hashed there (PBKDF2 100,000, per-staff
   salt), and only the hash travels, in a `staff.pin_set` event (so a role edit never overwrites a PIN); obvious PINs
   refused; 5 tries then 15 minutes per device.
5. Web pages in both apps using the kit-web components: `/connexion`, `/activer`, `/appairer` (QR scan with
   `BarcodeDetector`, typed code fallback), and a minimal `/gestion/appareils` and `/gestion/equipe`.
6. Permissions: every owner API checks `can()`; the device UI hides what `can()` refuses and opens `ApprovalDialog` where
   `needsApproval()` says so.

## Constraints
No password, token, PIN or code in logs or test output (print "[redacted]"). Cookies `HttpOnly; Secure; SameSite=Strict`.

## Acceptance checks (run them, paste the output)
1. Playwright: activation → login with TOTP (generated in the test) → create a pairing code → pair a second browser
   context as a till → revoke it → its next request gets `E_DEVICE_REVOKED`. In French and Arabic.
2. Lockout tests (login, PIN, pairing) pass. The secret scan of prompt 10's pattern (a full device token
   `bhd1\.tnt_[0-9a-f-]{36}\.dev_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}`, PEM private keys, a JWK `"d"` value) finds nothing
   outside test fixtures that are marked as fake.
3. `npm run gate`.

## Update docs/STATUS.md
Row 05; measured PBKDF2 time on the Worker and on the reference tablet (if available).

## Commit
`feat(auth): owner accounts with TOTP, device pairing, staff PINs and permissions`
