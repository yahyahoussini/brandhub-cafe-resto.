# Prompt 19 — Café hardening before the pilot

> Run after prompt 18, from Mon 23 Nov 2026. Features are frozen since Fri 20 Nov (D4): only fixes from here to the pilot.

## Goal
Everything the pilot relies on has been attacked on purpose and survived: money, offline, security, speed, restore.

## Read first
`docs/08-security.md §9` · `docs/04-sync-protocol.md §10` · `docs/05-devices.md §8` · `docs/12-deploy-runbook.md §8` ·
`docs/01-products.md §6` · `DECISIONS.md` D12, D14, D15, D49, D50.

## Do
1. The full café acceptance day as one Playwright test through a Station, in French and in Arabic, on the demo account:
   every number of docs/01 §6 checked on screen, in the Z, in `/gestion` and in the evening-report variables.
2. The nine adversarial scenarios of docs/04 §10 automated (those not done in prompts 06 and 08) and run together.
3. Security P0 list of docs/08 §9, item by item, with the evidence.
4. Performance on the reference tablet: first load of `/caisse`, tap-to-screen, "Espèces" to print; the Station's relay
   time; compare with D12 and D50.
5. Restore drill: restore the demo tenant to one hour earlier with point-in-time recovery; check the totals; time it.
6. Error reporting: force an error on the till and in the Worker; check that the report holds no personal data.
7. Fix every failure found (each fix with a failing test first). Anything that cannot be fixed before 27 Nov goes to
   STATUS with a workaround for the pilot.

## Constraints
No new feature. No change to the event format (a pilot's data must stay readable by later versions).

## Acceptance checks (run them, paste the output)
1. The acceptance day test output (FR and AR) and the nine scenarios.
2. The P0 table with evidence, the performance numbers and the restore drill time.
3. `npm run gate`.

## Update docs/STATUS.md
Row 19; fixes made; known issues with workarounds.

## Commit
`fix(cafe): hardening before pilot 1`
