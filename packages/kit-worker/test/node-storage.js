// @ts-check
/**
 * node:test helper: the surface of a Durable Object's storage that the store uses (`sql.exec(...).toArray()` and
 * `transactionSync`), served by `node:sqlite` (unflagged from Node 22.13, the floor of `engines`), so the store's own
 * code runs here. The store binds plain `?` placeholders only: node:sqlite before 22.20 does not bind numbered ones.
 *
 * - `exec` with no bindings and no result (DDL, several statements) goes to `db.exec`, like a Durable Object running a
 *   multi-statement query; anything else is one prepared statement.
 * - `transactionSync` is a SAVEPOINT: it nests, and a throw rolls back to it (what workerd does, checked in prompt 04).
 */
import { DatabaseSync } from "node:sqlite";

/**
 * @param {DatabaseSync} [db]
 */
export function nodeStorage(db = new DatabaseSync(":memory:")) {
  let depth = 0;
  return {
    db,
    sql: {
      /**
       * @param {string} query
       * @param {...any} bindings
       */
      exec(query, ...bindings) {
        if (bindings.length === 0 && !/^\s*(SELECT|WITH|PRAGMA)\b/i.test(query)) {
          db.exec(query);
          return { toArray: () => [] };
        }
        const rows = db
          .prepare(query)
          .all(...bindings)
          .map((r) => ({ ...r }));
        return { toArray: () => rows };
      },
    },
    /**
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    transactionSync(fn) {
      const name = `sp${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const out = fn();
        if (out && typeof (/** @type {any} */ (out).then) === "function")
          throw new TypeError("transactionSync callbacks are synchronous");
        db.exec(`RELEASE ${name}`);
        return out;
      } catch (e) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw e;
      } finally {
        depth--;
      }
    },
  };
}
