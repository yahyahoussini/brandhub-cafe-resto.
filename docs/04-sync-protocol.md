# 04 · Sync protocol — devices, Station, cloud

One protocol at both hops (D25). The device talks to the Station when it has one and it answers within 1 s, otherwise to
the cloud; with neither, it queues. The cloud's TenantStore is the authority: it assigns positions and hashes.

## 1. Device credentials
- Pairing (docs/08 §3) gives each device a token `bhd1.<tenantId>.<deviceId>.<secret>` (secret: 32 random bytes,
  base64url). The Worker reads the tenant id to reach the right TenantStore; the store compares `sha256(token)` with
  `devices.token_hash` and refuses revoked devices (`E_DEVICE_REVOKED`).
- Every request: `Authorization: Bearer <token>`, `X-BH-App: <product>@<version>`. The Station checks the same tokens
  against the device directory it receives from the cloud (§7).

## 2. Push
`POST /api/sync/push` (cloud) or `POST /station/push` (Station)
```json
{ "events": [ { "id": "…", "type": "line.added", "entity": "ord_…", "seq": 2, "device": "dev_…", "staff": "stf_…", "at": 1764486000000, "data": { }, "v": 1 } ],
  "deviceTime": 1764486000500 }
```
- At most 200 events, in the device's creation order. Body ≤ 512 KB; each event's `data` ≤ 16 KB.
- The server handles events one by one: envelope check → device and staff belong to the tenant → the event's `device`
  equals the caller, or the caller is the tenant's Station relaying (`relayedBy`) → the type is allowed for the device
  kind → the kit rule for its aggregate (sequenced: `applyOrderEvent` / `applyBankEvent` against the current state;
  movements and marks: schema only) → the cross-aggregate checks below → store (position, hash) → update projections.
- Cross-aggregate checks (device, Station and cloud alike): money that lands in a bank (`payment.added`,
  `payment.voided`, cash `kredi.repaid`) passes `assertBankAccepts` — the bank is held by the writing device and still
  open; a move is a pair (`lines.moved_out` then `lines.moved_in`, same `moveId`, same batch) stored in one transaction
  or refused together (`E_MOVE_PAIR`); a credit note never refunds more than what is left of its ticket
  (`E_REFUND_EXCEEDS`).
- Also checked by the cloud store (prompt 04): the event's device is in the client's directory (`device.set`) and not
  revoked (`E_UNKNOWN_DEVICE`, `E_DEVICE_REVOKED`); the caller signs its own events unless it is the client's Station
  relaying (`E_WRONG_DEVICE`); a receipt number is used once per client (`E_DUP_RECEIPT`) and belongs to the closing
  device's series; payment ids are unique across orders (`E_DUP_PAYMENT`); an order is transferred only to a till or
  phone of the client; tip-pool events are refused (`E_BAD_EVENT`) until prompt 21 builds their rules. A push over 200
  events or 512 KB is refused whole (`E_TOO_LARGE`, HTTP 413) before anything is stored; the device splits it, never
  between the two events of a move.
- A rejected event in a sequenced aggregate blocks that aggregate's later events in the same batch (`E_SEQ_BLOCKED`);
  other aggregates continue.
- Response:
```json
{ "accepted": ["id…"], "duplicates": ["id…"], "rejected": [{ "id": "…", "code": "E_NOT_OWNER", "message": "…" }],
  "last": 18234, "serverTime": 1764486000800 }
```
- Duplicates (an id already stored) are acknowledged, never stored twice. The device moves rejected events to its
  dead-letter list. It removes an event from its outbox only when the cloud has it: when the cloud answered `accepted` or
  `duplicates`, or when the Station reports it relayed (`cloudConfirmed` in its pull and wait answers). An event only the
  Station holds stays in the outbox, marked as accepted there (it is not pushed to the Station again), so a device that
  changes hop pushes it to the cloud before anything newer of the same aggregate.

## 3. Pull and live updates
`GET /api/sync/pull?after=<pos>&limit=500` → `{ events, last, more, licence?, serverTime }`
- The server filters by device kind: tills and phones get catalog, settings, staff, layout, other devices' open orders
  and banks (for transfers and table states), kitchen status; screens get sent lines for their station and kitchen
  status; the back office gets everything. `licence` is included when it changed since the device's last pull.
- Live updates from the cloud: `GET /api/sync/socket` upgrades to a WebSocket held by the TenantStore with the
  hibernation API (no duration billed while idle); the store sends `{"last": pos}` nudges and the device pulls.
- Live updates from the Station: `GET /station/wait?after=<lanPos>&timeout=25` (long-poll over `fetch`), because
  Chrome's Local Network Access exemption covers `fetch`, not WebSockets.

## 4. Receipt blocks and licence
- `POST /api/receipts/blocks {blockId, size}` → `{blockId, prefix, start, end}`; `blockId` is made by the device before
  the call, so a retry returns the same block (`receipts.js`). `POST /station/receipts/blocks` hands out a block from
  the Station's pool (two blocks per device, refilled from the cloud when online).
- `GET /api/licence` → `{token, status, serverTime}`. The device verifies the token (`licence.js`), stores it, and applies
  a new status at the next shift opening (D14). `serverTime` feeds the trusted clock.

## 5. Dead letters
A rejected event is never edited or re-sent. The device shows the manager "À vérifier (N)" with the code in plain
words; the back office lists them with the event's content. Resolutions are new events (for example a new order entered
by the manager with the note "reprise ticket refusé") and `deadletter.resolved {how, note}`, whose entity is the
rejected event's id (docs/03 §5), marks the item done.
Common codes: `E_NOT_OWNER` (a device wrote after a take-over), `E_DEVICE_REVOKED`, `E_SEQ` (a gap after a crash),
`E_OVERPAID`, `E_BAD_DATA`.

## 6. Clock
Devices keep a trusted clock (`trustedNow`): never earlier than the latest server or event time seen. An event is stored
with `clock_skew = 1` when its `at` is more than 5 minutes ahead of `recvAt`, or when the device wrote it while
`trustedNow` reported a clock set back (the device adds `data.clock: "rolled_back"`); reports use `recvAt` for the
business day of flagged events, `at` for all others (an event queued offline keeps its real time). Receipts print the
device's time. A device whose clock went backwards needs an online check before opening a shift.

## 7. The Station
Base URL `http://<station-ip>:17800` (DHCP reservation set at installation). Every response has CORS for the product
origins only and `Access-Control-Allow-Private-Network: true`; devices call it with
`fetch(url, { targetAddressSpace: "local" })` and Chrome asks once for the local-network permission.
| Endpoint | Does |
|---|---|
| `GET /station/health` | version, tenant, online state, last cloud contact, pending count |
| `POST /station/push` | same as §2; the Station applies the kit rules, stores with `lanPos`, answers at once, relays later |
| `GET /station/pull`, `GET /station/wait` | same as §3 from the Station's store |
| `POST /station/receipts/blocks` | block from the pool |
| `POST /station/print` | `{printerId, bytes (base64) | template + data, copies}` → `{jobId}`; `GET /station/print/:jobId` status |
The Station gets its directory from the cloud (`GET /api/station/directory`, Station token only): device token hashes,
staff PIN hashes, printers. It never serves the directory on the local network.
Relay to the cloud: batches of 200 with `relayedBy`, in `lanPos` order, retried with growing delays (1 s → 5 min). Pull
from the cloud every 10 s when online (and on WebSocket nudges) for catalog, settings, licence and back-office events.
If the cloud rejects an event the Station accepted, the rejection flows back to the device at its next Station pull.
Kitchen tickets and bar tickets are printed by the Station when it stores `lines.sent` / `lines.fired`, so a phone that
dies after sending does not lose the ticket.

## 8. Choosing the path (device)
1. A Station is configured and `/station/health` answers within 1 s → push and pull there.
2. Otherwise the cloud answers → push and pull there (and keep checking the Station every 30 s).
3. Otherwise → offline: sell, print locally if a printer is attached, queue in the outbox, badge "N en attente".
Push every 3 s while the outbox is not empty, on reconnection and when the app comes back to the foreground.
At pairing, request persistent storage (`navigator.storage.persist()`) so Chrome does not evict the outbox.

## 9. Special cases
- **Two phones open the same table offline:** both orders exist; the table shows two orders; the waiter merges them later
  with a move (`lines.moved_out` + `lines.moved_in`): the lines keep their sent state, so there is no approval, no void
  signal and no second ticket; the emptied order is voided with reason « fusion », which needs no approval once it holds
  no sent line. The device must own both orders (a transfer first if not). Splitting a bill works the same way.
- **Taken-over bank or order:** the old owner's late events are rejected (`E_NOT_OWNER`, and payments into the bank he no
  longer holds by `assertBankAccepts`) and listed "encaissement après reprise" for the manager: this is a real loss
  signal, shown with the amount. "Remettre ma caisse" is refused while the phone still owns open orders: it transfers or
  closes them first.
- **Revoked while offline:** events with `at` before the revocation time are accepted and flagged; later ones are rejected.
- **Reset device:** re-pairing abandons the rest of its receipt block (§7 of docs/03) and starts a new outbox; anything
  not pushed before the reset is lost and the manager sees the gap in the block report.
- **Catalog changed while a till is offline:** the till keeps selling at its prices; each line keeps its price snapshot.

## 10. Adversarial scenarios (tests in prompts 06, 08 and 19)
1. Router unplugged in the middle of an order: finish, pay, print, plug back → pushed once, same totals and numbers.
2. Two phones take the same table offline → two orders, merged later, totals exact.
3. A waiter's phone stays offline while the manager takes over his bank → its late cash-in and any table it cashes go to
   review with their amounts; the counted bank does not change.
4. The same batch pushed twice (retry after a timeout) → all duplicates, nothing stored twice.
5. The Station restarts during service → devices switch to the cloud or queue; nothing lost; the kitchen resumes.
6. A tablet's clock set two days back → trusted clock holds; shift opening asks for an online check; reports use `recvAt`.
7. A device revoked while offline → earlier sales accepted and flagged, later events rejected.
8. A till reaches 0 receipt numbers offline → it warned at 150; it keeps taking orders and closes them when a block arrives.
9. The Station accepts seq N of an order and dies before relaying it; the device goes on through the cloud → it pushes N
   again (still in its outbox), then N+1; nothing lost, no `E_SEQ`; when the Station comes back, its copy of N is a
   duplicate.
