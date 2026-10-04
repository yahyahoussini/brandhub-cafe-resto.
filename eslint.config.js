// @ts-check
import js from "@eslint/js";
import globals from "globals";
import bh from "./tools/eslint/logical-css.js";

/** Imports that would join the two products (D1) or reach into a package by path instead of by name. */
const crossApp = {
  cafe: ["**/apps/resto/**", "**/resto/web/**", "**/resto/worker/**", "@brandhub/resto-*"],
  resto: ["**/apps/cafe/**", "**/cafe/web/**", "**/cafe/worker/**", "@brandhub/cafe-*"],
};
const byPathIntoPackages = {
  group: ["**/packages/**"],
  message: "Apps import packages by name (@brandhub/kit/money), never by a relative path.",
};

/** @param {"cafe" | "resto"} self @param {"cafe" | "resto"} other */
const noCrossImports = (self, other) => [
  "error",
  {
    patterns: [
      {
        group: crossApp[self],
        message: `apps/${self} never imports apps/${other} (D1); shared code goes to a package.`,
      },
      byPathIntoPackages,
    ],
  },
];

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
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.es2024 },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: { bh },
    rules: {
      "bh/logical-css": "error",
      "no-console": "error",
      // Character classes with no-break spaces are how money and Arabic text are parsed (kit money.js, escpos.js).
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
      // `const { a, ...rest } = x` drops `a` on purpose.
      "no-unused-vars": ["error", { ignoreRestSiblings: true, argsIgnorePattern: "^_" }],
    },
  },
  // Node code: the kit, tools, tests and root configs.
  {
    files: ["packages/kit/**", "tools/**", "**/test/**", "*.config.js", "e2e/**"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Browser code.
  {
    files: ["packages/kit-web/**", "apps/*/web/**"],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Workers (Cloudflare runtime is a service worker scope).
  {
    files: ["packages/kit-worker/**", "apps/*/worker/**"],
    languageOptions: { globals: { ...globals.serviceworker } },
    rules: { "no-console": ["error", { allow: ["warn", "error"] }] },
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
    rules: { "no-restricted-imports": noCrossImports("cafe", "resto"), "no-restricted-syntax": noFloatMoney },
  },
  {
    files: ["apps/resto/**"],
    rules: { "no-restricted-imports": noCrossImports("resto", "cafe"), "no-restricted-syntax": noFloatMoney },
  },
  {
    files: ["apps/station/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            byPathIntoPackages,
            { group: ["**/apps/cafe/**", "**/apps/resto/**"], message: "The Station imports packages, never an app." },
          ],
        },
      ],
      "no-restricted-syntax": noFloatMoney,
    },
  },
];
