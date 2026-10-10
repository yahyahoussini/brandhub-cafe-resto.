// @ts-check
/**
 * The only way to reach a client's TenantStore (D19, docs/02 §4): `env.STORE.jurisdiction("eu").idFromName(tenantId)`,
 * so every client's Durable Object is created and kept in the EU jurisdiction.
 *
 * Local workerd (`wrangler dev`, the Vitest pool) does not implement jurisdictions and throws
 * {@link LOCAL_JURISDICTION_ERROR}. Only that exact error, and only with ENVIRONMENT "local", falls back to
 * `env.STORE.idFromName(tenantId)`. On Cloudflare the jurisdiction call succeeds, so the fallback never runs there;
 * if it ever threw in staging or production, the error propagates and nothing is created outside the EU.
 */
import { isEntityId } from "@brandhub/kit/ids";

/** The jurisdiction of every client's store (D19). */
export const JURISDICTION = "eu";

/** What workerd 1.20261006 throws locally for `namespace.jurisdiction(…)`. */
export const LOCAL_JURISDICTION_ERROR = "Jurisdiction restrictions are not implemented in workerd.";

/**
 * @param {unknown} err
 * @param {string | undefined} environment
 */
const isLocalGap = (err, environment) =>
  environment === "local" && err instanceof Error && err.message === LOCAL_JURISDICTION_ERROR;

/**
 * The stub of a client's TenantStore, in the EU jurisdiction.
 * @template {Rpc.DurableObjectBranded | undefined} T
 * @param {{ STORE: DurableObjectNamespace<T>, ENVIRONMENT?: string }} env
 * @param {string} tenantId `tnt_<uuidv7>`
 * @returns {DurableObjectStub<T>}
 */
export function jurisdictionStore(env, tenantId) {
  if (!isEntityId(tenantId, "tnt")) throw new TypeError("jurisdictionStore: tenantId must be a tnt_ id");
  /** @type {DurableObjectNamespace<T>} */
  let namespace;
  /** @type {DurableObjectId} */
  let id;
  try {
    namespace = env.STORE.jurisdiction(JURISDICTION);
    id = namespace.idFromName(tenantId);
  } catch (err) {
    if (!isLocalGap(err, env.ENVIRONMENT)) throw err;
    namespace = env.STORE;
    id = namespace.idFromName(tenantId);
  }
  return namespace.get(id);
}
