# Prompt 15 — Dose counter

> Run after prompt 14.

## Goal
The machine's shot counter, typed or photographed at opening and closing, is compared with the coffees sold, and the gap
appears in doses and in DH on the Z, the dashboard and the evening report.

## Read first
`docs/research/innovation-map-2026-09.md` (feature 3) · `docs/10-reports-analytics.md §1, §4` ·
`DECISIONS.md` D5, D13 · `packages/kit/src/bank.js` (`doseVariance`, `doseAlert`).

## Do
1. `/gestion/machines`: coffee machines (name; counter counts shots or cups); product doses (1 for a single, 2 for a
   double) editable in the menu.
2. Readings: at the first opening and last closing of the day (and optional checks), the till asks for the counter
   reading, with an optional photo (R2, compressed on the device to ≤ 300 KB); `machine.off_till` for declared doses (tests,
   staff coffee, offered, purge) with a reason.
3. Variance per period with `doseVariance`; a counter reset is shown as such, never guessed; money value at the day's
   average dose price; alert with `doseAlert` and the thresholds of settings.
4. On the Z, the dashboard and in the evening report data (prompt 18 sends it).

## Constraints
The screen shows the gap as a number with its period and the person on duty; never an accusation (D13).

## Acceptance checks (run them, paste the output)
1. Acceptance day readings 18 400 → 18 408 with 1 declared dose: gap 2 doses (≈ 20,80 DH) on the Z and the dashboard.
2. Two consecutive periods above the threshold raise the alert; a counter reset shows "compteur remis à zéro".
3. `npm run gate`.

## Update docs/STATUS.md
Row 15.

## Commit
`feat(cafe): dose counter readings, variance and alerts`
