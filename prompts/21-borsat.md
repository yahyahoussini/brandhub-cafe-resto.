# Prompt 21 — Borsat: the digital tip pool

> Run after pilot 1 is stable (from 1 Dec 2026). Kit module: built once, enabled in Café now and in Resto (prompt 34).

## Goal
Tips of a shift are recorded, split by the rule the team chose, and each waiter gets his statement: the app is the
referee, the owner never touches the money.

## Read first
`docs/research/innovation-map-2026-09.md` (feature 1) · `docs/03-domain-model.md §5` (tip pool) · `DECISIONS.md` D13, D20,
D35, D42 · `packages/kit/src/money.js` (`allocate`), `order.js`, `bank.js`.

## Do
1. Kit: `packages/kit/src/tips.js` with the tip-pool reducer (`tip.pool_opened`, `tip.added`, `tip.member_set`,
   `tip.closed`, and `tip.adjusted {splits, reason, approvedBy}` for a correction after closing) and
   `splitTips(total, members, rule)` for `equal`, `hours` (typed hours until the PIN clock of prompt 23, then clock-ins)
   and `role`
   (weights per role), always summing exactly (largest remainder); tests with property checks.
2. Card tips: extend `payment.added` with an optional `tipCentimes` (not counted in `paid`, added to the bank's expected
   cash only for cash tenders) — update `order.js`, `bank.js` and their tests first; old events without the field stay valid.
3. Till and phone: "Pourboires" at shift closing (cash counted into the pool, card tip lines added automatically); the
   manager closes the pool; each member sees his share in "Mes chiffres". A statement on WhatsApp follows the answer of
   docs/14 task 23: the utility template `releve_pourboires` from BrandHub's number, or click-to-chat from the manager's
   phone; either way only to staff who gave their number and consent (`staff_pii`, docs/03 §6).
4. Settings `tips` (docs/03 §8): enabled, rule, role weights; the owner sets them with the team.

## Constraints
The tip pool never mixes with the sales revenue or the VAT. A split is final once the pool is closed; corrections are a
new adjustment event with approval.

## Acceptance checks (run them, paste the output)
1. `splitTips` tests (equal 100,00 over 3 → 33,34 / 33,33 / 33,33; hours; roles) and the property test.
2. E2E: a shift with 2 waiters, cash and card tips, closed pool, statements.
3. `npm run gate`.

## Update docs/STATUS.md
Row 21.

## Commit
`feat(kit): Borsat tip pool with split rules and statements`
