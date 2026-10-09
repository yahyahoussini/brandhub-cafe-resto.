# STATUS — build log

Claude Code updates this file at the end of every prompt (CLAUDE.md, "Each prompt").

## Inputs from Yahya
| Input | Value | Date |
|---|---|---|
| Gate 1 result (18 Sep interviews) | Not run yet. No interview result recorded; the build starts without Gate 1 evidence. | 4 Oct 2026 |
| Pilot 1 (name, address, current till) | Not chosen yet. Needed by prompt 09 (hardware, 12 Oct) and prompt 11 (menu, legal identity, VAT, 26 Oct). | 4 Oct 2026 |
| Existing code from the 5 Sep runbook | No. The pack starts from an empty repository. | 4 Oct 2026 |
| Reference hardware bought for tests | _to fill before prompt 09_ | |
| WhatsApp Business number (reports) | _to fill before prompt 18_ | |

## Prompts
| # | Prompt | State | Date | Notes |
|---|---|---|---|---|
| 00 | Orientation | done | 4 Oct 2026 | Node v22.22.0, `npm test` 75/75. 15 contradictions or gaps listed below (not applied). Gate 1 not run, pilot 1 not chosen. |
| 01 | Repository scaffold | done | 4 Oct 2026 | Node v22.22.0, npm 10.9.4, TypeScript 5.9.3, ESLint 9.39.5, Prettier 3.9.9, Playwright 1.56.1. `npm ci && npm run gate` passes, 94 tests (kit 75 + `bh/logical-css` 19). Details below. |
| 02 | Design system, fonts, UI parts, i18n | done | 9 Oct 2026 | `npm run gate` passes, 109 tests. `npm run contrast`: 52/52 used pairs pass. 21 Playwright runs pass (16 style guide, 5 behaviour), no external host. UI kit 10.4 KB gzip (21.7 KB with Preact, signals, Lucide), CSS 5.0 KB, fonts 208 KB. Review fixes in a second commit. Details below. |

## Current state
- Kit: 75 unit tests passing (money, ids, order with moves and customers, bank with the bank guard, receipts, escpos,
  timezone, licence, control signature, journal).
- Apps: not started. Empty workspaces exist (prompt 01): `@brandhub/kit-web`, `@brandhub/kit-worker`,
  `@brandhub/cafe-worker`, `@brandhub/cafe-web`, `@brandhub/resto-worker`, `@brandhub/resto-web`, `@brandhub/station`,
  `@brandhub/tools`.
- Tooling (prompt 01):
  - `npm run typecheck` (`tools/scripts/typecheck.mjs`) runs `tsc -p` on the root and every workspace that has source;
    empty workspaces print "skipped (no source yet)". Libraries per area:
    - web apps and `kit-web`: `moduleResolution: bundler`, DOM lib;
    - Workers and `kit-worker`: `webworker` lib (prompt 04 adds the Cloudflare types);
    - Station and tools: DOM lib, for the kit's `CryptoKey`;
    - kit `src/`: DOM lib and no Node types, so a Node-only API in the pure rules fails.
    The root tsconfig checks `e2e/` and the build configs (`*.config.js` of each app), which run on Node.
  - The kit's tests have no `// @ts-check` and are not strict-clean (30 errors); they stay untouched as provided and
    are not type-checked.
  - `npm run lint`: ESLint 9 flat config with `@eslint/js` recommended and `ecmaVersion` 2025 (JSON imports need
    `with { type: "json" }` under NodeNext). Rules:
    - `bh/logical-css` (`tools/eslint/logical-css.js`, 19 tests): follows constants, variant maps, ternaries and
      `.filter(Boolean).join(" ")` chains in the file; catches Tailwind 4's trailing `!` and `scroll-ml-`.
    - café↔resto import ban (any relative depth, folder, package name, `export … from` and dynamic `import()`);
      the Station never imports an app; no relative imports into `packages/`.
    - no `parseFloat`/`toFixed` in `apps/**`.
    - `no-console`: warn/error allowed in Station and Workers; console allowed in `tools/**` and tests.
    - kit `src/` only sees globals common to Node and browsers.
  - Three rule options keep the provided kit lint-clean without editing it: `no-irregular-whitespace` skips regular
    expressions, `no-unused-vars` ignores rest siblings, and console is allowed in tests.
  - ESLint 9 instead of 10: ESLint 10 needs Node ≥ 22.13 and `engines` allows 22.12.
  - Prettier (width 120) formats the new code only; it ignores `*.md`, `docs/`, `prompts/`, `data/` and `packages/kit/`,
    so the pack keeps its layout. `npm run format` and `npm run format:check` are available; they are not part of the gate.
  - `npm test` = `node --test` over `*.test.{js,mjs,cjs}` in `packages/*/test`, `apps/*/*/test`, `apps/station/test`
    and `tools/test`.
  - `npm run e2e` = Playwright, 4 projects (`fr-360`, `fr-1280`, `ar-360`, `ar-1280`), passes with no tests. One
    language is selected with `--project='fr*'` or `--project='ar*'`.
  - Playwright is pinned to 1.56.1 because that version uses the Chromium build preinstalled in the cloud sandbox
    (`npx playwright install` is disabled there). On Yahya's computer, run `npx playwright install chromium` once.
  - `npm run i18n` and `npm run budgets` are stubs until prompts 02 and 10.
  - `.gitignore` keeps every local secret file out (`.dev.vars*`, `.env*`, except `*.example`).
  - Before commit, three review agents checked the scaffold and a second pass tried to disprove each finding. The confirmed
    findings are fixed in `fix(tooling): close lint and type-check gaps found in review`.
- Design system and UI kit (prompt 02), `packages/kit-web`:
  - `src/ui/tokens.css`: every value of docs/07 §2–§4 as `--bh-*` custom properties (colours, type, radius, seam,
    4 px grid, paddings 16/24, gaps 32/48, gutters 24/40, reading column 860 px, motion 120/160 ms, kitchen flash
    2 × 300 ms).
    - Light by default; dark from `prefers-color-scheme`, or forced with `data-theme="dark"`. Any element can carry
      `data-theme` to theme its subtree (a light till inside a dark frame), with the full colour block.
    - `npm run contrast` checks that the two dark blocks are identical and that no colour is declared outside the
      three colour blocks.
    - Font stacks end with the other script's bundled family, so Latin and Arabic glyphs never fall back to a system
      font.
    - Arabic (`html[lang="ar"]`): IBM Plex Sans Arabic for the interface, Noto Kufi Arabic for display, 106.66 % size,
      labels in weight 700 instead of letter-spacing.
    - The 106.66 % root size of docs/07 §3 scales every rem size, so in Arabic the docs/07 §5 sizes are 6.66 %
      larger (key 68 × 60 instead of 64 × 56). D12 sets minimums, so this is allowed. Exact sizes are checked in
      French.
  - `src/ui/theme.css`: Tailwind 4 `@theme inline` mapping the tokens.
    - Tailwind's default colours, radii, shadows, fonts and text sizes are removed, so only docs/07 tokens exist.
    - Utilities `label`, `amount` (DM Serif Display, tabular figures, `dir=ltr`, no wrap) and `seam`.
    - Each app's stylesheet is `@import "tailwindcss"; @import "@brandhub/kit-web/ui/theme.css";`.
  - Fonts: `npm run fonts` (`tools/scripts/fonts.mjs`) copies the woff2 subsets from `@fontsource` into
    `packages/kit-web/fonts/` and their OFL texts into `fonts/LICENSES/`, then writes `src/ui/fonts.css`.
    - Faces: DM Sans 400/500/700, DM Serif Display 400, DM Mono 400 (Latin subset); IBM Plex Sans Arabic 400/700,
      Noto Kufi Arabic 700 (Arabic subset). 8 files, 208 KB.
    - A browser downloads a face only when text needs it: a French screen loads the five Latin faces (80 KB).
  - Components (`src/ui/`, Preact `.jsx`, JSDoc props): `Button`, `Tile`, `Stepper`, `Keypad`, `PinPad`, `Sheet`,
    `Toast`, `SyncBadge`, `Input`, `Pill`, `Table`, `ApprovalDialog`, `EmptyState`, `ErrorBanner`.
    - Helpers: `Amount`, `Icon` (Lucide, stroke 1.75, flipped in right-to-left when it points), `cx`, and the pure
      `syncState()` (D15: red after 10 minutes without contact, orange when events wait, green otherwise; tested).
    - `ApprovalDialog` returns a reason key (`error`, `customer_left`, `comped`, `breakage`, `other`), stored as the
      event's `reason`.
  - i18n (`src/i18n/`): `t(key, params)` with French and Arabic CLDR plurals, `setLocale` (sets `lang` and `dir` on
    `<html>`), `dir()`, `setDigits("latn" | "arab")`, `formatAmount` (the kit's, in the user's digits), `addMessages`
    for each app's own strings.
    - Locale and digits are signals, so components update when they change.
    - `fr.json` and `ar.json` hold 128 keys; `term.*` is the glossary (fr, ar), never Darija.
    - Arabic-Indic digits use the Arabic separators: `١٬٢٥٠٫٥٠ درهم`.
    - A message missing in Arabic falls back to French with the French plural rule.
  - `npm run i18n` (in the gate) checks every `i18n/` folder of every workspace:
    - the same keys in fr and ar, no empty string, the same `{placeholders}`;
    - plural categories complete (fr one/other, ar all six), each form keeping its placeholders;
    - `term.*` equal to the glossary in every folder, and no app redefining a kit string;
    - no Darija word of the glossary in `ar.json`, whatever its article or diacritics;
    - no French left untranslated in `ar.json`;
    - every literal `t("…")` key exists.
  - Style guide (dev only): `npm run styleguide:cafe` / `styleguide:resto` opens `/styleguide` on the app's Vite dev
    server (ports 5173 and 5174).
    - Each component in the docs/06 §8 states that apply to it:
      - Button: default, pressed, disabled, loading, office size.
      - Tile: default, selected, pressed, disabled, out of stock, no price.
      - Stepper: default, minimum, disabled. Keypad: default, disabled.
      - PinPad: default, error, loading. Input: empty, filled, error, disabled, office size.
      - SyncBadge: success, pending, offline. Pill: the kitchen and stock states.
      - Table: default, loading, empty. ApprovalDialog: default, selected, error, loading.
      - Sheet, Toast, EmptyState, ErrorBanner: their one state, plus the live versions behind a button.
      - States that do not apply (a loading Toast, an offline Keypad) are not drawn.
    - Switches for French/Arabic, light/dark and Western/Arabic-Indic digits; the URL keeps `?lang&theme&digits`.
    - Demo products come from the menu templates, with the demo prices of docs/01 §6 and §7 (labelled as such).
  - `npm run contrast`: 26 text/background pairs the components use, light and dark (52 checks, all pass), plus the
    docs/07 pairs the components avoid. Exits 1 if a used pair fails or the dark blocks differ.
  - `e2e/styleguide.spec.js` (16 runs: 2 apps × fr/ar × 360/1280 × light/dark) checks:
    - `lang`, `dir` and theme;
    - the bundled fonts load;
    - tiles ≥ 96 × 96 and keys ≥ 64 × 56;
    - only `localhost` is contacted (network log `test-results/styleguide/*.network.json`).
    - the number of tiles and keys found (so the size checks cannot pass on nothing);
    - exact sizes in French (keys 64 × 56, staff buttons 56, office buttons 40);
    - the selected tile's 3 px start bar, and no horizontal page scroll at 360 px.
    It saves full-page screenshots. Kept in `docs/screenshots/02-styleguide/`: the café at 1280 px in the four
    variants and at 360 px in French and Arabic.
  - `e2e/ui-behaviour.spec.js` (5 tests, French tablet):
    - modal focus trap, Escape and focus return (ApprovalDialog, Sheet);
    - a reopened approval never keeps the previous reason;
    - the stepper keeps keyboard focus at its minimum;
    - the toast's 4 s restarts when shown again.
  - `npm run size:ui`: gzip size of the UI kit, the CSS and the fonts.
  - Lint additions:
    - `bh/jsx-uses-vars`: components used in JSX count as used.
    - No colour literal in `packages/kit-web/src` or `apps/**`. Caught: a hex string, a hex or named colour in a
      Tailwind arbitrary value, colour functions, a CSS colour declaration in a string, and a `style` colour that is
      not `var(--bh-…)`. `href="#cafe"` passes.
  - Type check: `tsconfig.test.json` lets a workspace's Node tests use Node types without giving them to its browser
    code.
  - Dependencies:
    - kit-web: `preact` 10.29 (Preact 11 was released on 30 Sep 2026, too new for the pilot), `@preact/signals` 2,
      `lucide-preact`; `@fontsource/*` as dev dependencies, since the woff2 files are copied.
    - Web apps (dev): `vite` 8, `@preact/preset-vite`, `tailwindcss` 4.3, `@tailwindcss/vite`.
- docs/02 §2 workspace line aligned with prompt 01 (`apps/cafe/*`, `apps/resto/*`, `apps/station`, `tools`).
- Repository: the pack is commit `5a6674a` in `yahyahoussini/brandhub-cafe-resto`. The build runs on
  `yahyahoussini/brandhub-cafe-resto.` (trailing dot), branch `claude/gallant-brown-cq49fc`. Both repositories are
  **public**; README §Before you start and docs/14 task 3 ask for a private one. Yahya to choose one repository and make it
  private (still open after prompt 01).

## Orientation findings (prompt 00) — not applied
Each one was found by one reader and checked by a second agent. Items 1–3 were reproduced with node. Nothing is changed until Yahya
approves; DECISIONS.md wins unless stated.

1. **Receipt numbering crashes** — `packages/kit/src/receipts.js:88,118-127`, docs/04 §10 scenario 8. After a till uses
   up its blocks, `addBlock` keeps the stale `next`; the next non-contiguous block gives `remaining()=10` and
   `takeNumber` throws `TypeError` (reads `.end` of undefined). Fix: reset `next` to `block.start` when no held block
   contains it; failing test first (prompt 03 allows it).
2. **Business day split after Ramadan** — `packages/kit/src/timezone.js:82` vs D26 (`DECISIONS.md:186-189`). On
   Mon 15 Mar 2027 00:10 and 00:30 give `2027-03-13` and 01:10 gives `2027-03-14` (subtracts 24 h of UTC instead of one
   calendar day). Also `cutoffHour` is an integer while `hours.businessDayCutoff` is HH:MM (docs/03:202). Fix: step back
   one local calendar day; accept HH:MM; add the 15 Mar 00:30 case to prompt 24's check.
3. **`dev_cloud` is not a valid writer id** — docs/03:23 vs `packages/kit/src/ids.js:94` (`isEntityId("dev_cloud","dev")`
   is false); owner-session (office) events have no writer id. Fix: export `CLOUD_DEVICE_ID`, accept it in validation,
   and define the office writer in docs/03 §4.
4. **Licence `modules` has no source** — `licence.js:33,53,133` requires it; `data/plans.json`, docs/09 §2 bodies, the
   `licence_mismatch` check (docs/09:39-40) and `admin.mjs` never set it, so prompt 11 would hide every screen. Fix:
   Yahya picks the rule (modules per plan in plans.json, or all shipped modules minus per-client holds), written in
   docs/01 §5 and docs/09.
5. **Test runner** — D44 (`DECISIONS.md:303`), CLAUDE.md:75 and prompt 01:30 say `node --test`; prompt 04:31,40 adds
   `@cloudflare/vitest-pool-workers` and expects `npm test` to run it. Fix: amend D44 to name Vitest for Worker tests and
   have prompt 04 extend the root `npm test`.
6. **VAT precedence undefined** — D40 (`DECISIONS.md:278-281`), docs/03:192-193, docs/11:40-41; templates hard-code
   `vatBp: 1000` on every product. Fix: rule `product.vatBp ?? taxes.byMode[mode] ?? taxes.defaultVatBp` in one kit
   function (prompt 03); template products get `vatBp: null`.
7. **Catalog events miss fields the data uses** — `catalog.category_set` (docs/03:109) has no `taxClass` or `course`,
   but both templates, docs/11:49-50, prompts 23 and 29 rely on them; resto.json "Ftour complet" has `setMenu: true`
   with no set menu defined. Fix: add the fields to docs/03 §5 and `taxClass` to the `sales_lines` projection.
8. **Kit errors without codes** — docs/03 §9 requires a code on every rejection; `order.js`/`bank.js` let `money.js`
   `TypeError`/`RangeError` escape uncoded (e.g. `unitCentimes: 12.5`, `vatBp: 12000`). Fix: map to `E_BAD_DATA`, tests first.
9. **Journal hash gaps** — `journal.js:3-5` `HASHED_FIELDS` omits `relayedBy`, `clockSkew`, `v`; docs/03 §6 stores
   the first two and not `v`. Fix before prompt 04 stores events: hash them and add `v` to the `events` table.
10. **Licence key lifecycle** — docs/08:42 says public keys are "shipped to devices at pull", but no response in docs/04
    carries them; docs/12 §11 yearly rotation (old kid kept 1 month) breaks 12-month prepaid licences (D7). Fix: bundle
    keys in the build (keeps D27's guarantee) and re-sign live licences during the rotation month.
11. **Admin restore endpoint has no builder** — D28/D49, docs/02 §5, docs/12 §8 define `POST /api/admin/restore`; no
    prompt builds it and no `admin.mjs` command calls it, but prompts 19 and 36 require the restore drill. Fix: add it to
    prompt 07 with a command such as `tenant:pitr` (`tenant:restore` already means un-suspend).
12. **D9 signals** — "weak visibility" (`DECISIONS.md:67-68`) is defined nowhere (docs/09:47-51, docs/10:89-92), and
    only Resto prompt 35 computes signals; Café's control report has none. Fix: define or drop the flag; compute
    the Café flags in prompt 17.
13. **Meta opt-in check timing** — D35 and docs/14 task 23 need it before prompt 22 (Dec 2026); docs/11 §11 item 11
    sits under "Before Resto V1.1"; prompt 21 also branches on it. Fix: move item 11 to "Before Café V1.1".
14. **Station for waiter cafés** — D24 (`DECISIONS.md:172-173`) requires a Station; docs/02:39 describes waiter phones
    without one. Fix: rewrite docs/02:39 as the D25 outage fallback.
15. **Settings missing from docs/03 §8** — the drawer setting (prompt 09), lock-screen timeouts (docs/06), the
    loss-signal thresholds docs/10 §4 calls settings, and the printer `charsPerLine` vs `receipt.width` overlap.
    Fix: add the paths and defaults in prompt 03.

Smaller verified items for later: D11 Arabic-Indic digits not in docs/07 or settings; D20 calls heartbeats marks while
docs/03 says they are not events; docs/03 says the kit implements §2–§6 (only §7 is provided); docs/04 §9 cites docs/03
§4 instead of §7; `dev:*` scripts and `npm run rebuild` created by no prompt; docs/02 §2 workspace globs vs prompt 01;
long press on a till tile has two meanings (docs/06 §2.2 and §2.7); docs/07 colour tokens incomplete and some fail contrast;
sync-badge wording (D15 vs glossary); D7 "unlimited" vs `99` in plans.json; no module key for Café's PIN clock (D32);
`deadletter.resolved` shape differs (docs/03 vs docs/04); Z tender list omits `other`; Station keys differ (docs/05 §1,
`printing.routes`, templates); evening-report template has no dead-letter variable; docs/13 lists seven Gate 2 targets
under D48, which sets three; docs/02 cites a shutdown order docs/13 lacks; training times differ (digest vs docs/13);
docs/14 has no task for several docs/11 §11 items (2, 3, 4, 6, 12, 13).

## Open items
**Build (prompt 01)**
- The GitHub repository is still public (task 3 asks for private); Yahya changes it in GitHub settings.
- `dev:cafe`, `dev:resto`, `dev:station` (CLAUDE.md "Commands") need Wrangler, Vite and Electron. Prompts 04, 02/11
  and 08 add them with those tools.
- The kit tests are not type-checked (see Tooling). Adding `// @ts-check` and fixing them is a kit change; do it only
  with Yahya's agreement (prompt 03 is the natural place).

**Design system (prompt 02)**: Yahya decides; the design system file is docs/07.
- docs/07 has no dark value for `--bh-brand-ink`, `--bh-mid`, `--bh-ok-soft`, `--bh-warn-soft`, `--bh-danger-soft`.
  Until it does, dark mode points them at existing tokens: `--bh-brand`, `--bh-text-3` (so a disabled border is quieter
  than the light grey) and `--bh-surface-2`. `--bh-accent` keeps its light value.
  - As a result, a pressed primary button in dark mode shows only the 1 px press, not a darker colour.
  - Light values would have put black text on navy and pastel behind light text.
- docs/07 colour pairs that fail as body text (D16 says "contrast-checked"): grey hints on panels (`--bh-text-3` on
  `--bh-surface`, 4.13:1); success and warning colours as text on their soft fills (3.82, 3.50) and on white (4.38,
  3.99). The components avoid them: state text is written in `--bh-text`, and the state colour goes on the icon,
  border or bar. Darker `--bh-ok`/`--bh-warn` values would let state text be coloured.
- docs/07 §2 says "dark brand 5.4:1": no token pair gives 5.4. Dark brand is 6.12:1 on the page, 5.69 on panels and
  5.15 on cards.
- The BrandHUB two-shape mark (docs/07 §1, `viewBox 0 0 44 44`) is not in the pack. The style guide shows only the
  wordmark; the favicon and app icons need the SVG.
- docs/07 §6 "cleaning = muted" has no token. Prompt 28 needs one.
- docs/07 §3 asks for tabular figures on amounts, but the bundled DM Serif Display and DM Sans have no `tnum`
  feature. At 40 px, "1111" is 56 px wide and "0000" is 80 px, with or without the setting; only DM Mono is tabular.
  Amount columns are right-aligned, so totals still line up on their last digit. Options:
  - keep DM Serif Display as it is;
  - set table figures in DM Mono;
  - look for a DM Serif Display build that has `tnum` (not checked yet).
- Arabic strings outside `term.*` in `packages/kit-web/src/i18n/ar.json` were written in Modern Standard Arabic for
  the interface and need a native reader's review. The `term.*` entries come from the glossary.
- No settings field holds the per-user digits option (D11). `setDigits` exists; prompt 05 (staff) should store it
  with the user.

To confirm (from docs/11 §11, data flags and Darija drafts). Who confirms → needed by.

**Accountant (client's)**
- §11.1 takeaway/delivery VAT; `tax-presets.json` `vat.takeawayBp`, `vat.deliveryBp` (`toConfirm`) → prompt 11, 37 (tasks 7, 21).
- On-site 10 % and standard 20 % VAT (`secondary_sources`; onboarding checkbox) → prompt 11 (task 7).
- §11.2 minimum mentions on consumer tickets → prompt 09/11 (no docs/14 task; add to task 7).
- §11.3 buyer's ICE on B2B invoices → prompt 23 (no docs/14 task).
- §11.4 retention 10 years (D43, D49) → prompt 04 (no docs/14 task).
- §11.6 débit-de-boissons liability per restaurant; commune rate outside Casablanca/Salé → prompt 23, 35.
- §11.10 VAT on deposits and delivery fee → prompt 37, 39 (task 21).
- PCGE account codes of the Sage export → prompt 17.

**Lawyer**
- §11.5 CNDP transfer formality, DPA, privacy, CGU (FR/AR) → prompt 20, 1 Feb 2027, prompt 36 (tasks 10, 14, 27).
- §11.8 oral phone consent text; §11.9 online order page (Law 31-08) → prompt 37, 38 (task 20).
- §11.12 digital receipt replacing paper (Law 31-08 art. 4) → prompt 23 (no docs/14 task).
- §11.13 client's CNDP formality for video with ticket text → prompt 42 (no docs/14 task).

**Yahya**
- §11.11 Meta opt-in for messages to clients' customers → before prompt 22 (task 23).
- §11.7 e-invoicing phase per client; UBL mapping when DGI publishes → prompt 46 (task 26).
- Darija drafts: evening report `data/evening-report.json:54` → prompt 18 (task 9); 40 glossary terms
  `data/glossary.json` (`draft_review_by_yahya`) → prompt 18, 20, 22 (no task); quick-card Darija lines → prompt 20
  (no draft exists in the pack); `rappel_kredi` Darija → prompt 22 (not drafted).
- Plan prices (`plans.json`, `to_test`), free entry app, loss-review price → Gate 2, 15 Jan 2027 (task 16).
- WhatsApp utility price in Morocco ($0.0230 is a reseller figure) → prompt 18.
- Legal entity that invoices (SARL AU vs auto-entrepreneur) → 1 Feb 2027 (task 13); OMPIC check → launch (task 15).
- MOWAKABA eligibility; Payzone/Fatourati/Chari fees → no prompt (sales only / only if D8 changes).
- Code-signing certificate price → optional (task 19).

**Hardware test (prompt 09, task 6)**
- Printer profiles `verified: false`: `epson_tm_t20iii`, `xprinter_xp_v330n` (code page), `generic_58_bt`,
  `sunmi_inner`; reference kits and their prices.

**Others**
- R2 free tier "10 GB" → Claude Code checks in prompt 04 (docs/02:99).
- Hikvision/Dahua POS protocol fields → prompt 42 (task 24); Glovo API version → prompt 43 (task 18).
- Suggested dose quantities (`cafe.json`, 15 entries) → the café owner; recipe quantities (`resto.json`, 7) → the
  Resto chef (task 17).

**Inputs**
- Gate 1 not run: no demand evidence before the build. Pilot 1 not chosen: blocks prompt 09 hardware by 12 Oct and
  prompt 11 by 26 Oct.

## Decisions changed during the build
_None yet. Any change is made in DECISIONS.md first._
