// @ts-check
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Fails the run when a project of `projects` has no spec file (its test folder moved, or an `include` that matches
 * nothing): Vitest alone exits 0 as long as another project ran a test, so a whole Worker's runtime tests could drop
 * out of `npm test` and `npm run gate` unnoticed. Each project's own `include` is globbed, so a run filtered on the
 * command line (`vitest run store`) is not affected, and a project added to `projects` is covered too.
 * @returns {import("vitest/node").Reporter}
 */
function everyProjectHasSpecs() {
  /** @type {import("vitest/node").Vitest | null} */
  let vitest = null;
  return {
    onInit(ctx) {
      vitest = ctx;
    },
    async onTestRunEnd() {
      if (!vitest) return;
      /** @type {string[]} */
      const empty = [];
      for (const project of vitest.projects) {
        const { testFiles } = await project.globTestFiles();
        if (testFiles.length === 0) empty.push(project.name);
      }
      if (empty.length === 0) return;
      process.stderr.write(`\nNo spec file in the Vitest project(s) ${empty.join(", ")}: their tests did not run.\n\n`);
      process.exitCode = 1;
    },
  };
}

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
    // Vitest's own choice of reporters (configDefaults), plus the check that no project is left without specs.
    reporters: [...configDefaults.reporters, everyProjectHasSpecs()],
  },
});
