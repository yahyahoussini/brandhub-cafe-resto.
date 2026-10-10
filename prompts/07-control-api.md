# Prompt 07 — Control API, licence, statuses, admin tool

> Run after prompt 06. Needs from Yahya: run `keys:generate` on his computer and paste the public keys as secrets (docs/14 task 5).

## Goal
admin.brandhub.ma's contract works on both products today, driven by `tools/admin.mjs`, and devices apply the licence and
the status at the next shift opening.

## Read first
`docs/09-control-api.md` (all) · `docs/08-security.md §5` · `docs/12-deploy-runbook.md §8` · `DECISIONS.md` D8, D14,
D27, D28, D49 · `packages/kit/src/licence.js`, `control-signature.js`, `crypto.js` and their tests · `data/plans.json`,
`data/modules.json`.

## Do
1. `packages/kit-worker/src/control-api.js`: the six endpoints of docs/09 §1 with the bodies of §2; signature check with
   `verifyRequest` and `CONTROL_PUBLIC_KEYS`; request ids in the registry's `control_requests` for 24 h (replay returns the
   stored response); command log on the product side; errors of §3. Endpoint 1 creates the tenant in the registry and its
   store, the owner login and the activation (reuse prompt 05); endpoint 2 verifies the licence (`verifyLicence` with
   `LICENCE_PUBLIC_KEYS`) and that it matches the body; endpoint 5 returns counts and flags only.
2. Devices: verify the licence from `/api/licence` with `verifyLicence` and the licence public keys bundled in the app
   build (docs/08 §5), store it, compute the status with `accessStatus` and the server's status (the stricter wins),
   apply `tillPermissions` when a shift opens, show the grace / read-only / suspended banners, and keep selling in an
   open shift (D14). Back office in read-only mode when the status says so.
3. `tools/admin.mjs` (Node 22, no framework): every command of docs/09 §6, keys in `~/.brandhub/keys/` with mode 600,
   `keys:data` for `DATA_KEY`/`EXPORT_KEY`, the outbox `~/.brandhub/outbox.jsonl` with retries, `test-sequence`. It signs
   licences with the licence key and commands with the command key. It never prints a private key.
4. `POST /api/admin/restore {tenantId, at, dryRun?}` (D28, D49, docs/12 §8): point-in-time restore of one tenant's
   Durable Object, outside the control API but signed and checked like its calls (`verifyRequest`,
   `CONTROL_PUBLIC_KEYS`, request ids). The store takes a bookmark with `getBookmarkForTime(at)`, applies it with
   `onNextSessionRestoreBookmark` and restarts; `dryRun: true` returns the bookmark and changes nothing. The admin.mjs
   command `tenant:pitr --product cafe --tenant tnt_… --at <ISO time> [--dry-run] [--base <URL>]` calls it
   (`tenant:restore` already means un-suspend); it skips the outbox and is never retried, so a late retry cannot roll
   back newer events.
5. Tests: signature failures (stale, bad signature, unknown key, missing header), idempotent replay, licence mismatch
   (422), status transitions with fixed dates in `Africa/Casablanca`, a device in read-only that cannot open a shift but
   finishes an open one (Playwright with `page.clock`).

## Constraints
Private keys never in the repository, in Worker secrets of the products, in logs or in test output (tests generate
throwaway keys).

## Acceptance checks (run them, paste the output)
1. `node tools/admin.mjs test-sequence --product cafe --base <staging URL>` and the same for resto: create → subscription
   → suspend → restore → owner reset → report, each with its HTTP status.
2. The Playwright status test output.
3. `ls -l ~/.brandhub/keys` (permissions only, no content) and `npm run gate`.
4. `node tools/admin.mjs tenant:pitr --product cafe --tenant <demo tenant> --at <one hour ago> --base <staging URL>`:
   its HTTP status and the bookmark used. If staging is not available yet: the same command with `--dry-run` (it prints
   the bookmark and changes nothing), and STATUS says the real restore has not run.

## Update docs/STATUS.md
Row 07; key ids in use; where the public keys are set (names only).

## Commit
`feat(control): control API v1, signed licences, access statuses and admin tool`
