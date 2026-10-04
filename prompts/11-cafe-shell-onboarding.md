# Prompt 11 — Café app shell and onboarding

> Run after prompt 10. Needs from Yahya: pilot 1's menu with prices, legal identity and the accountant's VAT answer
> (docs/14 task 7). Without them, finish with the demo account and list the pilot's missing fields in STATUS.

## Goal
`cafe.brandhub.ma` opens offline on a paired device, routes each role to its screen, and a new café is ready to sell
after one guided onboarding.

## Read first
`docs/06-ux-flows.md §1, §5, §6` · `docs/01-products.md §1–§6` · `docs/03-domain-model.md §8` · `data/menu-templates/cafe.json`,
`data/tax-presets.json`, `data/modules.json` · `DECISIONS.md` D5, D11, D14, D18, D40, D41.

## Do
1. `apps/cafe/web`: Vite + Preact app with routes `/caisse`, `/serveur`, `/ecran`, `/gestion/*`, `/connexion`, `/activer`,
   `/appairer`; a device-kind router (a till opens `/caisse`, a phone `/serveur`, a screen `/ecran`; the office session
   `/gestion`); the lock screen; the top bar of docs/06 §1; `vite-plugin-pwa` caching the shell, fonts and icons (never
   `/api/*`); boots offline after the first load.
2. Modules: screens and menu entries appear only for modules present in the licence (`hasModule`).
3. Onboarding wizard (docs/06 §6 step 2) writing `settings.set` and catalog events: identity and legal fields; taxes (VAT
   10 % default with the "confirmé par votre comptable" checkbox, takeaway/delivery questions left open, débit-de-boissons
   commune and rate from `data/tax-presets.json`); service mode and zones; menu from the template with an empty price per
   product (a product without price cannot be sold and is listed); staff with roles; device pairing; evening report opt-in
   (owner's WhatsApp number, explicit consent text stored with its version); a training sale in TEST mode.
4. "À compléter" card on the dashboard listing every missing required field; the till sells anyway (D14 spirit).
5. Demo account: `npm run seed:demo -- --product cafe` creates "Café Démo" with the demo prices and staff of docs/01 §6
   (Sara, Ali, Karim) on staging, resettable.

## Constraints
No invented prices or legal numbers in the pilot tenant: only what Yahya provides. Every string in French and Arabic.

## Acceptance checks (run them, paste the output)
1. Playwright: onboarding from activation to "Votre café est prêt", in French and in Arabic, at 360 px and 1280 px.
2. The app loads offline after one visit (reload with the network off) and shows the red badge after 10 minutes (fake clock).
3. `npm run gate`; screenshots of each wizard step in both languages.

## Update docs/STATUS.md
Row 11; pilot tenant fields still missing.

## Commit
`feat(cafe): app shell, offline boot, onboarding wizard and demo account`
