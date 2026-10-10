// @ts-check
/**
 * What a product Worker receives in `env` (docs/02 §4): the bindings and vars of
 * `apps/<product>/worker/wrangler.jsonc`, and the secrets set with `wrangler secret put` (docs/12 §2; locally in the
 * git-ignored `.dev.vars`). Vars are plain strings from the config file: code checks them before trusting them.
 */

/** The two products (D1). */
export const PRODUCTS = /** @type {const} */ (["cafe", "resto"]);

/** Where a Worker runs (docs/12 §4): `wrangler dev` and the tests, workers.dev, or the product host. */
export const ENVIRONMENTS = /** @type {const} */ (["local", "staging", "production"]);

/** @typedef {(typeof PRODUCTS)[number]} Product */
/** @typedef {(typeof ENVIRONMENTS)[number]} Environment */

/**
 * @typedef {object} ProductVars
 * @property {string} PRODUCT "cafe" or "resto"
 * @property {string} APP_ORIGIN the product's origin (`https://cafe.brandhub.ma`); empty while it is not known
 * @property {string} ENVIRONMENT "local", "staging" or "production"
 * @property {string} CONTROL_KEY_IDS key ids of the command key accepted by the control API (prompt 07)
 * @property {string} LICENCE_KEY_IDS key ids of the licence key accepted in licences (prompt 07)
 * @property {string} WHATSAPP_PHONE_ID WhatsApp Cloud API phone number id (prompt 18)
 * @property {string} REPORT_FROM_EMAIL sender address of the evening report by email (prompt 18)
 */

/**
 * Secrets (docs/02 §4). Absent until set; never logged or returned.
 * @typedef {object} ProductSecrets
 * @property {string} [CONTROL_PUBLIC_KEYS] JSON map kid → base64url Ed25519 public key (command key)
 * @property {string} [LICENCE_PUBLIC_KEYS] JSON map kid → base64url Ed25519 public key (licence key)
 * @property {string} [DATA_KEY] AES-256-GCM key for encrypted personal fields (docs/08 §6)
 * @property {string} [EXPORT_KEY] AES-256-GCM key of the nightly export (docs/12 §8)
 * @property {string} [WHATSAPP_TOKEN] WhatsApp Cloud API token
 * @property {string} [RESEND_API_KEY] Resend API key
 */

/**
 * Bindings (docs/02 §4).
 * @typedef {object} ProductBindings
 * @property {Fetcher} ASSETS the built PWA (static assets)
 * @property {DurableObjectNamespace<import("./tenant-store.js").TenantStore>} STORE one TenantStore per client, reached only
 *   through `jurisdictionStore` (EU jurisdiction)
 * @property {D1Database} REGISTRY the product's registry (EU jurisdiction)
 * @property {R2Bucket} FILES photos and exports (EU jurisdiction)
 * @property {WorkerVersionMetadata} VERSION the deployed Worker version
 */

/** @typedef {ProductVars & ProductSecrets & ProductBindings} ProductEnv */
