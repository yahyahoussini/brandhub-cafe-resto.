# Prompt 02 — Design system, fonts offline, UI parts, i18n

> Run after prompt 01.

## Goal
One set of tokens, fonts and Preact components used by both products, working offline, in French and Arabic, light and
dark, with the sizes of D12.

## Read first
`docs/07-design-system.md` (all) · `DECISIONS.md` D11, D12, D13, D15, D16 · `docs/06-ux-flows.md §1, §8` · `data/glossary.json`.

## Do
1. `packages/kit-web/src/ui/tokens.css` from docs/07 §2–§4 as CSS custom properties, light and dark
   (`prefers-color-scheme` plus a `data-theme` override), and a Tailwind 4 theme that maps to them (`@theme`).
2. Fonts: add the five families from `@fontsource` packages (DM Sans, DM Serif Display, DM Mono, IBM Plex Sans Arabic,
   Noto Kufi Arabic), Latin and Arabic subsets only, weights used by docs/07 §3; copy their OFL licences into
   `packages/kit-web/fonts/LICENSES/`. No request to Google Fonts or any CDN.
3. Components in `packages/kit-web/src/ui/` (Preact, `.jsx`, JSDoc props): `Button` (primary/secondary/danger, 56 px on
   staff screens), `Tile` (≥ 96 × 96, price, "Rupture" pill, selected state), `Stepper`, `Keypad`, `PinPad`, `Sheet`
   (the only shadow), `Toast`, `SyncBadge` (the three states of D15 with text), `Input` (label above), `Pill`, `Table`,
   `ApprovalDialog` (manager PIN + reason list from docs/06 §1), `EmptyState`, `ErrorBanner`. Every component supports
   `dir="rtl"`; icons from `lucide-preact`, flipped when they point.
4. i18n runtime `packages/kit-web/src/i18n/`: `t(key, params)`, plural rules for fr and ar, `setLocale`, `dir()`,
   `formatAmount` from the kit, Western digits by default with a per-user Arabic-Indic option; shared strings in
   `packages/kit-web/src/i18n/{fr,ar}.json` seeded from `data/glossary.json` (`ar` terms only; Darija never in the app);
   `npm run i18n` checks that every key exists in both languages in every workspace and fails otherwise.
5. A dev-only `/styleguide` page in both web apps (Vite dev server) showing every component in every state, FR/AR ×
   light/dark.
6. A contrast script (`npm run contrast`) that checks the text/background token pairs of docs/07 §2 (≥ 4.5:1 for body
   text, ≥ 3:1 for large text) and prints the table.

## Constraints
Tokens only from docs/07; no colour literal in components. Logical CSS only (lint). No external request at runtime.

## Acceptance checks (run them, paste the output)
1. `npm run gate` passes; `npm run i18n` passes and fails on a planted missing Arabic key (then remove it).
2. `npm run contrast` table.
3. Playwright screenshots of `/styleguide` in the four variants (attach paths) and the network log showing no external host.

## Update docs/STATUS.md
Row 02; gzip size of the UI kit and of the fonts.

## Commit
`feat(kit-web): design tokens, offline fonts, UI components and i18n`
