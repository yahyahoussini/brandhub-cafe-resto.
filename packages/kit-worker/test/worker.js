// @ts-check
/**
 * The Worker the kit-worker specs run in (vitest.config.js `main`): a TenantStore subclass bound as STORE, like a
 * product's CafeStore or RestoStore.
 */
import { TenantStore } from "../src/tenant-store.js";

export class TestStore extends TenantStore {
  /** @returns {"cafe"} */
  get product() {
    return "cafe";
  }

  /** The product, over RPC (a getter is not callable through a stub). */
  whoAmI() {
    return { product: this.product, id: this.ctx.id.toString() };
  }
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};
