-- Registry of one product (D19, docs/02 §1): a D1 database per product, created with `--jurisdiction eu`
-- (docs/12 §2). Routing, control-request ids, report schedules and message counts only: a client's own data stays in
-- its TenantStore (CLAUDE.md rule 7), and no row here holds personal data in clear (docs/08 §6, D42).
-- Both products apply these migrations (wrangler.jsonc `migrations_dir`). Never edit a migration once applied
-- (docs/12 §10): add the next numbered file.
-- Times are Unix milliseconds (UTC). Dates are YYYY-MM-DD on the tenant's calendar (D26).

-- One row per client.
CREATE TABLE tenants (
  id TEXT PRIMARY KEY CHECK (id GLOB 'tnt_?*'),
  -- the business name of the control API's create call (docs/09 §2)
  name TEXT NOT NULL CHECK (length(name) > 0),
  -- admin.brandhub.ma's client reference ("ADM-0001")
  admin_ref TEXT,
  -- mirror of the store's access status (licence.js STATUSES) as of the last control call
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'grace', 'readonly', 'suspended')),
  -- licence dates (docs/09 §4), so the status can be recomputed after a date passes; null until the first
  -- subscription call (a new tenant has no licence: it can set up, no shift opens)
  valid_until TEXT CHECK (valid_until GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  grace_until TEXT CHECK (grace_until GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  time_zone TEXT NOT NULL DEFAULT 'Africa/Casablanca' CHECK (length(time_zone) > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((valid_until IS NULL) = (grace_until IS NULL)),
  CHECK (grace_until IS NULL OR grace_until >= valid_until)
) STRICT;

-- Email → tenant for the login of owners, managers and accountants (docs/08 §1). The email is not stored here: only
-- a keyed hash of the trimmed, lower-cased address (HMAC-SHA-256 under a key held by the Worker, prompt 05). The
-- address itself stays in the tenant's store. One address may reach several tenants (an accountant, a second café).
CREATE TABLE owner_logins (
  email_hmac TEXT NOT NULL CHECK (length(email_hmac) > 0),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- the account in that tenant's store
  account_id TEXT NOT NULL CHECK (account_id GLOB 'own_?*'),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email_hmac, tenant_id),
  UNIQUE (tenant_id, account_id)
) STRICT;

-- Control API idempotency (docs/09 §3): a known request id returns the stored response and changes nothing. Kept
-- 24 h: the nightly cron deletes rows past expires_at.
CREATE TABLE control_requests (
  -- X-BH-Request-Id
  request_id TEXT PRIMARY KEY CHECK (length(request_id) > 0),
  -- X-BH-Key-Id of the command key that signed it
  key_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  -- the same id with another body is refused (409 conflict)
  body_sha256 TEXT NOT NULL,
  -- the tenant it acted on, if any (no foreign key: the row also records a refused call)
  tenant_id TEXT,
  status INTEGER NOT NULL,
  -- the stored response, AES-256-GCM encrypted with DATA_KEY: it can hold an activation link and code, which are
  -- never kept in clear (docs/08 §1)
  response_enc TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (expires_at > received_at)
) STRICT;
CREATE INDEX control_requests_expires ON control_requests(expires_at);

-- The evening report (docs/02 §3 F): the 15-minute cron takes the rows whose next_at has passed, and each store builds
-- and sends its report.
CREATE TABLE report_schedule (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  -- the setting reports.eveningTime (docs/03 §8), local time in tenants.time_zone
  evening_time TEXT NOT NULL DEFAULT '23:30' CHECK (evening_time GLOB '[0-2][0-9]:[0-5][0-9]' AND evening_time <= '23:59'),
  -- the next send, computed with timezone.js (D26, never a fixed offset); null when no report is due (no licence)
  next_at INTEGER,
  -- the business date of the last report sent, so a day is reported once
  last_business_date TEXT CHECK (last_business_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX report_schedule_next ON report_schedule(next_at) WHERE next_at IS NOT NULL;

-- Messages sent per tenant, day, channel and kind: counts only, no recipient (docs/09 §2 report usage.messages30d,
-- WhatsApp cost per message, docs/12 §7).
CREATE TABLE message_counts (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- the day the messages were sent, on the tenant's calendar
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  -- report, reminder, statement (D35)
  kind TEXT NOT NULL CHECK (length(kind) > 0),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (tenant_id, day, channel, kind)
) STRICT;
