# Prompt 08 — BrandHub Station (local hub)

> Run after prompt 07. A Windows PC is best for the final checks; development can start on any computer.

## Goal
A Windows app that keeps a venue's devices, printers and kitchen working together when the internet is down, and relays
everything to the cloud when it comes back.

## Read first
`docs/04-sync-protocol.md §7–§10` · `docs/05-devices.md §2–§3` · `docs/02-architecture.md §3, §8` · `DECISIONS.md` D24,
D25, D46 · `packages/kit-worker/src/schema.sql`, `tenant-store.js` (reuse the logic, not the Cloudflare APIs).
Check the current Electron and better-sqlite3 documentation (Electron 44 at the time of writing; Electron embeds its own
Node, so rebuild the native module for it with `@electron/rebuild` and record both versions in STATUS).

## Do
1. `apps/station`: Electron main process with a Node HTTP server on port 17800 implementing docs/04 §7 (health, push,
   pull, wait long-poll, receipt block pool, print jobs), CORS for the two product origins only,
   `Access-Control-Allow-Private-Network: true`, device-token checks against the directory received from the cloud.
2. Local store (better-sqlite3, WAL mode): events with `lan_pos`, `pushed_at`, `cloud_pos`; projections needed today; the
   print queue; applies the same kit rules as the cloud; keeps 7 days, prunes what the cloud confirmed.
3. Relay: push to the cloud in `lan_pos` order with `relayedBy`, retry with growing delays; pull every 10 s and on cloud
   WebSocket nudges; directory (`GET /api/station/directory` from the cloud, never served on the LAN) refreshed every 5
   minutes; each pull and wait answer lists `cloudConfirmed` events; rejections from the cloud flow back to the
   device at its next pull. The cloud side accepts relayed events only from the tenant's Station.
4. Pairing: the Station pairs as kind `station` with a code from `/gestion/appareils`; it then shows its own QR (LAN URL,
   station id) for devices. `packages/kit-web/src/station-client.js` uses `fetch(url, { targetAddressSpace: "local" })`,
   health within 1 s, then the path choice of docs/04 §8.
5. Status window (Preact renderer): online/offline, last cloud contact, pending events, devices seen in 5 minutes,
   printers (stubs until prompt 09), "Imprimer un test", logs export. Tray icon, start with Windows, single instance,
   restart after a crash.
6. Packaging: electron-builder NSIS installer, unsigned for now; the version and SHA-256 published for the update check
   (docs/05 §3).
7. Tests: scenarios 5 and 9 of docs/04 §10 (Station restarted mid-service; Station dead before relaying), relay ordering,
   a relayed event rejected by the cloud
   reaching the device, two browser contexts exchanging an order through the Station with the cloud blocked.

## Constraints
The Station never exposes data to a device without a valid token; it listens on the LAN only (not on public interfaces).
It never updates itself while a bank is open.

## Acceptance checks (run them, paste the output)
1. The Station tests pass; the two-device test with the cloud blocked shows the order on the second device within 2 s.
2. Chrome on an Android tablet (or desktop Chrome) reaches `http://<station-ip>:17800/station/health` from the product page
   after granting the local-network permission: paste the result and say which Chrome version.
3. The installer file name, size and SHA-256.

## Update docs/STATUS.md
Row 08; the Local Network Access result per device tested; any browser that failed.

## Commit
`feat(station): local hub with LAN sync, relay, receipt pool and installer`
