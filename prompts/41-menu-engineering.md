# Prompt 41 — Menu engineering (Resto) and table yield (Café)

> Run after prompt 40. `menu_engineering` completes Resto V1.1: tag `resto-v1.1.0` in the release window after this
> prompt, before Gate 3 (30 Jun 2027). `table_yield` ships in the Café app behind its module key with Café V2 (D5).

## Goal
The restaurant owner sees which dishes earn and sell, which earn but hide, which sell but earn little, and which to
drop; the café owner sees what each seat earns per hour, by zone and hour, so the terrace at 16:00 stops being a guess.

## Read first
`docs/10-reports-analytics.md §1` (food cost, covers) · prompt 32 (recipe costs) · prompt 25 (cup cost) · prompt 35
(Resto reports) · `docs/research/innovation-map-2026-09.md` (feature 10) · `DECISIONS.md` D9, D13, D21.

## Do
1. Kit, `packages/kit/src/menu-engineering.js` (pure, tested): for a period, a category and a service (déjeuner, dîner,
   ftour): for each dish, quantity sold, menu mix %, net price HT (from TTC with the line's VAT, as in the sales lines),
   recipe cost, contribution margin = HT − cost; thresholds: popularity high when the mix ≥ 70 % of the fair share
   (0,7 ÷ number of dishes in the category), margin high when ≥ the category's average margin weighted by quantities.
   Classes: star (both high), plowhorse (popular, low margin), puzzle (high margin, not popular), dog (neither).
2. Set menus: the set price is spread over its components in proportion to their à-la-carte prices (`allocate`, largest
   remainder) before the analysis, so each component counts once with its share.
3. Dishes without a complete recipe cost are left out and listed as "coût manquant" (never a guessed cost).
4. `/gestion → Carte → Rentabilité`: the four quadrants as a scatter (menu mix × margin) and a table (dish, sold, mix %,
   price HT, cost, margin, food cost %, class), filters by period, category and service; one line of standard guidance per
   class (star: keep and highlight; plowhorse: review portion or price; puzzle: better placement or description; dog:
   replace or remove). A price simulator recomputes the margin and class of one dish at a new TTC price with the same mix.
5. Table yield (Café, `table_yield`): revenue per available seat-hour = revenue ÷ (seats × open hours) per zone and hour,
   from `table.set` seats and the opening hours; average time at table from the first line to the payment; occupied
   seat-hours when covers are known. A zone × hour heat map and the count of long stays (> 2 h) with a low spend
   (setting, default 20,00 DH), as numbers only (D13).
6. Both reports are exported as CSV (docs/10 §5) and mentioned in the evening report only by a link, never as advice.

## Constraints
All money through the kit (centimes, HT from TTC per line). The analysis never changes prices by itself. TEST orders and
credit notes are handled as in docs/10 §1.

## Acceptance checks (run them, paste the output)
1. Unit test on this category (test values; the tajine and brochettes prices are the demo prices of docs/01 §7; 10 %
   VAT; costs typed): tajine poulet citron 75,00 TTC, cost 22,00, 120
   sold · brochettes kefta 70,00, cost 28,00, 150 sold · couscous 80,00, cost 24,00, 30 sold · pastilla au poulet 90,00,
   cost 50,00, 20 sold. Expected: HT 68,18 · 63,64 · 72,73 · 81,82; margins 46,18 · 35,64 · 48,73 · 31,82; mix 37,5 % ·
   46,9 % · 9,4 % · 6,3 %; thresholds 17,5 % and 40,58 (weighted average); classes star · plowhorse · puzzle · dog.
2. Set-menu spread: a 120,00 formula of a 25,00 salad, a 75,00 tajine and a 25,00 théière gives 24,00 + 72,00 + 24,00.
3. Table yield: terrasse 40 seats open 15:00–18:00 with 384,00 of revenue → 3,20 DH per seat-hour; salle 24 seats, same
   hours, 561,60 → 7,80.
4. `npm run gate`; screenshots of both reports in French and Arabic; `git tag` shows `resto-v1.1.0` after the release.

## Update docs/STATUS.md
Row 41; Resto V1.1 complete; tag and date.

## Commit
`feat(kit): menu engineering by margin and popularity (Resto), table yield per seat-hour (Café)`
