// @ts-check
/**
 * TenantStore: one client's Durable Object with SQLite storage, in the EU jurisdiction (D19, docs/02 §1), reached only
 * through `jurisdictionStore` (`./jurisdiction.js`). Each product subclasses it (CafeStore, RestoStore) and names its
 * product. The event log, its chain and the projections (docs/03 §6) come with the rest of prompt 04.
 */
import { DurableObject } from "cloudflare:workers";

/**
 * @template {import("./env.js").ProductEnv} [E=import("./env.js").ProductEnv]
 * @extends {DurableObject<E>}
 */
export class TenantStore extends DurableObject {
  /**
   * The product this store belongs to; each product's subclass returns its own.
   * @returns {import("./env.js").Product}
   */
  get product() {
    throw new TypeError("TenantStore is used through a product's subclass (CafeStore, RestoStore)");
  }
}
