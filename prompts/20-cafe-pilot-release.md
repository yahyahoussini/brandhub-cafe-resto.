# Prompt 20 — Café pilot release

> Run after prompt 19, by Fri 27 Nov 2026. Needs from Yahya: CGU, DPA and privacy texts reviewed by a lawyer; the support
> WhatsApp number; the pilot agreement (docs/14 tasks 10–12).

## Goal
`cafe.brandhub.ma` is live in production, the pilot tenant exists with its menu and staff, and everything needed for the
installation visit of Mon 30 Nov is ready.

## Read first
`docs/12-deploy-runbook.md §2–§5, §8–§10` · `docs/13-pilot-playbook.md` · `docs/09-control-api.md §6` · `DECISIONS.md` D45–D47.

## Do
1. Production: create the production D1, R2 and secrets for `brandhub-cafe`; take over `cafe.brandhub.ma` from the
   brandhub.ma coming-soon Worker (runbook §5, steps 1–3); deploy with the tag `cafe-v1.0.0` (no client uses the product
   yet, so D46's window does not apply to this first release); set `LIVE_CAFE=true` on the pilot's first day.
2. Legal pages in the app (`/legal/cgu`, `/legal/dpa`, `/legal/confidentialite`) in French and Arabic from Yahya's
   reviewed texts; their versions recorded at activation.
3. Help: the quick card "Problème ? / مشكل ؟" (French and Arabic, the Darija lines Yahya reviewed) printable from
   `/gestion`, and "Contacter le support" (WhatsApp link with the venue name prefilled) on the lock screen.
4. Pilot tenant: `tools/admin.mjs tenant:create` then `tenant:subscription` with the `pilot_cafe` plan (valid 3 months);
   activation link sent by Yahya; the menu, legal fields, staff and devices prepared with Yahya (docs/13 §2).
5. Installer: tag `station-v1.0.0`; the Station installer on R2 with its hash; a printed install checklist from docs/13 §3.
6. Keep the demo account on staging for demos, resettable.

## Constraints
Later releases only inside the window (D46). The pilot's data is real: no test orders outside TEST mode.

## Acceptance checks (run them, paste the output)
1. `curl -sI https://cafe.brandhub.ma/api/health` (200, `X-Robots-Tag: noindex`) and `/caisse` loading on the tablet.
2. `node tools/admin.mjs report --product cafe` showing the pilot tenant (counts only).
3. `git tag` shows `cafe-v1.0.0` and `station-v1.0.0`; `npm run gate` on the tagged commit.

## Update docs/STATUS.md
Row 20; production URLs; pilot tenant id; the visit plan.

## Commit
`release(cafe): v1.0.0 for pilot 1`
