# Prompt 10 — Quality gates and CI

> Run after prompt 09.

## Goal
`npm run gate` and GitHub Actions stop any change that breaks money, languages, speed, accessibility or secrecy, before
the café features start.

## Read first
`CLAUDE.md` · `DECISIONS.md` D12, D44–D46, D50 · `docs/08-security.md §7, §9` · `docs/12-deploy-runbook.md §6`.

## Do
1. Budgets (`npm run budgets`): build both web apps and fail if the first-load JavaScript of `/caisse`, `/serveur` or
   `/ecran` exceeds 150 KB gzip; report fonts and CSS sizes; a Playwright run on `/caisse` with 4× CPU slowdown and a slow
   4G profile that fails above 3 s to interactive.
2. Languages: `npm run i18n` (from prompt 02) plus a Playwright pass that screenshots every route in French and Arabic and
   fails on horizontal overflow at 360 px and on text that escapes its container.
3. Accessibility: axe-core on `/gestion` pages (no serious or critical violations); touch-target check (≥ 48 px) on staff
   routes.
4. Secrets: a check that fails on real secret shapes in tracked files — a full device token
   (`bhd1\.tnt_[0-9a-f-]{36}\.dev_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}`), PEM private keys (`-----BEGIN … PRIVATE KEY`), a JWK
   private key (`"d": "<43 base64url>"`), `sk_` keys — except `docs/`, `prompts/`, `package-lock.json` and fixtures named
   `*.fake.*`; it prints file names only.
5. Headers: a test that every route of both Workers (wrangler dev) returns the headers of docs/08 §7 and `noindex`.
6. GitHub Actions per docs/12 §6: pull request → gate + e2e; `main` → deploy staging; tags `cafe-v*`, `resto-v*` →
   production with a manual approval and, once the repository variable `LIVE_CAFE` / `LIVE_RESTO` is `true`, a check that
   the current time in Casablanca is inside the release window (D46);
   `station-v*` → Windows build, upload to R2, publish version and hash.

## Constraints
Gates run in under 10 minutes on CI. No gate is skipped with a flag in a release workflow.

## Acceptance checks (run them, paste the output)
1. `npm run gate` output with each part's result and the budget numbers.
2. A pull request with a planted budget violation fails; the run URL.
3. With `LIVE_CAFE=true`, the release workflow refuses a tag pushed outside the window (dry run output).

## Update docs/STATUS.md
Row 10; current budget numbers; CI duration.

## Commit
`ci: budgets, language, accessibility, secret and header gates; release workflows`
