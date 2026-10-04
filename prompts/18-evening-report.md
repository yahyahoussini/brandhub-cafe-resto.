# Prompt 18 — Evening report on WhatsApp

> Run after prompt 17. Needs from Yahya: Meta Business verification, the WhatsApp number for reports, the template
> submitted, and his review of the Darija draft (docs/14 tasks 8–9). Until approval, the report goes by email.

## Goal
At 23:30 Casablanca time (or when the manager closes the day), the owner receives the day's numbers and gaps on WhatsApp,
and every message is counted.

## Read first
`docs/10-reports-analytics.md §3` · `data/evening-report.json` · `docs/12-deploy-runbook.md §7` · `DECISIONS.md` D26, D35,
D42 · `packages/kit/src/timezone.js`, `reports.js`.

## Do
1. Registry `report_schedule`: each client's report time in local time; the cron every 15 minutes selects clients whose
   local time crossed their report time since the last run (use `zonedToUtc`; it must work in the UTC+0 Ramadan period);
   one report per business day, at the first of `day.closed` or the fallback time (docs/10 §3: a fallback report says
   « journée en cours »; nothing is sent twice).
2. Report builder in the TenantStore from `dailyReport` and the stock and dose data: the variables of
   `data/evening-report.json`, `—` for empty values, amounts with `formatAmount`, the comparison phrase, and the URL
   button's date.
3. WhatsApp Cloud API client (`packages/kit-worker/src/whatsapp.js`): send the approved template in the owner's language
   (fr or ar; Darija only after Yahya approved the text and Meta the template); handle errors and rate limits; never log
   the phone number (hash only).
4. Email fallback with Resend (same content) when WhatsApp is not approved, the owner did not opt in, or sending failed.
5. `messages` counts per client per month (channel, kind, status) shown in `/gestion → Abonnement` and in the control
   report.

## Constraints
Only opted-in owners receive WhatsApp messages; the opt-in text and time are stored. No customer data in any report message.

## Acceptance checks (run them, paste the output)
1. Unit test: the acceptance day produces exactly the variables of `data/evening-report.json → example`.
2. Schedule tests with fixed clocks on 30 Nov 2026 and on 20 Feb 2027 (UTC+0 period): the report goes at 23:30 local both times.
3. On staging: a real message to Yahya's number (or the fallback email), with the message count increased. `npm run gate`.

## Update docs/STATUS.md
Row 18; template status at Meta; the real per-message price shown in the Meta dashboard.

## Commit
`feat(cafe): evening report on WhatsApp with email fallback and message counts`
