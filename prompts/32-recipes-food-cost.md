# Prompt 32 — Recipes and food cost

> Run after prompt 31.

## Goal
Every dish has a recipe, every sale deducts its ingredients, and the owner sees the food cost of each dish and the gap
between what should have been used and what was used.

## Read first
`packages/kit/src/stock.js` · `docs/03-domain-model.md §5` (`catalog.recipe_set`) · `docs/10-reports-analytics.md §1` (food
cost) · `data/menu-templates/resto.json` (suggested recipes) · `docs/01-products.md §7` (step 5).

## Do
1. Recipe editor in `/gestion/recettes`: ingredients (stock items) with quantities in the item's unit, sub-recipes (a sauce
   or a dough used by several dishes, with its yield), waste factor, versions with `effectiveFrom`.
2. Deduction at closing with the version in force (kit), including set-menu choices and options that change ingredients
   (for example "sans olives").
3. Cost: each ingredient's latest cost (from goods receipts, prompt 33, or typed), the dish's cost, food cost % against its
   HT price; a dish list sorted by food cost %.
4. Expected vs actual: expected usage from sales, actual from counts (prompt 33), the gap per ingredient in quantity and DH.

## Constraints
Suggested template quantities stay marked "exemple" until the chef changes them. A recipe change never alters past sales
(versioning).

## Acceptance checks (run them, paste the output)
1. Unit tests: 2 tajines deduct 500 g of chicken and 1 preserved lemon (docs/01 §7 step 5); a recipe version changed at
   15:00 applies only to orders closed after 15:00.
2. Food cost % of the four mains of the acceptance service with typed ingredient costs.
3. `npm run gate`.

## Update docs/STATUS.md
Row 32.

## Commit
`feat(resto): recipes with versions, stock deduction and food cost`
