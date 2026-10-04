# Prompt 30 — Kitchen screens and routing

> Run after prompt 29.

## Goal
Every station sees its tickets within 2 seconds, in order, with timers, and nothing is lost when a screen dies: the
printer takes over.

## Read first
`docs/05-devices.md §6` · `docs/07-design-system.md §2, §6` (dark, states) · `docs/03-domain-model.md §5` (`kitchen.status`,
marks) · `DECISIONS.md` D12, D24.

## Do
1. `/ecran` (Resto) for a screen device with its station(s): tickets from `lines.sent`/`lines.fired` of that station, in
   columns by age; each ticket: table, order code, waiter, time since fired, lines with options, notes, seat and course;
   "à suivre" tickets greyed until fired.
2. States through `kitchen.status` (last writer wins): new → preparing → ready (tap), recall (long press); colours and the
   amber/red thresholds per station (defaults 10 and 15 min); "Tout le jour" totals per dish; sound and flash on a new
   ticket (reduced motion respected); rush mode with larger type.
3. Pass screen: all stations of an order; "prêt à servir" notifies the waiter's phone.
4. Fallback: if a station's screen has not answered the Station for 30 s, the Station prints that station's new tickets on
   its printer and marks them "IMPRIMÉ (écran hors ligne)".
5. Measure the latency from "send" on the phone to display on the screen (Station path), logged per ticket in dev builds.

## Constraints
Kitchen status never changes money. Screens show no prices.

## Acceptance checks (run them, paste the output)
1. Latency over 50 tickets through the Station: median and 95th percentile (target ≤ 2 s).
2. The screen switched off → the printer receives the next tickets; switched on → the screen shows them as printed.
3. `npm run gate` and screenshots of a busy screen (dark) in French and Arabic.

## Update docs/STATUS.md
Row 30; measured latency.

## Commit
`feat(resto): kitchen screens by station, pass screen and printer fallback`
