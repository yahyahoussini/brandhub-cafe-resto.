// @ts-check
/**
 * The TenantStore's schema and migrations (prompt 04): migrations.js applied to an empty database gives exactly
 * schema.sql, an applied migration never changes (its SHA-256 is pinned here), and the runner keeps its version in
 * `_schema`, applies every pending migration in one transaction and refuses a database newer than the code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { LATEST_VERSION, MIGRATIONS } from "../src/migrations.js";
import { MigrationError, SCHEMA_TABLE, checkMigrations, migrate, schemaVersion } from "../src/migrate.js";
import { LOG_TABLES, OUTSIDE_TABLES, PROJECTION_TABLES } from "../src/projections.js";
import { nodeStorage } from "./node-storage.js";

/**
 * SHA-256 of each migration's SQL. A migration that has run anywhere is never edited (docs/12 §10): a change here means
 * a new migration, never a new hash for an old one.
 */
const FROZEN = {
  1: "edc9cadf0109e513e2ebabf0b0ea76d02aa6aa15957fa3c5b62555e0a96f24f9",
};

const SCHEMA_SQL = readFileSync(new URL("../src/schema.sql", import.meta.url), "utf8");

/** Statement text as SQLite keeps it, with the layout made irrelevant. @param {string | null} sql */
const normalize = (sql) =>
  (sql ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .trim();

/**
 * Everything SQLite knows about a schema: sqlite_master and, per table, its columns and indexes.
 * @param {DatabaseSync} db
 */
function describe(db) {
  const master = db
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> '${SCHEMA_TABLE}' ORDER BY type, name`,
    )
    .all()
    .map((r) => ({
      type: String(r.type),
      name: String(r.name),
      tbl_name: String(r.tbl_name),
      sql: normalize(/** @type {string | null} */ (r.sql)),
    }));
  const tables = master.filter((r) => r.type === "table").map((r) => r.name);
  /** @type {Record<string, unknown>} */
  const detail = {};
  for (const t of tables) {
    detail[t] = {
      columns: db
        .prepare(`PRAGMA table_xinfo(${t})`)
        .all()
        .map((r) => ({ ...r })),
      indexes: db
        .prepare(`PRAGMA index_list(${t})`)
        .all()
        .map((r) => ({
          ...r,
          columns: db
            .prepare(`PRAGMA index_xinfo(${/** @type {string} */ (r.name)})`)
            .all()
            .map((c) => ({ ...c })),
        })),
      foreignKeys: db
        .prepare(`PRAGMA foreign_key_list(${t})`)
        .all()
        .map((r) => ({ ...r })),
    };
  }
  return { master, detail };
}

test("applying the migrations to an empty database gives exactly schema.sql", () => {
  const fromMigrations = nodeStorage();
  const result = migrate(fromMigrations);
  assert.deepEqual(result, { from: 0, to: LATEST_VERSION, applied: MIGRATIONS.map((m) => m.version) });
  const fromSchema = new DatabaseSync(":memory:");
  fromSchema.exec(SCHEMA_SQL);
  const a = describe(fromMigrations.db);
  const b = describe(fromSchema);
  assert.ok(a.master.length > 40, "the schema has its tables, indexes and triggers");
  assert.deepEqual(a.master, b.master);
  assert.deepEqual(a.detail, b.detail);
});

test("an applied migration never changes: each one's SHA-256 is pinned", () => {
  assert.deepEqual(
    MIGRATIONS.map((m) => m.version),
    Object.keys(FROZEN).map(Number),
    "every migration is pinned here (add the new one's hash when you add it)",
  );
  for (const m of MIGRATIONS) {
    const hash = createHash("sha256").update(m.sql).digest("hex");
    assert.equal(
      hash,
      FROZEN[/** @type {1} */ (m.version)],
      `migration ${m.version} was edited: add a new migration instead`,
    );
  }
});

test("the runner keeps its version in _schema and runs nothing twice", () => {
  const s = nodeStorage();
  assert.equal(schemaVersion(s), 0);
  migrate(s);
  assert.equal(schemaVersion(s), LATEST_VERSION);
  assert.deepEqual(
    s.db
      .prepare(`SELECT id, version FROM ${SCHEMA_TABLE}`)
      .all()
      .map((r) => ({ ...r })),
    [{ id: 1, version: LATEST_VERSION }],
  );
  assert.deepEqual(migrate(s), { from: LATEST_VERSION, to: LATEST_VERSION, applied: [] });
  // a second version is applied on top of the first, alone
  const next = [
    ...MIGRATIONS,
    { version: LATEST_VERSION + 1, name: "test", sql: "CREATE TABLE later (id TEXT PRIMARY KEY) STRICT;" },
  ];
  assert.deepEqual(migrate(s, next), { from: LATEST_VERSION, to: LATEST_VERSION + 1, applied: [LATEST_VERSION + 1] });
  assert.equal(schemaVersion(s), LATEST_VERSION + 1);
});

test("a database newer than the code is refused and left as it is", () => {
  const s = nodeStorage();
  migrate(s);
  s.db.exec(`UPDATE ${SCHEMA_TABLE} SET version = ${LATEST_VERSION + 1}`);
  assert.throws(
    () => migrate(s),
    (e) => e instanceof MigrationError && e.code === "E_SCHEMA_NEWER",
  );
  assert.equal(schemaVersion(s), LATEST_VERSION + 1);
});

test("pending migrations run in one transaction: a failure rolls all of them back", () => {
  const s = nodeStorage();
  const broken = [
    ...MIGRATIONS,
    { version: LATEST_VERSION + 1, name: "fine", sql: "CREATE TABLE fine (id TEXT PRIMARY KEY) STRICT;" },
    {
      version: LATEST_VERSION + 2,
      name: "broken",
      sql: "CREATE TABLE broken (id TEXT PRIMARY KEY) STRICT; INSERT INTO nowhere VALUES (1);",
    },
  ];
  assert.throws(() => migrate(s, broken), /nowhere/);
  assert.equal(schemaVersion(s), 0);
  assert.deepEqual(
    s.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(),
    [],
    "not even version 1 stays",
  );
});

test("the migration list itself is checked: versions 1, 2, 3 … with SQL", () => {
  assert.doesNotThrow(() => checkMigrations(MIGRATIONS));
  assert.throws(() => checkMigrations([]), TypeError);
  assert.throws(() => checkMigrations([{ version: 2, name: "x", sql: "SELECT 1" }]), TypeError);
  assert.throws(() => checkMigrations([MIGRATIONS[0], MIGRATIONS[0]]), TypeError);
  assert.throws(() => checkMigrations([{ version: 1, name: "x", sql: "  " }]), TypeError);
});

test("every table is the log, a projection or outside the log, exactly once", () => {
  const s = nodeStorage();
  migrate(s);
  const tables = s.db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '${SCHEMA_TABLE}' ORDER BY name`,
    )
    .all()
    .map((r) => r.name);
  const listed = [...LOG_TABLES, ...PROJECTION_TABLES, ...OUTSIDE_TABLES];
  assert.equal(new Set(listed).size, listed.length, "no table is listed twice");
  assert.deepEqual([...listed].sort(), tables);
});

test("the log refuses updates and deletes, and STRICT columns refuse a float amount", () => {
  const s = nodeStorage();
  migrate(s);
  s.db.exec(
    "INSERT INTO events (pos, id, type, entity, seq, device, staff, at, recv_at, data, prev_hash, hash) VALUES (1, 'e1', 'stock.received', 'itm_1', NULL, 'dev_1', NULL, 1, 1, '{}', 'p', 'h')",
  );
  assert.throws(() => s.db.exec("UPDATE events SET data = '{\"x\":1}' WHERE pos = 1"), /never updated/);
  assert.throws(() => s.db.exec("DELETE FROM events WHERE pos = 1"), /never deleted/);
  assert.throws(
    () =>
      s.db
        .prepare(
          "INSERT INTO payments (payment_id, order_id, bank_id, tender, amount, voided, training, at) VALUES ('p', 'o', 'b', 'cash', ?, 0, 0, 1)",
        )
        .run(12.5),
    /REAL|datatype|cannot store/i,
  );
});
