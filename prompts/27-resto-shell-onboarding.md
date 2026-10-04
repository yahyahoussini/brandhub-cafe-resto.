# Prompt 27 — Resto app shell, onboarding, menus and QR menu

> Run from Mon 25 Jan 2027, once prompt 26 is done (`cafe-v1.1.0` goes out in the window of Tue 26 Jan). Needs from
> Yahya: the Resto pilot's menu and recipes (docs/14 task 17).

## Goal
`resto.brandhub.ma` has its own app on the same kit, a restaurant is set up with its stations, printers, Station and
menus, and customers can read the menu from a QR code.

## Read first
`docs/01-products.md §1–§5, §7` · `docs/06-ux-flows.md §7` · `docs/05-devices.md §1–§4` · `data/menu-templates/resto.json` ·
`DECISIONS.md` D1, D3, D6, D24 · `apps/cafe/web` (for patterns only: do not import from it).

## Do
1. `apps/resto/web` with the routes of D18, built on `@brandhub/kit-web`; the device-kind router, lock screen, top bar and
   offline boot from the kit (move anything the Café app still holds privately into the kit first, in a separate commit).
2. Onboarding (restaurant version): identity and legal fields, taxes, zones and rooms, **stations** (froid, chaud, grill,
   pâtisserie, bar — editable) and their printers and screens, the **Station pairing required** before the first shift,
   menu from `resto.json` with empty prices, set menus (steps with choices), menus by time of day (déjeuner, dîner, ftour),
   staff with roles, evening report opt-in.
3. Catalog additions: `catalog.set_menu_set`, menu periods, products sold by weight (`qtyMilli` per kg) with price per kg.
4. View-only QR menu `/menu/:slug` (noindex): current period's menu, TTC prices (Law 31-08), French and Arabic, photos from
   R2, no ordering yet; a printable QR sheet per table.
5. Demo account "Restaurant Démo" with the demo prices of docs/01 §7.

## Constraints
Resto never imports `apps/cafe`. A shift cannot open without a paired, reachable Station (the licence module `station`).

## Acceptance checks (run them, paste the output)
1. Playwright: restaurant onboarding in French and Arabic, ending with the Station paired and the stations routed.
2. `/menu/:slug` shows TTC prices, both languages, and `X-Robots-Tag: noindex`.
3. `npm run gate`.

## Update docs/STATUS.md
Row 27; anything moved into the kit.

## Commit
`feat(resto): app shell, restaurant onboarding, set menus, menu periods and QR menu`
