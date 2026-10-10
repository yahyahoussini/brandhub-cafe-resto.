// @ts-check
/**
 * `node tools/scripts/build-web.mjs cafe|resto [staging|production]`: builds the product's PWA into
 * apps/<product>/web/dist, the folder wrangler.jsonc serves as static assets (`wrangler dev` and `wrangler deploy` both
 * need it). Used by dev-worker.mjs and named in the staging commands (staging.mjs).
 *
 * With an environment, dist/_headers gets that environment's socket host: web/public/_headers is production's, and its
 * Content-Security-Policy (the CSP of every page, docs/08 §7 `wss://<product host>`) would otherwise let a staging page
 * open production's socket. The host is the environment's APP_ORIGIN in wrangler.jsonc; while it is empty (before the
 * first staging deploy prints the address) the `wss://` source is left out, the page's own host being 'self'.
 *
 * Until prompt 11 gives the PWA its index.html there is nothing for Vite to build: dist/ then holds web/public only
 * (the `_headers` file), `/api/*` answers and page routes are 404.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";
import { ROOT } from "./workspaces.mjs";

/** The deploy environments of wrangler.jsonc (docs/02 §4). */
export const ENVIRONMENTS = Object.freeze(["staging", "production"]);

/**
 * The bin script of a package, resolved from a folder.
 * @param {string} from folder whose node_modules are searched
 * @param {string} name package name
 * @param {string} bin bin name
 */
export function binOf(from, name, bin) {
  const require = createRequire(join(from, "package.json"));
  const pkgPath = require.resolve(`${name}/package.json`);
  /** @type {{ bin: Record<string, string> }} */
  const pkg = require(pkgPath);
  return join(dirname(pkgPath), pkg.bin[bin]);
}

/**
 * A `_headers` file with the socket host of an environment: every `wss://` source of the file becomes `wss://<host of
 * appOrigin>`, or is removed when appOrigin is not an https origin.
 * @param {string} headers the text of web/public/_headers
 * @param {string} appOrigin the environment's APP_ORIGIN
 */
export function headersFor(headers, appOrigin) {
  let host = "";
  try {
    const url = new URL(appOrigin);
    if (url.protocol === "https:") host = url.host;
  } catch {
    host = "";
  }
  return headers.replace(/ wss:\/\/[^\s;]+/g, host ? ` wss://${host}` : "");
}

/**
 * An environment's APP_ORIGIN, as Wrangler reads apps/<product>/worker/wrangler.jsonc ("" when it is not set).
 * @param {"cafe" | "resto"} product
 * @param {string} env
 */
export function appOriginOf(product, env) {
  /** @type {{ vars: Record<string, unknown> }} */
  const config = unstable_readConfig({ config: join(ROOT, "apps", product, "worker", "wrangler.jsonc"), env });
  return typeof config.vars.APP_ORIGIN === "string" ? config.vars.APP_ORIGIN : "";
}

/**
 * Builds apps/<product>/web into its dist/ folder. Exits the process if the build fails.
 * @param {"cafe" | "resto"} product
 * @param {string | null} [env] a deploy environment: dist/_headers then names its socket host
 */
export function buildWeb(product, env = null) {
  const web = join(ROOT, "apps", product, "web");
  const dist = join(web, "dist");
  if (existsSync(join(web, "index.html"))) {
    const result = spawnSync(process.execPath, [binOf(web, "vite", "vite"), "build"], { cwd: web, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  } else {
    rmSync(dist, { recursive: true, force: true });
    mkdirSync(dist, { recursive: true });
    if (existsSync(join(web, "public"))) cpSync(join(web, "public"), dist, { recursive: true });
    console.log(
      `build-web ${product}: apps/${product}/web has no index.html yet (prompt 11); dist/ holds web/public only.`,
    );
  }
  const file = join(dist, "_headers");
  if (env === null || !existsSync(file)) return;
  const origin = appOriginOf(product, env);
  writeFileSync(file, headersFor(readFileSync(file, "utf8"), origin));
  console.log(`build-web ${product}: dist/_headers names the socket of ${env} (${origin || "its own host only"}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [product, env = null] = process.argv.slice(2);
  if ((product !== "cafe" && product !== "resto") || (env !== null && !ENVIRONMENTS.includes(env))) {
    console.error("usage: node tools/scripts/build-web.mjs cafe|resto [staging|production]");
    process.exit(2);
  }
  buildWeb(product, env);
}
