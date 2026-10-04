# Prompt 28 — Floor plan and table service

> Run after prompt 27.

## Goal
The till and the handhelds open on a drawn floor plan whose tables show, within 2 seconds on every device, who has them,
for how long and for how much.

## Read first
`docs/06-ux-flows.md §7` · `docs/07-design-system.md §5–§6` (table cell, states) · `docs/03-domain-model.md §5`
(`table.set`, `table.mark`, `order.moved`) · `docs/04-sync-protocol.md §9` (merge).

## Do
1. Editor in `/gestion/salle`: rooms (tabs), tables dragged on a grid (round, square, long), seats, names; stored as
   `zone.set` / `table.set` marks; touch-friendly on a tablet.
2. Plan view on the till and handheld: state colours and text of docs/07 §6, covers, time since opening, amount, waiter;
   tap to open or resume; long press for move, merge, split, mark "nettoyage".
3. Covers asked when a table opens (`order.covers_set`), editable.
4. Move a table (`order.moved`); merge two tables and split a table's order into two orders with the kit's moves
   (`lines.moved_out` + `lines.moved_in`, docs/04 §9): sent lines keep their state, no approval, no second ticket.
5. Updates through the Station (long-poll) in ≤ 2 s; the cloud fallback when there is no Station.

## Constraints
Plan changes during a service never close or move open orders; a table deleted from the plan keeps its open order visible
until it is closed.

## Acceptance checks (run them, paste the output)
1. Two devices through the Station: a table opened on one appears occupied on the other in ≤ 2 s (measured).
2. Move, merge and split keep the totals exact (kit tests plus E2E).
3. `npm run gate` and screenshots of the plan in French and Arabic (tablet and phone).

## Update docs/STATUS.md
Row 28.

## Commit
`feat(resto): floor plan editor and live table service`
