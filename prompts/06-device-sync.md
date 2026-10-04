# Prompt 06 — Device store, sync and Mode panne

> Run after prompt 05.

## Goal
A paired device keeps working with no network, pushes every event exactly once when it can, receives what it needs, and
always shows its sync state.

## Read first
`docs/04-sync-protocol.md` (all) · `docs/03-domain-model.md §6–§7` · `DECISIONS.md` D15, D20, D22, D23, D25, D27 ·
`packages/kit/src/receipts.js`, `licence.js`, `timezone.js`.

## Do
1. `packages/kit-web/src/db.js` (Dexie): tables of docs/03 §6 "Devices"; `navigator.storage.persist()` at pairing; one
   transaction per user action (event + projection update + outbox).
2. `packages/kit-web/src/sync-client.js`: path choice of docs/04 §8 (Station first, cloud, offline), push every 3 s while
   the outbox is not empty (batches of 200), on `online` and `visibilitychange`; pull with `after`; the cloud WebSocket for
   nudges (reconnect with growing delays); events leave the outbox only once the cloud has them (docs/04 §2), so a change
   of hop never leaves a gap; dead letters moved from the outbox; receipt block requests before the low water
   mark (`needsBlock`); licence refresh and trusted clock (`trustedNow`) on every response's `serverTime`.
3. Server side in `packages/kit-worker`: `POST /api/sync/push`, `GET /api/sync/pull`, `GET /api/sync/socket` (Durable
   Object WebSocket hibernation, nudges only), `POST /api/receipts/blocks` (idempotent by `blockId`), `GET /api/licence`
   (returns the stored licence, `null` until prompt 07), with the checks of docs/04 §2 (caller, relaying, allowed types,
   kit rules, the cross-aggregate checks, `E_SEQ_BLOCKED`, sizes, 120 requests/min per device).
4. `SyncBadge` wired in a shared app shell: green / orange "N en attente" / red after 10 min; on reconnection, when a
   printer is attached, print the proof "N tickets synchronisés, 0 perdu" (printing arrives in prompt 09: log it until then).
5. A dev-only page `/dev/sync-lab` in the Café app to create orders through the kit without the till UI (used by tests
   until prompt 12).
6. Adversarial scenarios of docs/04 §10 numbers 1, 2, 4, 6, 7 and 8 as Playwright tests (network cut with
   `context.setOffline`, clock with `page.clock`).

## Constraints
The service worker never caches `/api/*`. Nothing is dropped silently: every refusal ends in the dead-letter list.

## Acceptance checks (run them, paste the output)
1. The six scenario tests pass (names and durations).
2. Offline test: 5 orders created offline → reconnect → the cloud has exactly 5 closed orders, the same totals and the
   same receipt numbers; the outbox is empty.
3. `npm run gate`.

## Update docs/STATUS.md
Row 06; median push delay online measured in the test.

## Commit
`feat(sync): device store, push/pull/socket sync, receipt blocks, sync badge`
