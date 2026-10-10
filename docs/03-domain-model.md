# 03 · Domain model — ids, money, events, aggregates, storage, settings

The kit (`packages/kit/src`) implements §2–§5 and §7–§8 and is tested; code must call it, never re-implement it:
`ids.js` (§2), `money.js` (§3), `events.js` (§4 envelope, the §5 type registry and movement payloads), `order.js`,
`bank.js`, `marks.js`, `stock.js` (§5), `receipts.js` (§7), `marks.js` (§8 defaults and checks), `permissions.js`
(D38), `reports.js` (docs/10). Not yet: the tip-pool reducer (V1.1, prompt 21). Storage (§6) is built in prompts 04, 06
and 08.

## 1. Principles
1. **Events, never edits** (D20). A device creates an event for every change; the event is stored as sent, forever.
2. **Three kinds of aggregates.** *Sequenced* (one writer, strict `seq`): orders, banks, tip pools. *Movements* (any
   device; they add up in any order): stock movements, Kredi repayments, clock punches, dose readings. *Marks* (last
   writer wins by `at`, then `device`, then `id`, per entity and type — and per key where the table says so:
   `settings.set` per `path`, `kitchen.status` per `sentEventId` and `station`, `day.closed` per `businessDate`):
   catalog, settings, staff profiles,
   layout, kitchen status, table marks. Two types on the same entity never overwrite each other (a PIN change is
   `staff.pin_set`, not `staff.set`).
3. **Projections are disposable.** Every table other than `events` can be rebuilt from the log (`npm run rebuild` in
   the TenantStore and the Station); tests prove that rebuilding gives the same numbers.
4. **The same rules everywhere.** Tablet, Station and cloud run the same kit functions on the same events.

## 2. Identifiers (`ids.js`)
Event ids are UUIDv7 made on the device. Entity ids are `<prefix>_<uuidv7>`: `tnt` tenant · `own` owner/manager account ·
`dev` device · `stf` staff · `sit` site · `ord` order · `lin` line · `pay` payment · `bnk` bank · `tip` tip pool ·
`kit` kitchen ticket · `prd` product · `cat` category · `mod` modifier · `zon` zone · `tbl` table · `itm` stock item ·
`sup` supplier · `mch` coffee machine · `cus` customer · `inv` B2B invoice · `blk` receipt block · `prt` printer ·
`rsv` reservation · `evn` event night · `pur` purchase order · `bok` order-book entry · `trf` stock transfer between
sites. The cloud writes as `dev_cloud`, a Station as its own `dev_…`.
`shortCode(id)` gives "7F3K-2Q" for pre-bills and messages, always shown with the date.

## 3. Money (`money.js`, D21)
Integer centimes; prices TTC; VAT rates in basis points (1000 = 10 %). A line's total is
`round(unit × qtyMilli / 1000)` with options added to the unit. An order discount is spread over the active lines by
largest remainder, then each line's VAT is `net − round(net × 10000 / (10000 + rate))`, rounded half away from zero.
Quantities are thousandths (1000 = 1 unit; 250 = 250 g of a per-kg item). `formatAmount` writes `1 234,50 DH` /
`1 234,50 درهم` with western digits.

## 4. The event envelope
```js
{
  id: "0196f4c2-…",          // uuidv7, created on the device
  type: "line.added",        // see §5
  entity: "ord_0196f4c1-…",  // the aggregate
  seq: 2,                    // sequenced aggregates only (1, 2, 3 …); null for movements and marks
  device: "dev_…",           // the writer
  staff: "stf_…",            // who, from the PIN session; null for system events
  at: 1764486000000,         // device clock, Unix ms
  data: { … },               // payload, ≤ 16 KB
  v: 1                       // envelope version
}
```
Stored events add `pos` (1, 2, 3 … per client), `recvAt` (server clock), `relayedBy` (the Station, when relayed),
`clockSkew`, `prevHash` and `hash` (`journal.js`, which hashes the envelope with `v` and these fields; `clockSkew` as
0/1). The cloud assigns
`pos` and the hash; the Station keeps a local `lanPos` only.

**Writers** (`events.js`). A paired device writes as its own `dev_…` with `staff` from the PIN session. The back office
(`office`, an owner or manager session) writes through the Worker as `dev_cloud` with `staff` = the account's `own_…`.
System events of the cloud (receipt blocks, invoices, the day Z) are `dev_cloud` with `staff` null. `validateEnvelope`
checks the envelope (codes `E_BAD_EVENT`, `E_TOO_LARGE`), `assertCanWrite` the device kind of each type and that a
paired device never signs with an `own_…` (`E_FORBIDDEN_TYPE`; the day Z on `tnt_…` is the cloud's only),
`validateMovement` and `validateMark` the payload of a movement or a mark (`E_BAD_DATA`; each setting against the
Values column of §8).

## 5. Event catalogue
**Order `ord` — sequenced — `order.js`**
| Type | Data | Rule |
|---|---|---|
| `order.opened` | `mode` (counter/table/takeaway/delivery), `tableId`, `zoneId`, `covers`, `source` (pos, web, qr, phone, glovo…), `training`, `refundOf {orderId, receiptNo, restock}`, `approvedBy` | seq 1; a credit note (`refundOf`) needs approval and never refunds more than what is left of its ticket (server, `E_REFUND_EXCEEDS`); a TEST order (`training: true`) takes numbers from the device's training series (`T` + prefix: `TC1-000001`) and stays out of every report |
| `line.added` | `lineId`, `productId`, `name {fr, ar}`, `unitCentimes`, `qtyMilli`, `vatBp`, `modifiers [{id, name, priceCentimes}]`, `station`, `category`, `doses`, `note`, `seat`, `course` | snapshot of the price at the time of sale |
| `line.qty_changed` | `lineId`, `qtyMilli` | not after sending |
| `line.voided` | `lineId`, `reason`, `approvedBy` | approval once sent, unless held |
| `lines.sent` | `lineIds`, `hold` | `hold: true` = "à suivre", shown to the kitchen, not to cook |
| `lines.fired` | `lineIds` | fires held lines |
| `discount.set` / `discount.cleared` | `kind` percent/amount, `value`, `reason`, `approvedBy` | cap per role checked before the event (D38) |
| `order.moved`, `order.covers_set`, `order.note_set` | `tableId`/`zoneId`, `covers`, `note` | |
| `payment.added` | `paymentId`, `tender`, `amountCentimes`, `tenderedCentimes`, `reference`, `bankId` | never above the total |
| `payment.voided` | `paymentId`, `reason`, `approvedBy` | approval after 2 minutes |
| `order.closed` | `receiptNo` | only when fully paid; the number comes from `receipts.js` |
| `order.voided` | `reason`, `approvedBy` | no active payment; approval once something was cooked |
| `order.transferred` | `toDevice` | by the owner |
| `order.taken_over` | `approvedBy`, `reason` | by another device; the old owner's later events go to review |
| `order.customer_set` | `customerId` (`cus_…` or null) | while open (Kredi, stamp card, deliveries) |
| `lines.moved_out` / `lines.moved_in` | `moveId`, `toOrderId` + `lineIds` / `fromOrderId` + `lines` (snapshots with their sent, held and fired state) | merge, split, part of a bill to another table: a pair with the same `moveId`, written by the device that owns both orders, stored in one transaction or refused together (`E_MOVE_PAIR`); no approval, no void, no second ticket |

Tenders: `cash`, `card_external` (reference = terminal slip code), `maroc_pay` (reference), `transfer`, `voucher`,
`credit` (Kredi, reference = `cus_…`), `other`.

**Bank `bnk` — sequenced — `bank.js`:** `bank.opened {kind till/waiter, holder, floatCentimes}` · `bank.cash_in
{amountCentimes, reason}` · `bank.cash_out {amountCentimes, reason, approvedBy, advanceTo?}` (a staff advance is a cash
out with `advanceTo: stf_…`) · `bank.no_sale {reason, approvedBy}` · `bank.reprint {orderId, receiptNo, approvedBy?}` ·
`bank.counted {countedCentimes, breakdown?}` · `bank.closed` · `bank.taken_over {approvedBy}`.
Money from other aggregates — order payments and cash `kredi.repaid` — enters a bank only from the device that holds it,
while it is open (`assertBankAccepts` in `bank.js`: `E_NOT_OWNER`, `E_BANK_CLOSED`, `E_BANK_UNKNOWN`). Expected cash counts
both (`expectedCash`).

**Tip pool `tip` — sequenced (V1.1, prompt 21):** `tip.pool_opened {businessDate, label, rule}` · `tip.added
{amountCentimes, source, bankId?}` · `tip.member_set {staffId, hours?, role?}` · `tip.closed {splits [{staffId,
amountCentimes}]}` · `tip.adjusted {splits, reason, approvedBy}` (a correction after closing).

**Movements**
| Type | Entity | Data |
|---|---|---|
| `machine.reading` | `mch_…` | `reading`, `kind` open/close/check, `photoKey?`, `businessDate` |
| `machine.off_till` | `mch_…` | `doses`, `reason` (test, staff, offered, purge) |
| `stock.counted` | `itm_…` | `qtyMilli`, `area?` (a snapshot: the level becomes this value at `at`) |
| `stock.received` | `itm_…` | `qtyMilli`, `costCentimes?`, `supplierId?`, `noteKey?` |
| `stock.wasted` / `stock.adjusted` | `itm_…` | `qtyMilli` (adjusted may be negative), `reason` |
| `kredi.repaid` | `cus_…` | `amountCentimes` (negative = money given back, needs `approvedBy`), `tender`, `bankId` (cash only: the open bank of the device that took or gave the cash), `reference?` (for example `rsv_…`, `bok_…`, a cheque number) |
| `staff.clock` | `stf_…` | `kind` in/out, `source` pin/badge |
| `receipts.block_reserved` | `blk_…` | `deviceId`, `prefix`, `start`, `end` (cloud only) |
| `receipts.block_abandoned` | `blk_…` | `from` (cloud only, at re-pairing) |
| `invoice.issued` | `inv_…` | `invoiceNo`, `orderIds`, `buyer {name, ice, address}`, `totals`, `creditOf?` (the invoice a credit invoice corrects) (cloud only, online) |
| `z.closed` | `bnk_…` (bank Z) or `tnt_…` (day Z) | `businessDate`, `totals` (the Z of docs/10 §2), `hash` of the totals — written once when the bank or the day closes; the Z shown later is this record, never a recomputation |

Sales deduct stock without events: the projection applies each closed order's lines to the recipe (or product
deduction list) that was in force at closing time. A credit note gives its ingredients back only when
`refundOf.restock` is true (goods came back unused); otherwise the projection records them as waste with the credit
note's reason. Kredi charges are the `credit` tenders of closed orders.

**Marks (last writer wins)**
| Type | Entity | Data |
|---|---|---|
| `catalog.category_set` | `cat_…` | `name`, `station`, `sort`, `visible`, `taxClass` (drink · food, débit de boissons, docs/11 §6), `course` (1..6, the default course of its lines, Resto) |
| `catalog.product_set` | `prd_…` | `categoryId`, `name`, `priceCentimes`, `vatBp`, `doses`, `deductions [{itemId, qtyMilli}]`, `modifierGroups`, `priceByZone {zon_…: centimes}`, `available`, `sort`, `imageKey` |
| `catalog.product_availability` | `prd_…` | `available` ("86" from the till) |
| `catalog.modifier_group_set` | `mod_…` | `name`, `min`, `max`, `options [{id, name, priceCentimes}]` |
| `catalog.recipe_set` (Resto) | `prd_…` | `lines [{itemId, qtyMilli}]`, `yieldMilli`, `effectiveFrom` |
| `catalog.set_menu_set` (Resto) | `prd_…` | `steps [{name, choices [prd_…], min, max}]`, `priceCentimes` |
| `stock.item_set` | `itm_…` | `name`, `unit` (g, ml, piece), `parMilli`, `costCentimes`, `area` |
| `staff.set` | `stf_…` | `displayName`, `role`, `canApprove`, `active`, `lang`, `clockId?` (the user PIN on a ZKTeco clock), `siteIds?` (V2) |
| `staff.pin_set` | `stf_…` | `pinHash`, `pinSalt`, `iterations` (written by the device where the PIN was chosen) |
| `zone.set` / `table.set` | `zon_…` / `tbl_…` | name, sort, seats, position and shape (Resto) |
| `table.mark` | `tbl_…` | `state` cleaning/free |
| `kitchen.status` | `ord_…` | `sentEventId`, `station`, `status` new/preparing/ready/served/recalled |
| `settings.set` | `tnt_…` | `path`, `value` (§8) |
| `device.set` | `dev_…` | `name`, `kind`, `prefix`, `station`, `printerId` |
| `day.closed` | `tnt_…` | `businessDate` (the manager's end-of-day button; triggers "send the report now") |
| `deadletter.resolved` | the rejected event's id | `how`, `note` (the manager's resolution, docs/04 §5) |

Heartbeats, login attempts and sessions are not events: they live in plain tables (§6) and expire. Heartbeats follow
the last-writer-wins rule D20 gives marks (a device's latest heartbeat replaces the one before, as its last seen), but
in the `heartbeats` table, not in the event log.

## 6. Storage
**TenantStore (cloud, SQLite in the Durable Object).** Implemented in prompt 04 from `packages/kit-worker/src/schema.sql`:
```sql
CREATE TABLE events (
  pos INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, entity TEXT NOT NULL, seq INTEGER,
  device TEXT NOT NULL, staff TEXT, at INTEGER NOT NULL, recv_at INTEGER NOT NULL, relayed_by TEXT,
  data TEXT NOT NULL, v INTEGER NOT NULL DEFAULT 1, prev_hash TEXT NOT NULL, hash TEXT NOT NULL,
  clock_skew INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX events_entity_seq ON events(entity, seq) WHERE seq IS NOT NULL;
CREATE INDEX events_entity ON events(entity);
CREATE INDEX events_type_at ON events(type, at);
CREATE TABLE deadletter (id TEXT PRIMARY KEY, device TEXT, received_at INTEGER, code TEXT, message TEXT, event TEXT, resolved_at INTEGER, resolved_by TEXT);
```
Projections (rebuildable): `orders` (id, status, mode, table, zone, covers, owner, opened/closed at, business_date,
receipt_no UNIQUE, total, paid, discount, state JSON) · `sales_lines` (one row per active line of a closed order:
product, category, tax class (the category's `taxClass` in force at closing, docs/11 §6), station, qty, net TTC, VAT
rate and amount, doses, zone, staff, device, business date, hour) ·
`payments` · `banks` (with expected, counted, variance) · `catalog_*` · `staff` · `devices` (token hash, kind, prefix,
station, paired/revoked/last seen, app version) · `zones`, `tables` · `stock_items`, `stock_levels`, `stock_movements` ·
`machine_readings` · `receipt_series` (ledger per till) · `settings` (path, value, at, event id) · `daily` (business date,
revenue, tickets, covers, VAT by rate, tenders, voids, no-sales, reprints, cash gaps, dose gaps) · `customers` (Kredi,
phone encrypted) · `kitchen_tickets` (Resto).
Non-event tables: `owners` (email, PBKDF2 hash, salt, iterations, TOTP secret encrypted, role), `sessions`,
`activations` (token hash, code hash, expiry, used), `licence` (token, payload, status), `messages` (channel, kind,
recipient hash, status, count), `auth_log` (90 days), `heartbeats`, and the personal-data tables below.

**Personal data lives outside the log.** Events never carry a name, a phone number or an address: they carry `cus_…` or
`stf_…`. `customers_pii` (per `cus_…`: name, phone and addresses encrypted with `DATA_KEY`, the phone's keyed hash, the
consent record with its text version, time and staff) and `staff_pii` (a staff member's phone for statements, with his
consent) are ordinary tables: erasure deletes the row, the events stay valid. A device that creates a customer offline
keeps his fields in its own store and sends them to `POST /api/customers` (not an event) when it can. Devices and the
Station receive the rows they need for today over the authenticated API, look numbers up with the client's `LOOKUP_KEY`
(HMAC, docs/08 §5), and delete the rows after 7 days.

**Station (better-sqlite3).** The same `events` table without `prev_hash`/`hash`, plus `lan_pos`, `pushed_at`,
`cloud_pos`; the projections needed today (catalog, staff, devices, zones/tables, open orders, banks, kitchen tickets,
receipt block pools); a `print_jobs` queue. Keeps 7 days, then prunes events already confirmed by the cloud.

**Devices (Dexie).** `meta` (device id, token, tenant, station URL, licence, trusted clock, receipt numbering, training
numbering), `customers` (today's personal-data rows, 7 days), `catalog`,
`staff` (PIN hashes), `settings`, `events` (own and received), `outbox` (own, not yet acknowledged), `orders` and `banks`
(open and today's), `deadletter`. Keeps today plus 7 days of its own events.

## 7. Receipt numbers (`receipts.js`, D22)
Every device that closes orders has a prefix: tills `C1`, `C2` …, waiter phones `S1`, `S2` …, set at pairing and never
reused. The cloud keeps each series' ledger and reserves blocks of 500; a device asks for the next block when fewer than
150 numbers remain. A Station keeps a pool of two blocks per device, reserved from the cloud in advance, to hand out
while offline. The number is taken when the order closes. At re-pairing after a reset, the cloud writes
`receipts.block_abandoned` from the last number it has seen, and the device gets a fresh block.

## 8. Settings — what a client can customise
Settings are marks (`settings.set {path, value}`); defaults live in the pure kit (`packages/kit/src/marks.js`, prompt 03)
so devices have them offline.
| Path | Values | Default (Café / Resto) |
|---|---|---|
| `service.mode` | counter · waiter · both | both / waiter |
| `service.banking` | till · per_waiter · both | both / both |
| `service.zones` | list of `zon_…` | salle, terrasse / salle |
| `receipt.languages` | fr · ar · fr+ar | fr+ar |
| `receipt.header`, `receipt.footer` | up to 4 lines each | legal lines from onboarding |
| `receipt.width` | 32 (58 mm) · 48 (80 mm) | 48 |
| `receipt.lineLanguage` | fr · ar (language of the lines when `receipt.languages` is fr+ar) | fr |
| `receipt.printOnClose` | always · ask · never (digital only) | always |
| `printing.routes` | `[{category, station, printerId}]` | bar for drinks, cuisine for food |
| `printing.barTicketOnPayment` | true · false | true / false |
| `taxes.defaultVatBp` | 0..2000 | 1000 |
| `taxes.byMode` | `{takeaway, delivery}` rate or null (= default) | null (confirm with the accountant) |
| `taxes.debitDeBoissons` | `{enabled, rateBp, commune}` | from onboarding (Casablanca 800) |
| `approvals.discountCapBp` | per role | cashier 1000, waiter 0, manager 5000 |
| `approvals.freeReprints` | 0..3 | 1 |
| `approvals.approvers` | staff ids flagged `canApprove` | owner and managers |
| `tips` | `{enabled, rule equal/hours/role, roles}` | off until V1.1 |
| `reports.eveningTime` | HH:MM | 23:30 |
| `reports.channels` | whatsapp · email | whatsapp, email |
| `reports.thresholds` | `{cashGapCentimes, dose {minDoses, relativeBp}}` | 2000; 5 doses or 3 % |
| `hours.businessDayCutoff` | HH:MM | 05:00 |
| `hours.ramadan` | opening template (V1.1) | none |
| `languages.default` | fr · ar | fr |
| `ordering.inboxDeviceId` | the till that receives web, QR and order-book orders (Resto V1.1) | the first till |
| `deposits.vatOnReceipt`, `deposits.keptVatBp` | the accountant's answers (prompt 39); deposits stay off while empty | empty |
| `lock.tillSeconds`, `lock.phoneSeconds` | seconds without a tap before the lock screen (docs/06 §1) | 120, 300 |
| `permissions` | per action of `data/permissions.json`: `{roles?, approval?, capBp?, freeCount?}`, clamped to each `floor` (`permissions.js`) | {} |
Permissions (who may do what) are settings too, seeded from `data/permissions.json` (D38); `approvals.discountCapBp`
and `approvals.freeReprints` feed the same rules.

## 9. Errors
The kit throws `OrderRuleError` / `BankRuleError` / `EventError` with a `code` (a malformed amount or rate is
`E_BAD_DATA`, never an uncoded error). The sync API returns the same codes in `rejected[]`
(docs/04 §5). The apps translate codes, never messages, through `i18n` keys `errors.<code>`:
`E_BAD_EVENT`, `E_BAD_DATA`, `E_ENTITY`, `E_SEQ`, `E_NOT_OPENED`, `E_NOT_OWNER`, `E_STATUS`, `E_LINE_UNKNOWN`,
`E_LINE_SENT`, `E_LINE_VOIDED`, `E_NOT_HELD`, `E_DUP_LINE`, `E_DUP_PAYMENT`, `E_PAYMENT_UNKNOWN`, `E_PAYMENT_VOIDED`,
`E_APPROVAL_REQUIRED`, `E_OVERPAID`, `E_TENDERED_LOW`, `E_NOT_PAID`, `E_HAS_PAYMENTS`, `E_EMPTY`, `E_REFUND_SIGN`,
`E_LINE_MOVED`, `E_BANK_UNKNOWN`, `E_BANK_CLOSED`; sync-level codes (docs/04): `E_SEQ_BLOCKED`, `E_DEVICE_REVOKED`,
`E_FORBIDDEN_TYPE`, `E_TOO_LARGE`, `E_UNKNOWN_STAFF`, `E_MOVE_PAIR`, `E_REFUND_EXCEEDS`; HTTP-level codes of the
product Workers' `/api/*` (prompt 04, body `{ "code": "E_…" }`): `E_NOT_FOUND` (404, unknown path), `E_METHOD` (405,
known path with another method, `Allow` header), `E_INTERNAL` (500, unexpected error; the log names the route and the
error's class, never its message).
