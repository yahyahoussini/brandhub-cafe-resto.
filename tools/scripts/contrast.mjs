// @ts-check
/**
 * `npm run contrast`: WCAG 2 contrast of the text/background token pairs of docs/07 §2, light and dark, read from
 * packages/kit-web/src/ui/tokens.css. Body text needs ≥ 4.5:1, large text (≥ 24 px, or ≥ 18.66 px bold) and icons ≥ 3:1.
 * Prints the pairs the components use (exit 1 if one fails) and, for information, the docs/07 pairs they avoid.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./workspaces.mjs";

const css = readFileSync(join(ROOT, "packages/kit-web/src/ui/tokens.css"), "utf8");

/**
 * Custom properties of the first block whose selector list matches.
 * @param {RegExp} selector
 */
function block(selector) {
  const m = css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no block ${selector}`);
  /** @type {Record<string, string>} */
  const vars = {};
  for (const [, name, value] of m[1].matchAll(/(--bh-[\w-]+)\s*:\s*([^;]+);/g)) vars[name] = value.trim();
  return vars;
}

const light = block(/:root/);
const dark = { ...light, ...block(/:root\[data-theme="dark"\],\s*\[data-theme="dark"\]/) };

/**
 * @param {Record<string, string>} theme
 * @param {string} name
 * @returns {string} a #rrggbb colour, following var() aliases
 */
function resolve(theme, name, depth = 0) {
  const v = theme[name];
  if (!v) throw new Error(`unknown token ${name}`);
  const alias = v.match(/^var\((--bh-[\w-]+)\)$/);
  if (alias && depth < 5) return resolve(theme, alias[1], depth + 1);
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a #rrggbb colour: ${v}`);
  return v;
}

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} a @param {string} b */
export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pairs the components use: [foreground, background, minimum, where]. State text is written in --bh-text on the soft
 * fill; the state colour carries the icon, border or bar (non-text, ≥ 3:1). Hints are never set on --bh-surface.
 */
const USED = /** @type {const} */ ([
  ["--bh-text", "--bh-bg", 4.5, "body text on the page"],
  ["--bh-text", "--bh-surface", 4.5, "body text on panels"],
  ["--bh-text", "--bh-surface-2", 4.5, "body text on cards, sheets"],
  ["--bh-text-2", "--bh-bg", 4.5, "secondary text"],
  ["--bh-text-2", "--bh-surface", 4.5, "secondary text, hints on panels"],
  ["--bh-text-2", "--bh-surface-2", 4.5, "secondary text on cards"],
  ["--bh-text-3", "--bh-bg", 4.5, "hints on the page"],
  ["--bh-text-3", "--bh-surface-2", 4.5, "hints on cards"],
  ["--bh-text", "--bh-brand-soft", 4.5, "selected tile"],
  ["--bh-on-brand", "--bh-brand", 4.5, "primary button label"],
  ["--bh-on-brand", "--bh-brand-ink", 4.5, "primary button pressed"],
  ["--bh-brand", "--bh-bg", 4.5, "brand text"],
  ["--bh-brand", "--bh-surface-2", 4.5, "secondary button label"],
  ["--bh-on-brand", "--bh-danger", 4.5, "danger button label"],
  ["--bh-danger", "--bh-bg", 4.5, "error message under an input"],
  ["--bh-text", "--bh-ok-soft", 4.5, "success pill and banner text"],
  ["--bh-text", "--bh-warn-soft", 4.5, "warning pill and banner text"],
  ["--bh-text", "--bh-danger-soft", 4.5, "danger pill and error banner text"],
  ["--bh-on-black", "--bh-black", 4.5, "toast"],
  ["--bh-ok", "--bh-ok-soft", 3, "success icon and border"],
  ["--bh-warn", "--bh-warn-soft", 3, "warning icon and border"],
  ["--bh-danger", "--bh-danger-soft", 3, "danger icon and border"],
  ["--bh-ok", "--bh-bg", 3, "success icon, state bar"],
  ["--bh-warn", "--bh-bg", 3, "warning icon, state bar"],
  ["--bh-brand", "--bh-surface", 3, "selection border on panels"],
  ["--bh-accent", "--bh-black", 3, "accent, large text on dark surfaces"],
]);

/** docs/07 pairs the components avoid because they fail as body text (listed so the design system can fix them). */
const AVOIDED = /** @type {const} */ ([
  ["--bh-text-3", "--bh-surface", 4.5, "hints on panels"],
  ["--bh-ok", "--bh-ok-soft", 4.5, "success-coloured text on its soft fill"],
  ["--bh-warn", "--bh-warn-soft", 4.5, "warning-coloured text on its soft fill"],
  ["--bh-danger", "--bh-danger-soft", 4.5, "danger-coloured text on its soft fill"],
  ["--bh-ok", "--bh-bg", 4.5, "success-coloured text on the page"],
  ["--bh-warn", "--bh-bg", 4.5, "warning-coloured text on the page"],
]);

/**
 * @param {readonly (readonly [string, string, number, string])[]} pairs
 */
function measure(pairs) {
  return pairs.flatMap(([fg, bg, min, where]) =>
    /** @type {const} */ ([
      ["light", light],
      ["dark", dark],
    ]).map(([label, theme]) => {
      const r = ratio(resolve(theme, fg), resolve(theme, bg));
      return { theme: label, fg, bg, ratio: r.toFixed(2), min: `${min}`, result: r >= min ? "pass" : "FAIL", where };
    }),
  );
}

const rows = measure(USED);
const avoided = measure(AVOIDED);

const cols = /** @type {const} */ (["theme", "fg", "bg", "ratio", "min", "result", "where"]);
const width = Object.fromEntries(
  cols.map((c) => [c, Math.max(c.length, ...[...rows, ...avoided].map((r) => r[c].length))]),
);
const line = (/** @type {Record<string, string>} */ r) => cols.map((c) => r[c].padEnd(width[c])).join(" | ");
/** @param {string} title @param {Record<string, string>[]} table */
function print(title, table) {
  console.log(`\n${title}\n`);
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  console.log(cols.map((c) => "-".repeat(width[c])).join("-|-"));
  for (const r of table) console.log(line(r));
}
print("Pairs used by the components", rows);
print("docs/07 pairs the components avoid (information)", avoided);

const failures = rows.filter((r) => r.result === "FAIL").length;
const darkMedia = block(/:root:not\(\[data-theme="light"\]\)/);
const darkAttr = block(/:root\[data-theme="dark"\],\s*\[data-theme="dark"\]/);
const sameDark = JSON.stringify(darkMedia) === JSON.stringify(darkAttr);
console.log(
  `\nused: ${rows.length - failures} pass, ${failures} fail (text ≥ 4.5:1; icons, borders, large text ≥ 3:1)`,
);
console.log(`avoided: ${avoided.filter((r) => r.result === "FAIL").length} of ${avoided.length} fail as body text`);
console.log(`dark blocks identical: ${sameDark ? "yes" : "NO"}`);
process.exit(failures || !sameDark ? 1 : 0);
