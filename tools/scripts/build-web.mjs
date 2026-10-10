// @ts-check
/**
 * `node tools/scripts/build-web.mjs cafe|resto`: builds the product's PWA into apps/<product>/web/dist, the folder
 * wrangler.jsonc serves as static assets (`wrangler dev` and `wrangler deploy` both need it). Used by dev-worker.mjs and
 * named in the staging commands (staging.mjs).
 *
 * Until prompt 11 gives the PWA its index.html there is nothing for Vite to build: dist/ then holds web/public only
 * (the `_headers` file), `/api/*` answers and page routes are 404.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./workspaces.mjs";

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
 * Builds apps/<product>/web into its dist/ folder. Exits the process if the build fails.
 * @param {"cafe" | "resto"} product
 */
export function buildWeb(product) {
  const web = join(ROOT, "apps", product, "web");
  const dist = join(web, "dist");
  if (existsSync(join(web, "index.html"))) {
    const result = spawnSync(process.execPath, [binOf(web, "vite", "vite"), "build"], { cwd: web, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
    return;
  }
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  if (existsSync(join(web, "public"))) cpSync(join(web, "public"), dist, { recursive: true });
  console.log(
    `build-web ${product}: apps/${product}/web has no index.html yet (prompt 11); dist/ holds web/public only.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const product = process.argv[2];
  if (product !== "cafe" && product !== "resto") {
    console.error("usage: node tools/scripts/build-web.mjs cafe|resto");
    process.exit(2);
  }
  buildWeb(product);
}
