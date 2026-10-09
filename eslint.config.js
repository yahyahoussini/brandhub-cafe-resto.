// @ts-check
import js from "@eslint/js";
import globals from "globals";
import bh from "./tools/eslint/logical-css.js";

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

/** Colours come from the tokens of docs/07 only (prompt 02): no hex, rgb(), hsl() or oklch() literal in UI code. */
const noColourLiteral = [
  {
    selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|oklab|hwb|lab|lch)\\(/]",
    message: "No colour literal in UI code: use a token class (bg-brand, text-text-2) from docs/07.",
  },
  {
    selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|oklab|hwb|lab|lch)\\(/]",
    message: "No colour literal in UI code: use a token class (bg-brand, text-text-2) from docs/07.",
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
