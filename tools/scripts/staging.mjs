// @ts-check
/**
 * `node tools/scripts/staging.mjs [cafe|resto]`: PRINTS, and runs nothing, the commands of docs/12 §2 that Yahya runs
 * on their computer to create a product's staging resources in the EU jurisdiction and deploy its Worker to staging,
 * then the checks of prompt 04 (acceptance checks 2 and 3). Both products by default, Café first.
 *
 * Names come from apps/<product>/worker/wrangler.jsonc (env.staging), read by Wrangler itself, so the commands match
 * the config. Secrets are named only: `wrangler secret put` asks for each value, which is never printed or asked for
 * here.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";
import { ROOT } from "./workspaces.mjs";

/** @typedef {"cafe" | "resto"} Product */

/** Café first, then Resto (docs/12 §2). @type {readonly Product[]} */
export const PRODUCTS = Object.freeze(["cafe", "resto"]);

const LABELS = { cafe: "BrandHub Café", resto: "BrandHub Resto" };

/** docs/02 §4: secrets, set with `wrangler secret put`, never in a file. */
export const SECRETS = Object.freeze([
  "CONTROL_PUBLIC_KEYS",
  "LICENCE_PUBLIC_KEYS",
  "DATA_KEY",
  "EXPORT_KEY",
  "WHATSAPP_TOKEN",
  "RESEND_API_KEY",
]);

/**
 * What the staging commands need from a product's wrangler.jsonc (env.staging).
 * @typedef {object} StagingConfig
 * @property {string} worker the staging Worker's name
 * @property {string} database the REGISTRY D1 database's name
 * @property {boolean} databaseId whether env.staging already holds the database's id
 * @property {string} bucket the FILES R2 bucket's name
 * @property {string} bucketJurisdiction the FILES binding's jurisdiction
 * @property {string} appOrigin env.staging's APP_ORIGIN ("" until the first deploy prints it)
 * @property {string} storeClass the STORE Durable Object class
 */

/**
 * @param {Product} product
 * @returns {StagingConfig}
 */
export function readStagingConfig(product) {
  /**
   * The parts of Wrangler's resolved config read here.
   * @type {{ name?: string, vars: Record<string, unknown>,
   *   d1_databases: { binding: string, database_name?: string, database_id?: string }[],
   *   r2_buckets: { binding: string, bucket_name?: string, jurisdiction?: string }[],
   *   durable_objects: { bindings: { name: string, class_name: string }[] } }}
   */
  const c = unstable_readConfig({ config: configPath(product), env: "staging" });
  const d1 = c.d1_databases.find((d) => d.binding === "REGISTRY");
  const r2 = c.r2_buckets.find((b) => b.binding === "FILES");
  const store = c.durable_objects.bindings.find((b) => b.name === "STORE");
  if (!c.name || !d1?.database_name || !r2?.bucket_name || !store)
    throw new Error(`${configPath(product, true)}: env.staging needs a name, REGISTRY, FILES and STORE`);
  return {
    worker: c.name,
    database: d1.database_name,
    databaseId: Boolean(d1.database_id),
    bucket: r2.bucket_name,
    bucketJurisdiction: r2.jurisdiction ?? "",
    appOrigin: typeof c.vars.APP_ORIGIN === "string" ? c.vars.APP_ORIGIN : "",
    storeClass: store.class_name,
  };
}

/**
 * @param {Product} product
 * @param {boolean} [relativeToRoot]
 */
function configPath(product, relativeToRoot = false) {
  const rel = `apps/${product}/worker/wrangler.jsonc`;
  return relativeToRoot ? rel : join(ROOT, rel);
}

/**
 * The commands, as text. Refuses a config whose bucket is not bound in the EU jurisdiction (D19).
 * @param {{ product: Product, config: StagingConfig }[]} products
 * @returns {string}
 */
export function stagingPlan(products) {
  const out = [
    "Staging (docs/12 §2): the commands to run on Yahya's computer, from the repository root.",
    "Nothing has been run. Needs: the brandhub.ma Cloudflare account on Workers Paid (docs/12 §1), `npx wrangler login`,",
    "and `npx wrangler whoami` showing that account.",
  ];
  for (const { product, config: c } of products) {
    if (c.bucketJurisdiction !== "eu")
      throw new Error(`${configPath(product, true)}: env.staging FILES must declare "jurisdiction": "eu" (D19)`);
    const cfg = `-c ${configPath(product, true)} --env staging`;
    const origin = c.appOrigin || `https://${c.worker}.<account>.workers.dev`;
    out.push(
      "",
      `## ${LABELS[product]}: Worker ${c.worker} (${configPath(product, true)}, env.staging)`,
      "",
      "# 1. The registry: a D1 database in the EU jurisdiction (fixed at creation)",
      `npx wrangler d1 create ${c.database} --jurisdiction eu`,
      c.databaseId
        ? "#    env.staging already holds its database_id: this step is done."
        : `#    Paste the database_id it prints into env.staging → d1_databases (binding REGISTRY) of ${configPath(product, true)}.\n` +
            "#    Deploy only after that: without the id, Wrangler would create the database itself, outside the EU.",
      "",
      `# 2. Files: an R2 bucket in the EU jurisdiction (the FILES binding declares "jurisdiction": "eu")`,
      `npx wrangler r2 bucket create ${c.bucket} --jurisdiction eu`,
      "",
      "# 3. The registry's tables (packages/kit-worker/migrations/registry)",
      `npx wrangler d1 migrations apply ${c.database} --remote ${cfg}`,
      "",
      `# 4. The PWA's files, then the Worker and its ${c.storeClass} class (Durable Object migration v1, SQLite storage)`,
      `node tools/scripts/build-web.mjs ${product} staging`,
      `npx wrangler deploy ${cfg} --no-x-provision`,
      "#    --no-x-provision: Wrangler stops instead of creating a missing database or bucket by itself (outside the EU).",
      "#    The build writes the pages' Content-Security-Policy (dist/_headers) with env.staging's APP_ORIGIN as the",
      "#    socket host, never production's; the Worker writes the same for /api/* and /r/*.",
      ...(c.appOrigin
        ? []
        : [
            `#    It prints the Worker's address, https://${c.worker}.<account>.workers.dev: write it into env.staging → vars →`,
            "#    APP_ORIGIN, then run the build and the deploy commands once more so both Content-Security-Policies name",
            "#    it (until then they allow the page's own host only, 'self').",
          ]),
      "",
      "# 5. Checks (prompt 04, acceptance checks 2 and 3): version, build and time; the resources and their jurisdiction",
      `curl -s ${origin}/api/health`,
      `curl -sI ${origin}/api/health`,
      `npx wrangler d1 info ${c.database} --json`,
      `npx wrangler r2 bucket info ${c.bucket} --jurisdiction eu`,
    );
  }
  out.push(
    "",
    "## Secrets (docs/12 §2)",
    "The Worker reads none of them yet: /api/health answers without them. When a prompt asks for them (prompt 07 makes",
    "the keys, docs/12 §3), set each one per product. Wrangler asks for the value: paste it there, never on the command line.",
  );
  for (const { product } of products)
    for (const name of SECRETS)
      out.push(`npx wrangler secret put ${name} -c ${configPath(product, true)} --env staging`);
  out.push(
    "",
    "Then record in docs/STATUS.md where each resource lives (docs/12 §2): the staging URLs, the D1 database names and ids,",
    "the bucket names, and the jurisdiction (EU) of each.",
  );
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const asked = process.argv[2];
  if (asked !== undefined && asked !== "cafe" && asked !== "resto") {
    console.error("usage: node tools/scripts/staging.mjs [cafe|resto]");
    process.exit(2);
  }
  /** @type {readonly Product[]} */
  const products = asked ? [asked] : PRODUCTS;
  console.log(stagingPlan(products.map((product) => ({ product, config: readStagingConfig(product) }))));
}
