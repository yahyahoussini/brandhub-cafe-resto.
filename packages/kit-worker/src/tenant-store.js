// @ts-check
/**
 * TenantStore: one client's Durable Object with SQLite storage, in the EU jurisdiction (D19, docs/02 §1), reached only
 * through `jurisdictionStore` (`./jurisdiction.js`). Each product subclasses it (CafeStore, RestoStore) and names its
 * product.
 *
 * It holds the client's chained event log (D20, docs/03 §6), the projections rebuilt from it and the tables outside
 * the log. The logic is `Store` (`./store.js`), which runs on `ctx.storage`; this class gives it the Durable Object's
 * storage and exposes its methods over RPC:
 * `append(events, caller)` (docs/04 §2), `pull(after, kind, limit)` (docs/04 §3), `verify(from, to)`, `rebuild()`,
 * `dailyReport(businessDate)` and `refresh()`.
 *
 * The constructor brings the database to the newest schema synchronously (`./migrate.js`), so no request ever runs on
 * an older one.
 */
import { DurableObject } from "cloudflare:workers";
import { Store } from "./store.js";

/** @typedef {import("./sync-rules.js").Caller} Caller */
/** @typedef {import("@brandhub/kit/events").DeviceKind} DeviceKind */

/**
 * @template {import("./env.js").ProductEnv} [E=import("./env.js").ProductEnv]
 * @extends {DurableObject<E>}
 */
export class TenantStore extends DurableObject {
  /** @type {Store} */
  #store;

  /**
   * @param {DurableObjectState} ctx
   * @param {E} env
   */
  constructor(ctx, env) {
    super(ctx, env);
    // The name the store was reached by (`idFromName(tenantId)`) is the client's id; an event naming another tnt_ is
    // refused.
    const tenantId = () => {
      const name = ctx.id.name;
      return typeof name === "string" && name.startsWith("tnt_") ? name : null;
    };
    this.#store = new Store(ctx.storage, this.product, { tenantId });
  }

  /**
   * The product this store belongs to; each product's subclass returns its own.
   * @returns {import("./env.js").Product}
   */
  get product() {
    throw new TypeError("TenantStore is used through a product's subclass (CafeStore, RestoStore)");
  }

  /**
   * docs/04 §2: stores a pushed batch. Throws a BatchError E_TOO_LARGE (nothing stored) when the batch is over 200
   * events or 512 KB.
   * @param {unknown[]} events
   * @param {Caller} caller the device as the Worker authenticated it
   */
  append(events, caller) {
    return this.#store.append(events, caller);
  }

  /**
   * docs/04 §3: the events after a position that a device kind receives.
   * @param {number} [after]
   * @param {DeviceKind} [kind]
   * @param {number} [limit]
   */
  pull(after, kind, limit) {
    return this.#store.pull(after, kind, limit);
  }

  /**
   * Recomputes the chain between two positions.
   * @param {number} [from]
   * @param {number} [to]
   */
  verify(from, to) {
    return this.#store.verify(from, to);
  }

  /** Empties the projections and replays the log. */
  rebuild() {
    return this.#store.rebuild();
  }

  /**
   * The day's numbers (docs/10 §1).
   * @param {string} businessDate
   */
  dailyReport(businessDate) {
    return this.#store.dailyReport(businessDate);
  }

  /** Recomputes the summaries that events made dirty. */
  refresh() {
    return this.#store.refresh();
  }
}
