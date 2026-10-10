// @ts-check
/**
 * The TenantStore's migration runner (docs/12 §10: forward only). The TenantStore's constructor calls `migrate` with
 * `ctx.storage`, synchronously, so no request ever sees a database behind its code.
 *
 * - The version lives in a one-row table, `_schema`: a Durable Object refuses `PRAGMA user_version` (SQLITE_AUTH).
 * - Every pending migration runs in one `transactionSync`: a failure rolls all of them back and the store does not
 *   start, rather than run on half a schema.
 * - A database at a version this code does not know (written by a newer deploy, then rolled back) is refused with
 *   E_SCHEMA_NEWER: old code never writes into a newer schema. Roll forward instead (docs/12 §10).
 *
 * It needs only `sql.exec` and `transactionSync`, so the node:test suite runs it on `node:sqlite` too.
 */
import { MIGRATIONS } from "./migrations.js";

/** @typedef {import("./migrations.js").Migration} Migration */

/**
 * The part of `DurableObjectStorage` the runner uses.
 * @typedef {object} MigrationStorage
 * @property {{ exec(query: string, ...bindings: any[]): { toArray(): Record<string, unknown>[] } }} sql
 * @property {<T>(closure: () => T) => T} transactionSync
 */

export class MigrationError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
  }
}

/** The runner's own table: one row, the version the database is at. */
export const SCHEMA_TABLE = "_schema";

/**
 * Checks the list itself: versions 1, 2, 3 … in order, each with SQL. A malformed list is a programming error.
 * @param {readonly Migration[]} migrations
 */
export function checkMigrations(migrations) {
  if (!Array.isArray(migrations) || migrations.length === 0) throw new TypeError("migrations: at least version 1");
  migrations.forEach((m, i) => {
    if (m.version !== i + 1)
      throw new TypeError(`migrations: expected version ${i + 1} at position ${i}, got ${m.version}`);
    if (typeof m.sql !== "string" || !m.sql.trim()) throw new TypeError(`migration ${m.version} has no SQL`);
    if (typeof m.name !== "string" || !m.name) throw new TypeError(`migration ${m.version} has no name`);
  });
}

/**
 * Brings the database to the newest version.
 * @param {MigrationStorage} storage `ctx.storage` of the Durable Object
 * @param {readonly Migration[]} [migrations]
 * @returns {{ from: number, to: number, applied: number[] }}
 */
export function migrate(storage, migrations = MIGRATIONS) {
  checkMigrations(migrations);
  const latest = migrations[migrations.length - 1].version;
  return storage.transactionSync(() => {
    storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${SCHEMA_TABLE} (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL) STRICT`,
    );
    const row = storage.sql.exec(`SELECT version FROM ${SCHEMA_TABLE} WHERE id = 1`).toArray()[0];
    const from = row ? Number(row.version) : 0;
    if (from > latest) {
      throw new MigrationError(
        "E_SCHEMA_NEWER",
        `the database is at version ${from}; this code knows versions up to ${latest}`,
      );
    }
    const pending = migrations.filter((m) => m.version > from);
    for (const m of pending) storage.sql.exec(m.sql);
    if (pending.length) {
      storage.sql.exec(
        `INSERT INTO ${SCHEMA_TABLE} (id, version) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET version = excluded.version`,
        latest,
      );
    }
    return { from, to: latest, applied: pending.map((m) => m.version) };
  });
}

/**
 * The version a database is at (0 before the first migration).
 * @param {MigrationStorage} storage
 */
export function schemaVersion(storage) {
  const exists = storage.sql
    .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", SCHEMA_TABLE)
    .toArray();
  if (!exists.length) return 0;
  const row = storage.sql.exec(`SELECT version FROM ${SCHEMA_TABLE} WHERE id = 1`).toArray()[0];
  return row ? Number(row.version) : 0;
}
