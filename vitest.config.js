// @ts-check
import { defineConfig } from "vitest/config";

/**
 * `npm test`, second half: the runtime tests (`*.spec.js`) of the Worker workspaces, inside workerd through
 * Cloudflare's Vitest integration (D44). Each project has its own vitest.config.js. Unit tests (`*.test.js`) run
 * with `node --test` first; Playwright's end-to-end specs stay in e2e/.
 */
export default defineConfig({
  test: {
    projects: ["packages/kit-worker", "apps/cafe/worker", "apps/resto/worker"],
    // Show what passing specs print (the append timing of prompt 04): under an AI agent, Vitest otherwise picks its
    // minimal reporter, which keeps the console output of failed tests only.
    silent: false,
  },
});
