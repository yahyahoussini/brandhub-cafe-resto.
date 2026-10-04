# CLAUDE.md — rules for every prompt

You are building two products for BrandHub (Casablanca), owned by Yahya Houssini, who runs every prompt himself:

- **BrandHub Café** — `cafe.brandhub.ma` — till, waiter phones and the owner's evening report for Moroccan cafés.
- **BrandHub Resto** — `resto.brandhub.ma` — dining room, kitchen screens and food cost for restaurants.

They share a private kit. Read `DECISIONS.md` before any prompt; it wins over any other document. If two documents
disagree, stop and say which, before writing code.

## Language and style of code
- **JavaScript only** (D17). ES modules, `// @ts-check` at the top of every source file, JSDoc types, checked by
  `npm run typecheck` (`tsc --checkJs --noEmit`, strict). Never create `.ts`/`.tsx` files or TypeScript syntax.
- Preact + `@preact/signals` + Vite for apps (JSX in `.jsx` files); Tailwind 4 with **logical properties only**
  (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`, `text-start`); the lint forbids `ml-`, `mr-`, `pl-`, `pr-`, `left-`,
  `right-`, `text-left`, `text-right`.
- Pure logic lives in `packages/kit` and has unit tests. UI code never computes money itself: it calls the kit.
- No new dependency without a one-line reason in the commit message and its gzip weight on the till route.

## Repository
```
packages/kit/          pure rules: money, ids, order, bank, receipts, escpos, timezone, crypto, licence, journal (provided, tested)
packages/kit-web/      browser side: Dexie store, sync client, printing transports, i18n runtime, UI components
packages/kit-worker/   Cloudflare side: TenantStore base (Durable Object), sync endpoints, auth, control API, cron helpers
apps/cafe/             BrandHub Café: worker/ (Worker + CafeStore) and web/ (PWA)
apps/resto/            BrandHub Resto: worker/ (Worker + RestoStore) and web/ (PWA)
apps/station/          BrandHub Station (Electron, with its embedded Node)
tools/                 admin.mjs (signed control API calls), hardware-test/, scripts
data/                  menu templates, permissions, plans, modules, printer profiles, tax presets, glossary
docs/                  specifications (read the ones each prompt lists); docs/STATUS.md is the build log
prompts/               the build, one prompt at a time
```
- `apps/cafe` and `apps/resto` never import each other (lint rule `no-restricted-imports`). Shared code goes to a package.
- Apps import packages by name (`@brandhub/kit/money`), never by relative paths across folders.

## Rules that protect money and data
1. Amounts are integer centimes; prices are TTC; VAT per line (D21). Never use floats for money.
2. Every change is an event created on the device (D20). Never update or delete a stored event; correct with a new one.
3. Money aggregates have one writer; check ownership before writing; approvals (manager PIN) are recorded in the event.
4. A receipt number is taken only when an order closes (D22).
5. The till never stops during an open shift (D14). Status changes apply at the next shift opening.
6. Times: `Africa/Casablanca` through `packages/kit/src/timezone.js`; never a fixed +1 offset (D26).
7. Each client's data stays in its own Durable Object; no query crosses clients. The control API report returns counts only.
8. Secrets never enter the repository: `.dev.vars` locally, `wrangler secret put` in production, the admin private
   keys in `~/.brandhub/keys/` on Yahya's computer. Never print a secret, a token or a password hash in logs or output.
9. Personal data (customer phone numbers, staff names in messages) is minimal, encrypted where stated in `docs/08-security.md`,
   and never sent to logs, analytics or error reports.

## Rules for screens
- Every visible string exists in French and Arabic in the same commit (`i18n` check fails otherwise). Arabic screens are
  right to left; test each screen in both.
- Touch targets ≥ 48 px on `/caisse`, `/serveur` and `/ecran`; product tiles ≥ 96 × 96 px (D12).
- Loss signals are numbers, never accusations (D13): "Écart : −35 DH", never "vol".
- The sync badge is visible on every staff screen (D15).
- No placeholder text, no lorem ipsum, no invented prices, testimonials or client names on any screen or document.

## Facts
- Prices, legal mentions, tax rates and claims come from `DECISIONS.md`, `data/*.json` or `docs/11-compliance.md`.
  If a fact is missing or marked "to confirm", do not invent it: leave the setting empty, show it as required in the
  onboarding, and list it in `docs/STATUS.md → Open items`.
- Never write "certifié", "agréé DGI", "conforme DGI" or any certification claim (D39).

## Each prompt
1. Read the files the prompt lists. Say in two lines what you will do.
2. Build in small steps; run the tests as you go.
3. Run every acceptance check of the prompt and paste the output (commands and results, not a summary).
4. Update `docs/STATUS.md`: the prompt's row, what changed, what is left, open items. Anything the prompt adds to the
   specification — a route (docs/02 §5), an event type or field (docs/03 §5), a setting (docs/03 §8), an error code
   (docs/03 §9), a permission (`data/permissions.json`) — is written there in the same commit.
5. Commit with the message the prompt gives (plus a second line for any new dependency).

## Commands (created by prompt 01; keep them working)
| Command | What it does |
|---|---|
| `npm test` | unit tests of every package and app (`node --test`) |
| `npm run typecheck` | JSDoc type check, strict |
| `npm run lint` | ESLint (logical CSS, no cross-app imports, no floats on money names) |
| `npm run i18n` | every key exists in `fr` and `ar` |
| `npm run e2e` | Playwright end-to-end tests (French and Arabic) |
| `npm run dev:cafe` / `dev:resto` | Wrangler dev with the app |
| `npm run dev:station` | the Station in development mode |
| `npm run gate` | typecheck + lint + i18n + test + budgets; must pass before any commit that says "done" |

## Definition of done for a prompt
`npm run gate` passes, the prompt's acceptance checks are pasted, `docs/STATUS.md` is updated, and the commit is made.
If a check cannot run (missing hardware, missing account), say so in STATUS with what is needed, and do not mark it passed.
