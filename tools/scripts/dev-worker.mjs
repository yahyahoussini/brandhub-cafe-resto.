// @ts-check
/**
 * `npm run dev:cafe` / `npm run dev:resto`: builds the product's PWA into apps/<product>/web/dist, applies the registry
 * migrations to the local D1, then runs `wrangler dev` with apps/<product>/worker/wrangler.jsonc in its local
 * environment (Café on http://localhost:8787, Resto on 8788; storage in apps/<product>/worker/.wrangler/). Arguments
 * after the product go to `wrangler dev` (`npm run dev:cafe -- --port 9000`).
 *
 * Until prompt 11 gives the PWA its index.html there is nothing for Vite to build: dist/ then holds web/public only
 * (the `_headers` file), `/api/*` answers and page routes are 404.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ROOT } from "./workspaces.mjs";

const product = process.argv[2];
if (product !== "cafe" && product !== "resto") {
  console.error("usage: node tools/scripts/dev-worker.mjs cafe|resto [wrangler dev options]");
  process.exit(2);
}

const web = join(ROOT, "apps", product, "web");
const dist = join(web, "dist");
const config = join(ROOT, "apps", product, "worker", "wrangler.jsonc");

/**
 * The bin script of a package, resolved from a folder.
 * @param {string} from folder whose node_modules are searched
 * @param {string} name package name
 * @param {string} bin bin name
 */
function binOf(from, name, bin) {
  const require = createRequire(join(from, "package.json"));
  const pkgPath = require.resolve(`${name}/package.json`);
  /** @type {{ bin: Record<string, string> }} */
  const pkg = require(pkgPath);
  return join(dirname(pkgPath), pkg.bin[bin]);
}

/**
 * Runs a Node script and stops here if it fails.
 * @param {string} script
 * @param {string[]} args
 * @param {string} cwd
 */
function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const wrangler = binOf(ROOT, "wrangler", "wrangler");

// 1. The PWA.
if (existsSync(join(web, "index.html"))) {
  run(binOf(web, "vite", "vite"), ["build"], web);
} else {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  if (existsSync(join(web, "public"))) cpSync(join(web, "public"), dist, { recursive: true });
  console.log(`dev:${product}: apps/${product}/web has no index.html yet (prompt 11); dist/ holds web/public only.`);
}

// 2. The local registry (D1 in .wrangler/), at the latest migration.
run(wrangler, ["d1", "migrations", "apply", "REGISTRY", "--local", "-c", config], ROOT);

// 3. wrangler dev, until it stops.
const dev = spawn(process.execPath, [wrangler, "dev", "-c", config, ...process.argv.slice(3)], {
  cwd: ROOT,
  stdio: "inherit",
});
for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) process.on(signal, () => dev.kill(signal));
dev.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
