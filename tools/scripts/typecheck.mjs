// @ts-check
/**
 * `npm run typecheck`: `tsc --noEmit` (strict, JSDoc) on every workspace that has a tsconfig.json and source files.
 * A workspace with no source yet is listed as skipped, so it is checked as soon as a prompt adds code to it.
 * A `tsconfig.test.json` next to it checks the workspace's Node tests (node:test) without giving its browser code
 * the Node types.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, jsFiles, workspaceDirs } from "./workspaces.mjs";

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
let failed = 0;

for (const dir of [".", ...workspaceDirs()]) {
  const abs = join(ROOT, dir);
  if (!existsSync(join(abs, "tsconfig.json"))) continue;
  if (dir !== "." && jsFiles(abs).length === 0) {
    console.log(`typecheck ${dir}: skipped (no source yet)`);
    continue;
  }
  for (const config of ["tsconfig.json", "tsconfig.test.json"]) {
    if (!existsSync(join(abs, config))) continue;
    const name = config === "tsconfig.json" ? dir : `${dir} (tests)`;
    const run = spawnSync(process.execPath, [tsc, "-p", join(abs, config)], { stdio: "inherit" });
    if (run.status === 0) console.log(`typecheck ${name}: ok`);
    else {
      console.error(`typecheck ${name}: failed`);
      failed++;
    }
  }
}

process.exit(failed ? 1 : 0);
