// @ts-check
/**
 * RestoStore: the TenantStore of BrandHub Resto, one per client, in the EU jurisdiction (D19). Bound as STORE in
 * wrangler.jsonc; reached only through `jurisdictionStore(env, tenantId)`.
 */
import { TenantStore } from "@brandhub/kit-worker/tenant-store";

export class RestoStore extends TenantStore {
  /** @returns {"resto"} */
  get product() {
    return "resto";
  }
}
