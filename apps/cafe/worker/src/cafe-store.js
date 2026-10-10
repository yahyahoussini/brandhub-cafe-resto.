// @ts-check
/**
 * CafeStore: the TenantStore of BrandHub Café, one per client, in the EU jurisdiction (D19). Bound as STORE in
 * wrangler.jsonc; reached only through `jurisdictionStore(env, tenantId)`.
 */
import { TenantStore } from "@brandhub/kit-worker/tenant-store";

export class CafeStore extends TenantStore {
  /** @returns {"cafe"} */
  get product() {
    return "cafe";
  }
}
