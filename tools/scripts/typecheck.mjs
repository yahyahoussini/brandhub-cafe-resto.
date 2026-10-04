// @ts-check
/**
 * `npm run typecheck`: `tsc --noEmit` (strict, JSDoc) on every workspace that has a tsconfig.json and source files.
 * A workspace with no source yet is listed as skipped, so it is checked as soon as a prompt adds code to it.
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
  const run = spawnSync(process.execPath, [tsc, "-p", join(abs, "tsconfig.json")], { stdio: "inherit" });
  if (run.status === 0) console.log(`typecheck ${dir}: ok`);
  else {
    console.error(`typecheck ${dir}: failed`);
    failed++;
  }
}

process.exit(failed ? 1 : 0);
