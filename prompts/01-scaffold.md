# Prompt 01 — Repository scaffold, lint, type check, tests

> Run after prompt 00. Needs from Yahya: the empty private GitHub repository `brandhub-cafe-resto`.

## Goal
A monorepo where every later prompt drops code into the right place and `npm run gate` protects the rules of
`CLAUDE.md` from the first commit.

## Read first
`CLAUDE.md` (Repository, Commands) · `DECISIONS.md` D1, D17, D18, D44 · `docs/02-architecture.md §2` · the existing
`package.json` and `packages/kit/package.json`.

## Do
1. Extend the root `package.json` workspaces to `packages/*`, `apps/cafe/*`, `apps/resto/*`, `apps/station`, `tools`.
   Create empty workspaces with a `package.json` and a `README.md` line each: `packages/kit-web` (`@brandhub/kit-web`),
   `packages/kit-worker` (`@brandhub/kit-worker`), `apps/cafe/worker`, `apps/cafe/web`, `apps/resto/worker`,
   `apps/resto/web`, `apps/station`, `tools`. Keep `packages/kit` untouched.
2. Type check: `typescript@5` as a dev dependency; `tsconfig.base.json` with `allowJs`, `checkJs`, `strict`, `noEmit`,
   `target es2023`, `module/moduleResolution nodenext` (`bundler` for the web apps), `jsx preserve` with
   `jsxImportSource preact`; one `tsconfig.json` per workspace; `npm run typecheck` runs them all. The kit already passes
   strict checking: keep it that way.
3. Lint: ESLint flat config with `@eslint/js` recommended plus:
   - `no-restricted-imports`: `apps/cafe/**` cannot import `apps/resto/**` and the reverse; apps import packages by name only;
   - a local rule `bh/logical-css` that fails on class strings containing `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`,
     `text-left`, `text-right`, `rounded-l`, `rounded-r`, `border-l`, `border-r`;
   - `no-restricted-syntax` in `apps/**` for `parseFloat(` and `.toFixed(` (money goes through `@brandhub/kit/money`);
   - `no-console` except `console.warn`/`console.error` in the Station and Workers.
4. Formatting: Prettier (print width 120). `.editorconfig`, `.nvmrc` (22), `.gitignore` (node_modules, dist, .wrangler,
   .dev.vars, *.sqlite*, apps/station/out, test-results, playwright-report, coverage).
5. Tests: `npm test` runs `node --test` in every workspace that has tests; Playwright (`@playwright/test`) installed at
   the root with `npx playwright install chromium`, config with two projects (`fr`, `ar`) and two viewports (360 × 800,
   1280 × 800); `npm run e2e` (no test yet: a placeholder that passes).
6. `npm run i18n` and `npm run budgets`: stub scripts that print "not configured yet" and exit 0 (prompts 02 and 10
   replace them). `npm run gate` = typecheck + lint + i18n + test + budgets.
7. Connect the GitHub remote and push.

## Constraints
JavaScript only (no `.ts` file anywhere). No framework code yet. No dependency beyond tooling.

## Acceptance checks (run them, paste the output)
1. `npm ci && npm run gate` → passes; the kit's tests are counted.
2. Plant `class="ml-2"` in a scratch `.jsx` file and an import from `apps/resto` inside `apps/cafe`: `npm run lint` fails
   with both rules; remove them.
3. `npm run typecheck` → 0 errors. `git remote -v` and the pushed commit.

## Update docs/STATUS.md
Row 01; the exact Node, npm and TypeScript versions.

## Commit
`chore: monorepo scaffold, lint, type check, tests`
