// @ts-check
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Runtime tests of kit-worker (`test/**\/*.spec.js`) inside workerd, with a TenantStore subclass bound as STORE and
 * ENVIRONMENT "local", as under `wrangler dev`. The compatibility date is the products' (wrangler.jsonc).
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: fileURLToPath(new URL("./test/worker.js", import.meta.url)),
      miniflare: {
        compatibilityDate: "2026-10-06",
        durableObjects: { STORE: { className: "TestStore", useSQLite: true } },
        bindings: { ENVIRONMENT: "local", APP_ORIGIN: "http://localhost:8787" },
      },
    }),
  ],
  test: {
    name: "kit-worker",
    include: ["test/**/*.spec.js"],
  },
});
