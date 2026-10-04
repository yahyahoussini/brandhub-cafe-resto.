# Prompt 24 — Mode Ramadan

> Run after prompt 23. Must ship before Mon 1 Feb 2027 (Ramadan 1448 starts about 8 Feb; no Café release 8 Feb–9 Mar).

## Goal
During Ramadan the café switches to its Ramadan hours, menus and services in one tap, and the reports speak of ftour and
s'hour instead of mornings and afternoons.

## Read first
`docs/research/innovation-map-2026-09.md` (feature 6) · `packages/kit/src/timezone.js` and tests · `DECISIONS.md` D26, D46.

## Do
1. Hours templates: normal and Ramadan (for example closed in the afternoon, open from ftour to late), switchable by date
   range; the business-day cut-off adjusted for late nights.
2. Ftour menus: categories or set menus visible only in the Ramadan period (catalog visibility by period); quick tiles for
   the ftour rush.
3. Services as a report dimension (`service: ftour | shour | day`), in the Z, `/gestion` and the evening report.
4. Hijri date shown next to the Gregorian date where useful (`Intl.DateTimeFormat` with the `islamic-umalqura` calendar),
   never used for computation.
5. Time: Morocco is on UTC+0 during Ramadan (7 Feb–14 Mar 2027 in the time-zone data); every schedule and business day
   must stay right; tests pin dates on both sides of the switch.

## Constraints
No release to Café production between 8 Feb and 9 Mar 2027 (D46): this prompt ships in `cafe-v1.1.0`, released before
1 Feb 2027.

## Acceptance checks (run them, paste the output)
1. Tests with fixed clocks on 6, 7, 20 Feb and 14 Mar 2027: business days, report times and service labels correct.
2. E2E: switch to Ramadan mode, sell an ftour, see it under "ftour" in the Z.
3. `npm run gate`.

## Update docs/STATUS.md
Row 24; the tag and date shipped.

## Commit
`feat(cafe): Mode Ramadan hours, ftour menus and services`
