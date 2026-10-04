# Prompt 36 — Resto hardening and pilot release

> Run after prompt 35, by Fri 2 Apr 2027 for the pilot on Mon 12 Apr. Needs from Yahya: the Resto pilot agreement and
> the legal texts (Resto versions if they differ) (docs/14 task 27).

## Goal
The restaurant acceptance service survives an internet cut end to end, `resto.brandhub.ma` is live, and the Resto pilot is
ready for its installation visit.

## Read first
`docs/01-products.md §7` · `docs/04-sync-protocol.md §10` · `docs/08-security.md §9` · `docs/12-deploy-runbook.md §5` ·
`docs/13-pilot-playbook.md` · prompts 19 and 20 (same steps for Café).

## Do
1. The full restaurant acceptance service as one Playwright test through a Station, the internet cut halfway (docs/01
   §7 steps 1–6), in French and Arabic: kitchen latency, bill, split, stock deductions, and the cloud totals equal to the
   Station's after reconnection.
2. The adversarial scenarios with the Resto app (at least 1, 3, 5, 8), the P0 security list, performance on the reference
   devices, a restore drill.
3. Fixes with failing tests first; no new feature.
4. Production: resources and secrets for `brandhub-resto`, take over `resto.brandhub.ma` from the coming-soon Worker
   (runbook §5), tag `resto-v1.0.0` (the first Resto release: D46's window applies from the pilot's first day, when
   `LIVE_RESTO` is set to `true`).
5. Pilot tenant with the `pilot_resto` plan, menu, recipes, stations, printers and staff prepared with Yahya (docs/13 §2).

## Constraints
Same release rules as Café (D46). The Café product is not touched by this release.

## Acceptance checks (run them, paste the output)
1. The acceptance service test output and the scenario results.
2. `curl -sI https://resto.brandhub.ma/api/health` (200, noindex); `node tools/admin.mjs report --product resto`.
3. `git tag` shows `resto-v1.0.0`; `npm run gate` on the tagged commit.

## Update docs/STATUS.md
Row 36; production URLs; Resto pilot tenant; known issues.

## Commit
`release(resto): v1.0.0 for the Resto pilot`
