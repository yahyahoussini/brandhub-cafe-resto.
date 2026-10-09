// @ts-check
/**
 * `npm run i18n` (part of the gate): every visible string exists in French and Arabic (CLAUDE.md "Rules for screens").
 * For each `i18n/` folder of every workspace:
 *   - `fr.json` and `ar.json` have the same keys, no empty string, and the same `{placeholders}`;
 *   - a plural message has `one` and `other` in French and all six Arabic categories in Arabic;
 *   - `term.*` equals `data/glossary.json` (fr and ar), and no Arabic string uses a Darija entry (D11);
 *   - every literal key passed to `t("…")` in the workspace's source exists.
 * Exits 1 on the first run that finds a problem, listing all of them.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, jsFiles, workspaceDirs } from "./workspaces.mjs";

const PLURAL = ["zero", "one", "two", "few", "many", "other"];
const REQUIRED = { fr: ["one", "other"], ar: ["zero", "one", "two", "few", "many", "other"] };

/** @param {unknown} v */
const isPlural = (v) =>
  !!v && typeof v === "object" && !Array.isArray(v) && "other" in v && Object.keys(v).every((k) => PLURAL.includes(k));

/**
 * @param {Record<string, any>} obj
 * @param {string} [prefix]
 * @returns {Map<string, string | Record<string, string>>}
 */
function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("$")) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || isPlural(v)) out.set(key, v);
    else if (v && typeof v === "object") for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
    else out.set(key, v);
  }
  return out;
}

/** @param {string | Record<string, string>} m */
const texts = (m) => (typeof m === "string" ? [m] : Object.values(m));
/** @param {string | Record<string, string>} m */
const placeholders = (m) => new Set(texts(m).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1])));

/** @param {string} dir */
function i18nDirs(dir) {
  /** @type {string[]} */
  const found = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || ["node_modules", "dist", "out", ".wrangler"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.name === "i18n" && (existsSync(join(p, "fr.json")) || existsSync(join(p, "ar.json")))) found.push(p);
    found.push(...i18nDirs(p));
  }
  return found;
}

const glossary = JSON.parse(readFileSync(join(ROOT, "data/glossary.json"), "utf8"));
/** @type {{ key: string, fr: string, ar: string, darija: string }[]} */
const terms = glossary.terms;
const darija = terms.map((t) => t.darija).filter((d) => d && d.length >= 3 && !terms.some((t) => t.ar === d));

/** @type {string[]} */
const problems = [];
/** All keys known per workspace (the kit's shared strings are available everywhere). */
const kitWebDir = join(ROOT, "packages/kit-web/src/i18n");
/** @type {Map<string, Set<string>>} */
const keysByDir = new Map();

for (const ws of workspaceDirs()) {
  for (const dir of i18nDirs(join(ROOT, ws))) {
    const rel = relative(ROOT, dir);
    const files = /** @type {const} */ (["fr", "ar"]).map((l) => {
      const p = join(dir, `${l}.json`);
      if (!existsSync(p)) {
        problems.push(`${rel}/${l}.json is missing`);
        return new Map();
      }
      return flatten(JSON.parse(readFileSync(p, "utf8")));
    });
    const [fr, ar] = files;
    for (const k of fr.keys()) if (!ar.has(k)) problems.push(`${rel}: "${k}" has no Arabic (ar.json)`);
    for (const k of ar.keys()) if (!fr.has(k)) problems.push(`${rel}: "${k}" has no French (fr.json)`);
    for (const [l, map] of /** @type {const} */ ([
      ["fr", fr],
      ["ar", ar],
    ])) {
      for (const [k, v] of map) {
        if (typeof v !== "string" && !isPlural(v)) {
          problems.push(`${rel}/${l}.json: "${k}" is neither a string nor a plural object`);
          continue;
        }
        if (texts(v).some((s) => typeof s !== "string" || !s.trim()))
          problems.push(`${rel}/${l}.json: "${k}" is empty`);
        if (isPlural(v)) {
          const missing = REQUIRED[l].filter((c) => !(c in /** @type {object} */ (v)));
          if (missing.length) problems.push(`${rel}/${l}.json: plural "${k}" lacks ${missing.join(", ")}`);
        }
      }
    }
    for (const [k, v] of fr) {
      const a = ar.get(k);
      if (!a) continue;
      if (isPlural(v) !== isPlural(a)) problems.push(`${rel}: "${k}" is plural in one language only`);
      const pf = [...placeholders(v)].sort().join(",");
      const pa = [...placeholders(a)].sort().join(",");
      if (pf !== pa) problems.push(`${rel}: "${k}" placeholders differ (fr {${pf}} / ar {${pa}})`);
    }
    if (fr.has("term.till") || ar.has("term.till")) {
      for (const term of terms) {
        if (fr.get(`term.${term.key}`) !== term.fr)
          problems.push(`${rel}/fr.json: term.${term.key} ≠ glossary "${term.fr}"`);
        if (ar.get(`term.${term.key}`) !== term.ar)
          problems.push(`${rel}/ar.json: term.${term.key} ≠ glossary "${term.ar}"`);
      }
    }
    for (const [k, v] of ar) {
      for (const d of darija)
        if (texts(v).some((s) => s.includes(d))) problems.push(`${rel}/ar.json: "${k}" uses Darija "${d}" (D11)`);
    }
    keysByDir.set(dir, new Set([...fr.keys(), ...ar.keys()]));
    console.log(`i18n ${rel}: ${fr.size} keys in fr, ${ar.size} in ar`);
  }
}

// Every literal key passed to t() exists in the kit's strings or in the workspace's own i18n folder.
const kitKeys = keysByDir.get(kitWebDir) ?? new Set();
for (const ws of workspaceDirs()) {
  const own = [...keysByDir].filter(([d]) => d.startsWith(join(ROOT, ws) + "/")).flatMap(([, s]) => [...s]);
  const known = new Set([...kitKeys, ...own]);
  for (const file of jsFiles(join(ROOT, ws))) {
    if (file.includes("/test/")) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\(\s*(["'`])([\w.-]+)\1/g)) {
      if (!known.has(m[2])) problems.push(`${relative(ROOT, file)}: t("${m[2]}") has no message`);
    }
  }
}

if (problems.length) {
  console.error(`\ni18n: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("i18n: every key exists in fr and ar");
