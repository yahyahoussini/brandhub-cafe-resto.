# Prompt 26 — Stamp card (« 10 cafés = 1 offert »)

> Run after prompt 25. Kit module.

## Goal
Regulars collect stamps by phone number and get their free item, without an extra app or a plastic card.

## Read first
`docs/11-compliance.md §8` · `docs/08-security.md §6` · `DECISIONS.md` D42 · the customer model of prompt 22.

## Do
1. Programme settings: qualifying products, stamps per item, reward (a free product up to a value), expiry.
2. At the till or on a phone: find or add the customer by phone number (consent required, the model of prompt 22) and
   attach him with `order.customer_set`; stamps added when the order closes; the receipt shows "Tampons : 7/10".
3. Reward: the free product as a line at price 0 (`unitCentimes: 0`, note « fidélité »), no discount and no approval
   needed; the loyalty report counts it at the product's catalog price.
4. `/gestion/fidelite`: members, stamps given, rewards used, cost of rewards.

## Constraints
Consent before the first stamp; erasure as in prompt 22. No marketing messages (D9).

## Acceptance checks (run them, paste the output)
1. E2E: 10 qualifying cafés → the 11th free; the report counts one reward and its cost.
2. Erasure keeps the counts and removes the person.
3. `npm run gate`.

## Update docs/STATUS.md
Row 26; Café V1.1 complete; tag `cafe-v1.1.0` shipped before 1 Feb 2027.

## Commit
`feat(kit): stamp card loyalty by phone number`
