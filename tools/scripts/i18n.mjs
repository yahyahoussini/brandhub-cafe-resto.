// @ts-check
/**
 * `npm run i18n` (part of the gate): every visible string exists in French and Arabic (CLAUDE.md "Rules for screens").
 * For each `i18n/` folder of every workspace:
 *   - `fr.json` and `ar.json` have the same keys, no empty string, and the same `{placeholders}`;
 *   - a plural message has `one` and `other` in French and all six Arabic categories in Arabic;
 *   - `term.*` equals `data/glossary.json` (fr and ar) wherever it appears, and an app never redefines a kit key;
 *   - no Arabic string uses a Darija word of the glossary, whatever its article or diacritics (D11);
 *   - an Arabic value is not French left untranslated;
 *   - each plural form keeps the placeholders (only Arabic one/two may spell the count out);
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
/** Arabic word without diacritics, tatweel and a leading article or preposition (ال، لل، بال، وال، فال). */
const normalize = (/** @type {string} */ w) =>
  w
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/^(وال|بال|فال|كال|لل|ال)/, "")
    .replace(/[^\u0621-\u064A]/g, "");
const words = (/** @type {string} */ s) =>
  s
    .split(/[\s،؛.:—\-()]+/)
    .map(normalize)
    .filter((w) => w.length >= 3);
/** Words that are Darija in the glossary but also plain Modern Standard Arabic. */
const MSA = new Set(["يوافق", "ليل", "صباح", "حساب", "طبع", "تقرير"]);
const msaTerms = new Set(terms.flatMap((t) => words(t.ar)));
const darija = new Set(terms.flatMap((t) => words(t.darija ?? "")).filter((w) => !msaTerms.has(w) && !MSA.has(w)));
/** Arabic values that may stay in Latin script. */
const LATIN_OK = new Set(["styleguide.lang_fr"]);

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
      // Per form: every placeholder in every form, except {count}, which French one and Arabic zero/one/two may spell
      // out (دقيقة واحدة، دقيقتين).
      for (const [l, m] of /** @type {const} */ ([
        ["fr", v],
        ["ar", a],
      ])) {
        if (typeof m === "string") continue;
        for (const [cat, text] of Object.entries(m)) {
          for (const p of placeholders(v)) {
            const spelled = p === "count" && (l === "fr" ? cat === "one" : ["zero", "one", "two"].includes(cat));
            if (!spelled && !text.includes(`{${p}}`))
              problems.push(`${rel}/${l}.json: "${k}" form "${cat}" lacks {${p}}`);
          }
        }
      }
      // French left in the Arabic file.
      if (
        !LATIN_OK.has(k) &&
        JSON.stringify(v) === JSON.stringify(a) &&
        !texts(a).some((x) => /[\u0600-\u06FF]/.test(x))
      ) {
        problems.push(`${rel}/ar.json: "${k}" is the French text, not Arabic`);
      }
    }
    // term.* always equals the glossary; the kit's folder holds every term.
    for (const [l, map] of /** @type {const} */ ([
      ["fr", fr],
      ["ar", ar],
    ])) {
      for (const k of map.keys()) {
        if (!k.startsWith("term.")) continue;
        const term = terms.find((x) => `term.${x.key}` === k);
        if (!term) problems.push(`${rel}/${l}.json: "${k}" is not in data/glossary.json`);
        else if (map.get(k) !== term[l]) problems.push(`${rel}/${l}.json: ${k} ≠ glossary "${term[l]}"`);
      }
    }
    if (dir === kitWebDir) {
      for (const term of terms) {
        if (!fr.has(`term.${term.key}`) || !ar.has(`term.${term.key}`))
          problems.push(`${rel}: glossary term "${term.key}" missing`);
      }
    }
    for (const [k, v] of ar) {
      const hits = texts(v)
        .flatMap(words)
        .filter((w) => darija.has(w));
      if (hits.length)
        problems.push(`${rel}/ar.json: "${k}" uses Darija ${hits.map((h) => `"${h}"`).join(", ")} (D11)`);
    }
    keysByDir.set(dir, new Set([...fr.keys(), ...ar.keys()]));
    console.log(`i18n ${rel}: ${fr.size} keys in fr, ${ar.size} in ar`);
  }
}

// Every literal key passed to t() exists in the kit's strings or in the workspace's own i18n folder.
const kitKeys = keysByDir.get(kitWebDir) ?? new Set();
for (const [d, keys] of keysByDir) {
  if (d === kitWebDir) continue;
  for (const k of keys) if (kitKeys.has(k)) problems.push(`${relative(ROOT, d)}: "${k}" redefines a shared kit string`);
}
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
