# Prompt 34 — Staff, time clock and tips (Resto)

> Run after prompt 33.

## Goal
The restaurant manages roles and permissions within safe floors, staff clock in with a PIN or a badge (never a
fingerprint), and the tip pool runs for the whole team.

## Read first
`docs/05-devices.md §7` · `docs/08-security.md §2, §4` · `data/permissions.json` · `docs/11-compliance.md §7` ·
`DECISIONS.md` D32, D38 · prompt 21 (Borsat) and prompt 23 (hours sheet).

## Do
1. `/gestion/equipe` (Resto): roles, the `canApprove` flag, permission overrides with the floors enforced and explained.
2. PIN clock (reuse prompt 23) on tills and phones.
3. ZKTeco receiver in the Station on port 8081: the ADMS endpoints (`/iclock/cdata` handshake and ATTLOG upload,
   `/iclock/getrequest`, `/iclock/devicecmd`); map the clock's user PIN to `staff.clockId`; write `staff.clock` events with
   `source: badge`; ignore and never store fingerprint or face templates; refuse punches whose verify mode is
   fingerprint or face and count them ("mode biométrique refusé", shown to the manager); a setup guide that switches the
   clock to badge or PIN verification.
4. Borsat enabled for Resto (module `borsat`), with role weights suited to kitchen and floor staff (settings).
5. The hours sheet for the accountant (prompt 23) now includes badge punches.

## Constraints
Biometric data never enters any store (tests assert that ATTLOG fields beyond PIN/time/status/verify/workcode are dropped,
and that a punch with a biometric verify mode writes no `staff.clock`).

## Acceptance checks (run them, paste the output)
1. An ADMS simulator (a test that posts a handshake and ATTLOG lines to the Station) produces the expected `staff.clock`
   events; a payload with a fingerprint template is stored without it.
2. A manager cannot lower an approval floor (UI and server refuse).
3. `npm run gate`.

## Update docs/STATUS.md
Row 34; the clock models tested, if any.

## Commit
`feat(resto): roles with floors, PIN and badge clock via the Station, tip pool`
