-- The database of one client's TenantStore: SQLite inside its Durable Object, in the EU jurisdiction (D19).
-- docs/03-domain-model.md §6. This file is the whole schema after every migration of migrations.js; a node:test
-- (test/migrations.test.js) applies the migrations to an empty database and checks that sqlite_master is exactly this
-- file's, so the two cannot drift. Change the schema by adding a migration and updating this file; never edit an
-- applied migration (docs/12 §10). The migration runner keeps its own version table, _schema (migrate.js).
--
-- Every table is STRICT: an INTEGER column refuses a REAL, so a float amount can never be stored (D21).
-- Amounts are integer centimes TTC; quantities thousandths; times Unix milliseconds; dates YYYY-MM-DD.

-- ── The event log (D20) ─────────────────────────────────────────────────────────────────────────────────────────
-- Rows are inserted once, never updated or deleted (the triggers refuse it); `pos` and the hashes are the cloud's.
CREATE TABLE events (
  pos INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, entity TEXT NOT NULL, seq INTEGER,
  device TEXT NOT NULL, staff TEXT, at INTEGER NOT NULL, recv_at INTEGER NOT NULL, relayed_by TEXT,
  data TEXT NOT NULL, v INTEGER NOT NULL DEFAULT 1, prev_hash TEXT NOT NULL, hash TEXT NOT NULL,
  clock_skew INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX events_entity_seq ON events(entity, seq) WHERE seq IS NOT NULL;
CREATE INDEX events_entity ON events(entity);
CREATE INDEX events_type_at ON events(type, at);
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are never updated (D20)'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events are never deleted (D20)'); END;

-- Events the store refused (docs/04 §5), with the code; resolved by a `deadletter.resolved` mark.
CREATE TABLE deadletter (
  id TEXT PRIMARY KEY, device TEXT, received_at INTEGER, code TEXT, message TEXT, event TEXT, resolved_at INTEGER,
  resolved_by TEXT
) STRICT;

-- ── Projections (rebuildable from the log: TenantStore.rebuild() empties and replays them) ─────────────────────
-- Sequenced aggregates keep their kit state (order.js, bank.js) as JSON in `state`; the columns are for queries.

-- `business_at` is the instant that decides the business day (the closing for a closed order, the voiding for a
-- voided one, the opening otherwise; the server's recv_at for a clock-skewed event, docs/04 §6); `business_date` is
-- that instant's day with the cut-off in force when the row was written.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'voided')),
  mode TEXT NOT NULL,
  table_id TEXT,
  zone_id TEXT,
  covers INTEGER NOT NULL,
  owner TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  business_at INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  receipt_no TEXT UNIQUE,
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL,
  discount INTEGER NOT NULL,
  refund_of TEXT,
  state TEXT NOT NULL
) STRICT;
CREATE INDEX orders_business_at ON orders(business_at);
CREATE INDEX orders_status ON orders(status);
CREATE INDEX orders_refund_of ON orders(refund_of) WHERE refund_of IS NOT NULL;

-- One row per payment of every order (the full payment is in orders.state).
CREATE TABLE payments (
  payment_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  tender TEXT NOT NULL,
  amount INTEGER NOT NULL,
  voided INTEGER NOT NULL CHECK (voided IN (0, 1)),
  training INTEGER NOT NULL CHECK (training IN (0, 1)),
  at INTEGER NOT NULL
) STRICT;
CREATE INDEX payments_bank ON payments(bank_id);
CREATE INDEX payments_order ON payments(order_id);

-- One row per active line of a closed order (credit notes negative; TEST orders never): net TTC after the order
-- discount and its VAT come from the kit (order.js lineAmounts); tax_class is the category's taxClass in force at
-- closing (docs/11 §6); staff is who opened the order; device is the one that closed it; hour is local.
CREATE TABLE sales_lines (
  order_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  category TEXT,
  tax_class TEXT,
  station TEXT,
  qty_milli INTEGER NOT NULL,
  net_ttc INTEGER NOT NULL,
  vat_bp INTEGER NOT NULL,
  vat INTEGER NOT NULL,
  doses INTEGER NOT NULL,
  zone_id TEXT,
  staff TEXT,
  device TEXT NOT NULL,
  business_date TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  PRIMARY KEY (order_id, line_id)
) STRICT;
CREATE INDEX sales_lines_business_date ON sales_lines(business_date);

-- Cash banks: expected and variance from bank.js (expectedCash, cashVariance) over the bank's cash payments and its
-- cash `kredi.repaid`.
CREATE TABLE banks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  holder TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'counted', 'closed')),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  business_at INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  expected INTEGER NOT NULL,
  counted INTEGER,
  variance INTEGER,
  state TEXT NOT NULL
) STRICT;
CREATE INDEX banks_business_at ON banks(business_at);

-- Marks (last writer wins by at, device, id; marks.js): the winning event per entity, its data as JSON.
-- `writer` is the device of the winning event; the entity's own columns come first.
CREATE TABLE catalog_categories (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE catalog_products (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE catalog_availability (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE catalog_modifier_groups (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE catalog_recipes (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE catalog_set_menus (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE staff (
  id TEXT PRIMARY KEY, role TEXT NOT NULL, active INTEGER NOT NULL CHECK (active IN (0, 1)), data TEXT NOT NULL,
  at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL
) STRICT;
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
-- The device directory from `device.set` (kind and receipt prefix); its credentials are in device_access.
CREATE TABLE devices (
  id TEXT PRIMARY KEY, kind TEXT, prefix TEXT, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL,
  event_id TEXT NOT NULL
) STRICT;
CREATE TABLE zones (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE tables (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE table_marks (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE settings (path TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE days_closed (business_date TEXT PRIMARY KEY, staff TEXT, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;

-- Stock (stock.js): items are marks, movements are rows, levels come from stockLevels().
CREATE TABLE stock_items (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL, event_id TEXT NOT NULL) STRICT;
CREATE TABLE stock_movements (
  event_id TEXT PRIMARY KEY, item_id TEXT NOT NULL, type TEXT NOT NULL, qty_milli INTEGER NOT NULL,
  at INTEGER NOT NULL, writer TEXT NOT NULL, data TEXT NOT NULL
) STRICT;
CREATE INDEX stock_movements_item ON stock_movements(item_id);
CREATE TABLE stock_levels (
  item_id TEXT PRIMARY KEY, level_milli INTEGER NOT NULL, last_count_at INTEGER, last_count_milli INTEGER,
  received_milli INTEGER NOT NULL, wasted_milli INTEGER NOT NULL, adjusted_milli INTEGER NOT NULL,
  sold_milli INTEGER NOT NULL, refund_waste_milli INTEGER NOT NULL, gap_milli INTEGER
) STRICT;

-- Dose counter readings and off-till doses (`machine.reading`, `machine.off_till`).
CREATE TABLE machine_readings (
  event_id TEXT PRIMARY KEY, machine_id TEXT NOT NULL, type TEXT NOT NULL, kind TEXT, reading INTEGER, doses INTEGER,
  business_at INTEGER NOT NULL, business_date TEXT NOT NULL, at INTEGER NOT NULL, writer TEXT NOT NULL
) STRICT;
CREATE INDEX machine_readings_business_date ON machine_readings(business_date);

-- The ledger of each receipt series (receipts.js SeriesLedger) and the last number seen closed.
CREATE TABLE receipt_series (
  prefix TEXT PRIMARY KEY, device_id TEXT, last_end INTEGER NOT NULL, last_used INTEGER NOT NULL, ledger TEXT NOT NULL
) STRICT;

-- The day's numbers (docs/10 §1), the kit's buildDay for that business day; `dirty` = to recompute.
CREATE TABLE daily (
  business_date TEXT PRIMARY KEY,
  revenue INTEGER,
  tickets INTEGER,
  covers INTEGER,
  vat TEXT,
  tenders TEXT,
  voids TEXT,
  no_sales INTEGER,
  reprints INTEGER,
  cash_gaps TEXT,
  dose_gaps TEXT,
  report TEXT,
  dirty INTEGER NOT NULL CHECK (dirty IN (0, 1))
) STRICT;

-- Customers seen in events (Kredi, stamp card, deliveries); their personal fields are in customers_pii.
CREATE TABLE customers (id TEXT PRIMARY KEY, last_at INTEGER NOT NULL) STRICT;

-- Tickets per station of each `lines.sent` (kitchen and bar screens), with the winning `kitchen.status`.
CREATE TABLE kitchen_tickets (
  order_id TEXT NOT NULL,
  sent_event_id TEXT NOT NULL,
  station TEXT NOT NULL,
  line_ids TEXT,
  held INTEGER,
  sent_at INTEGER,
  fired_at INTEGER,
  status TEXT,
  status_at INTEGER,
  status_writer TEXT,
  status_event_id TEXT,
  PRIMARY KEY (order_id, sent_event_id, station)
) STRICT;

-- Summaries recomputed on demand (stock levels): 1 = to recompute.
CREATE TABLE projection_state (name TEXT PRIMARY KEY, stale INTEGER NOT NULL CHECK (stale IN (0, 1))) STRICT;

-- ── Tables outside the log (never rebuilt; filled by the APIs of prompts 05, 07, 18, 22) ─────────────────────────
-- Owner, manager and accountant accounts (docs/08 §1): `data` holds what prompt 05 adds (recovery codes, terms).
CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  totp_secret_enc TEXT,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE TABLE activations (
  token_hash TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE TABLE licence (
  id INTEGER PRIMARY KEY CHECK (id = 1), token TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE messages (
  id TEXT PRIMARY KEY, channel TEXT NOT NULL, kind TEXT NOT NULL, recipient_hash TEXT, status TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}'
) STRICT;
-- Kept 90 days; never an IP, a password or a token in clear (docs/08 §1).
CREATE TABLE auth_log (
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, subject TEXT, outcome TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE INDEX auth_log_at ON auth_log(at);
-- A device's latest contact replaces the one before (docs/03 §5, last writer wins), outside the log.
CREATE TABLE heartbeats (
  device_id TEXT PRIMARY KEY, at INTEGER NOT NULL, app_version TEXT, data TEXT NOT NULL DEFAULT '{}'
) STRICT;
-- A paired device's credentials (docs/04 §1): sha256 of its token, pairing and revocation times. Not in the log, so
-- a rebuild never loses them.
CREATE TABLE device_access (
  device_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, paired_at INTEGER NOT NULL, revoked_at INTEGER
) STRICT;

-- ── Personal data, outside the log (docs/03 §6, docs/08 §6): erasure deletes the row, the events stay valid ──────
-- Fields ending in _enc are AES-256-GCM with DATA_KEY; phone_hash is the keyed hash (LOOKUP_KEY) used for lookups.
CREATE TABLE customers_pii (
  customer_id TEXT PRIMARY KEY,
  name_enc TEXT,
  phone_enc TEXT,
  addresses_enc TEXT,
  phone_hash TEXT,
  consent_version TEXT,
  consent_at INTEGER,
  consent_staff TEXT,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX customers_pii_phone_hash ON customers_pii(phone_hash) WHERE phone_hash IS NOT NULL;
CREATE TABLE staff_pii (
  staff_id TEXT PRIMARY KEY, phone_enc TEXT, consent_version TEXT, consent_at INTEGER, updated_at INTEGER NOT NULL
) STRICT;
