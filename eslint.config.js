// @ts-check
import js from "@eslint/js";
import globals from "globals";
import logicalCssPlugin from "./tools/eslint/logical-css.js";
import { storeThroughJurisdiction } from "./tools/eslint/store-jurisdiction.js";

/** The repository's own rules (tools/eslint). */
const bh = { rules: { ...logicalCssPlugin.rules, "store-through-jurisdiction": storeThroughJurisdiction } };

/**
 * Imports that would join the two products (D1) or reach into a package by path instead of by name.
 * Regular expressions on the import string, so any relative depth (`../../resto/web/x.js`), a folder (`../resto`)
 * and the workspace package name (`@brandhub/resto-web`) are caught. `./restore.js` is not.
 * @param {string} app
 */
const appRegex = (app) => `(^|/)(apps/)?${app}(/|$)|^@brandhub/${app}-`;
const PACKAGES_BY_PATH = "(^|/)packages/";
const byPathIntoPackages = {
  regex: PACKAGES_BY_PATH,
  message: "Apps import packages by name (@brandhub/kit/money), never by a relative path.",
};

/**
 * `no-restricted-imports` covers `import` and `export … from`; dynamic `import()` needs a syntax selector.
 * @param {string} regex
 * @param {string} message
 */
const noDynamicImport = (regex, message) => ({
  selector: `ImportExpression[source.value=/${regex.replaceAll("/", "\\/")}/]`,
  message: `${message} (dynamic import)`,
});

/** @param {"cafe" | "resto"} self @param {"cafe" | "resto"} other */
const crossAppRules = (self, other) => {
  const message = `apps/${self} never imports apps/${other} (D1); shared code goes to a package.`;
  return {
    "no-restricted-imports": ["error", { patterns: [{ regex: appRegex(other), message }, byPathIntoPackages] }],
    "no-restricted-syntax": [
      ...noFloatMoney,
      ...noColourLiteral,
      noDynamicImport(appRegex(other), message),
      noDynamicImport(PACKAGES_BY_PATH, byPathIntoPackages.message),
    ],
  };
};

/** Money goes through @brandhub/kit/money: no float parsing or float formatting in the apps (D21). */
const noFloatMoney = [
  "error",
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: "No parseFloat in apps: parse amounts with @brandhub/kit/money.",
  },
  {
    selector: "CallExpression[callee.property.name='parseFloat']",
    message: "No Number.parseFloat in apps: parse amounts with @brandhub/kit/money.",
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: "No .toFixed() in apps: format amounts with @brandhub/kit/money.",
  },
];

/**
 * Colours come from the tokens of docs/07 only (prompt 02). Flags, in UI code:
 * - a whole string that is a hex colour ("#1a1bbf"), a hex or named colour in a Tailwind arbitrary value
 *   (`bg-[#fff]`, `text-[red]`, `[color:white]`), and colour functions (`rgb(`, `hsl(`, `oklch(`, `color-mix(`…);
 * - a CSS declaration in a string that sets a colour to anything but a token (`"color: red"`, `background:#fff`);
 * - a JSX style object colour that is not `var(--bh-…)`.
 * `href="#cafe"` or `"#add"` inside a longer string is not a colour.
 */
const NAMED =
  "white|black|red|green|blue|yellow|orange|purple|pink|gr[ae]y|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|transparent";
const COLOUR_TEXT = [
  "^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
  `\\[(?:[a-z-]+:)?(?:#[0-9a-fA-F]{3,8}|(?:${NAMED}))\\]`,
  "\\b(?:rgba?|hsla?|oklch|oklab|hwb|lab|lch|color-mix|color)\\(",
  "\\b(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke|outline-color)\\s*:\\s*(?!var\\(|inherit|currentColor)[#a-z]",
].join("|");
const COLOUR_MESSAGE = "No colour literal in UI code: use a token class (bg-brand, text-text-2) from docs/07.";
const noColourLiteral = [
  {
    selector: `Literal[value=/${COLOUR_TEXT}/]:not(JSXAttribute[name.name=/^(href|id|for|htmlFor|name)$/] > Literal)`,
    message: COLOUR_MESSAGE,
  },
  { selector: `TemplateElement[value.raw=/${COLOUR_TEXT}/]`, message: COLOUR_MESSAGE },
  {
    selector:
      "Property[key.name=/^(color|background|backgroundColor|border(Inline|Block)?(Start|End)?Color|fill|stroke|outlineColor)$/] > Literal.value:not([value=/^var\\(--bh-/])",
    message: COLOUR_MESSAGE,
  },
];

const STATION_MESSAGE = "The Station imports packages, never an app.";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.wrangler/**",
      "apps/station/out/**",
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      // 2025: JSON imports need `with { type: "json" }` under NodeNext.
      ecmaVersion: 2025,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.es2024 },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: { bh },
    rules: {
      "bh/logical-css": "error",
      "bh/jsx-uses-vars": "error",
      "no-console": "error",
      // Character classes with no-break spaces are how money and Arabic text are parsed (kit money.js, escpos.js).
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
      // `const { a, ...rest } = x` drops `a` on purpose.
      "no-unused-vars": ["error", { ignoreRestSiblings: true, argsIgnorePattern: "^_" }],
    },
  },
  // The kit's pure rules run in browsers, Workers and the Station: only globals common to Node and browsers.
  {
    files: ["packages/kit/src/**"],
    languageOptions: { globals: { ...globals["shared-node-browser"] } },
  },
  // Browser code.
  {
    files: ["packages/kit-web/**", "apps/*/web/**"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["packages/kit-web/src/**"],
    rules: { "no-restricted-syntax": ["error", ...noColourLiteral] },
  },
  // Workers (Cloudflare runtime: service worker scope plus its own globals).
  {
    files: ["packages/kit-worker/**", "apps/*/worker/**"],
    languageOptions: { globals: { ...globals.serviceworker, WebSocketPair: "readonly", HTMLRewriter: "readonly" } },
    rules: { "no-console": ["error", { allow: ["warn", "error"] }] },
  },
  // A client's store is reached only through jurisdictionStore, in the EU jurisdiction (D19, docs/02 §4).
  {
    files: ["apps/*/worker/src/**", "packages/kit-worker/src/**"],
    ignores: ["packages/kit-worker/src/jurisdiction.js"],
    rules: { "bh/store-through-jurisdiction": "error" },
  },
  // Node code: tools, tests and build configs (vite.config.js, wrangler and playwright configs run on Node).
  {
    files: ["tools/**", "**/test/**", "**/*.config.{js,mjs}", "e2e/**"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Playwright specs also run callbacks in the page (page.evaluate).
  {
    files: ["e2e/**"],
    languageOptions: { globals: { ...globals.browser } },
  },
  // The Station: Electron main process runs on Node.
  {
    files: ["apps/station/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { "no-console": ["error", { allow: ["warn", "error"] }] },
  },
  // Command-line tools print their results; tests may print notes.
  {
    files: ["tools/**", "**/test/**", "e2e/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["apps/cafe/**"],
    rules: crossAppRules("cafe", "resto"),
  },
  {
    files: ["apps/resto/**"],
    rules: crossAppRules("resto", "cafe"),
  },
  {
    files: ["apps/station/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [byPathIntoPackages, { regex: appRegex("(cafe|resto)"), message: STATION_MESSAGE }],
        },
      ],
      "no-restricted-syntax": [
        ...noFloatMoney,
        noDynamicImport(appRegex("(cafe|resto)"), STATION_MESSAGE),
        noDynamicImport(PACKAGES_BY_PATH, byPathIntoPackages.message),
      ],
    },
  },
];
