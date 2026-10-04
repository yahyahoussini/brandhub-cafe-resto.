// @ts-check
/**
 * The workspaces of the root package.json, expanded to folders that hold a package.json.
 * Patterns are either a folder or a folder followed by `/*` (the only forms the root uses).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @returns {string[]} workspace folders relative to the root, sorted */
export function workspaceDirs() {
  /** @type {{ workspaces: string[] }} */
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  /** @type {string[]} */
  const dirs = [];
  for (const pattern of pkg.workspaces) {
    if (pattern.endsWith("/*")) {
      const parent = join(ROOT, pattern.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(parent, entry.name, "package.json"))) {
          dirs.push(relative(ROOT, join(parent, entry.name)));
        }
      }
    } else if (existsSync(join(ROOT, pattern, "package.json"))) {
      dirs.push(pattern);
    }
  }
  return dirs.sort();
}

const SKIP = new Set(["node_modules", "dist", "out", ".wrangler", "coverage"]);

/**
 * JavaScript source files under a folder (skips build output and dependencies).
 * @param {string} dir absolute folder
 * @returns {string[]}
 */
export function jsFiles(dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...jsFiles(path));
    else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) found.push(path);
  }
  return found;
}
