# Prompt 29 — Handheld ordering: seats, courses, send and continue

> Run after prompt 28.

## Goal
A waiter takes a table's order on his phone seat by seat, sends the starters while he is still entering the mains, and
fires the next course when the table is ready.

## Read first
`docs/06-ux-flows.md §7` · `packages/kit/src/order.js` (`seat`, `course`, `lines.sent` with `hold`, `lines.fired`) and its
course test · `docs/01-products.md §7` (steps 1–3) · `docs/05-devices.md §4` (kitchen tickets).

## Do
1. `/serveur` (Resto): table → seats bar (1…n, "table") → categories and search → tap to add to the selected seat; options
   and set-menu steps; notes and allergy tags printed in capitals on the ticket.
2. Courses: each line takes its category's course by default; "Envoyer et continuer" sends the current course's lines
   and keeps the order open; later courses can be sent "à suivre" (`hold: true`); "Lancer la suite" fires them.
3. The Station prints and shows each sent course at its station (prompt 30 builds the screens); the phone shows per line:
   envoyé, à suivre, prêt.
4. Offline with the Station: everything works. Without the Station, sending goes through the cloud when it answers
   (screens receive from the cloud, slower than the 2 s target); with neither, the phone keeps the order, says why, and
   sends as soon as one answers.
5. Speed: adding a dish in ≤ 2 taps once the seat is chosen; the handheld route within the 150 KB budget.

## Constraints
Only the kit changes line states. A held line can be voided without approval; a fired one needs approval (kit rule).

## Acceptance checks (run them, paste the output)
1. Playwright through the Station: docs/01 §7 steps 1–3 (harira seat 1, salade seat 2 sent first; mains entered then sent
   after the internet cut; théière).
2. Kitchen tickets printed per station with seats and courses (byte snapshot or a printer simulator log).
3. `npm run gate` and phone screenshots in French and Arabic.

## Update docs/STATUS.md
Row 29.

## Commit
`feat(resto): handheld ordering with seats, courses, send-and-continue and fire`
