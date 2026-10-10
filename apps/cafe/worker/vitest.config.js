// @ts-check
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { unstable_readConfig } from "wrangler";
import { defineConfig } from "vitest/config";

/** @param {string} path relative to this folder */
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const configPath = here("./wrangler.jsonc");

/**
 * The registry migrations, from the folder wrangler.jsonc names (so a wrong `migrations_dir` fails the tests).
 * @type {{ binding: string, migrations_dir?: string }[]}
 */
const d1 = unstable_readConfig({ config: configPath }).d1_databases;
const registry = d1.find((d) => d.binding === "REGISTRY");
if (!registry?.migrations_dir) throw new Error("wrangler.jsonc: REGISTRY has no migrations_dir");
const migrationsDir = resolve(dirname(configPath), registry.migrations_dir);

/**
 * The static assets of the tests: the real `web/public/_headers` next to a one-line index.html, in the git-ignored
 * `.wrangler/`, so the specs see what the asset server sends for static routes without a build of the PWA.
 */
const assetsDir = here("./.wrangler/test-assets");
mkdirSync(assetsDir, { recursive: true });
writeFileSync(join(assetsDir, "index.html"), '<!doctype html>\n<meta charset="utf-8">\n');
copyFileSync(here("../web/public/_headers"), join(assetsDir, "_headers"));

/**
 * Runtime tests of the Café Worker (`test/**\/*.spec.js`) inside workerd, with the bindings, vars and compatibility
 * date of wrangler.jsonc's local environment; only the assets folder is replaced by the one above.
 */
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath },
      miniflare: {
        assets: { directory: assetsDir },
        bindings: { TEST_MIGRATIONS: await readD1Migrations(migrationsDir) },
      },
    })),
  ],
  test: {
    name: "cafe-worker",
    include: ["test/**/*.spec.js"],
  },
});
