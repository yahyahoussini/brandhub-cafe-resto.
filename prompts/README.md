# Prompts — the build, one at a time

47 prompts build BrandHub Café and BrandHub Resto on the shared kit. Paste one prompt into Claude Code, read its
answer, check that its acceptance checks pass, then paste the next. Never two at once, never out of order (except
prompt 45, which runs only if needed).

Every prompt has the same parts: **Goal** (what exists at the end) · **Read first** (the files Claude Code must read) ·
**Do** (the work) · **Constraints** (what must not happen) · **Acceptance checks** (run and pasted, never summarised) ·
**Update docs/STATUS.md** · **Commit**; release prompts add a **Release** part. `CLAUDE.md` holds the rules that apply
to all of them, and `DECISIONS.md` wins over any other file.

## Phases and release tags
| Phase | Prompts | Dates | Ends with |
|---|---|---|---|
| Kit | 00–10 | 5–23 Oct 2026 | repository, rules, cloud store, sync, control API, Station, printing, CI |
| Café V1 | 11–18 | 26 Oct–20 Nov 2026 (features frozen 20 Nov) | the café product |
| Café release | 19–20 | 23–27 Nov 2026 | `cafe-v1.0.0` and `station-v1.0.0`; pilot 1 on Mon 30 Nov 2026 |
| Café V1.1 | 21–26 | 1 Dec 2026–22 Jan 2027 | `cafe-v1.1.0` before 1 Feb 2027 (Ramadan freeze 8 Feb–9 Mar) |
| Resto V1 | 27–36 | 25 Jan–2 Apr 2027 | `resto-v1.0.0`; Resto pilot on Mon 12 Apr 2027 |
| Resto V1.1 | 37–41 | 13 Apr–30 Jun 2027 | `resto-v1.1.0` before Gate 3 (30 Jun 2027) |
| V2 | 42–46 | from Tue 6 Jul 2027 | `cafe-v2.0.0` (42), `resto-v2.0.0` (44), `android-v1.0.0` (45, if built), `*-v2.1.0` (46) |
Gates: Gate 2 on 15 Jan 2027 (pilot 1 results, prices), Gate 3 on 30 Jun 2027 (D48). Once a product has a live client,
its releases go out only in the window of D46 (Tuesday 03:00–06:00); the first release of each product may go out any day.

## The prompts
| # | Prompt | Product | Needs from Yahya before it (docs/14) |
|---|---|---|---|
| 00 | Orientation (no code) | both | Gate 1 result, pilot 1, existing code (tasks 1–2) |
| 01 | Repository scaffold, lint, type check, tests | kit | the private GitHub repository (task 3) |
| 02 | Design system, fonts offline, UI parts, i18n | kit | — |
| 03 | Business rules: events, marks, stock, reports, permissions | kit | — |
| 04 | Cloud store: one SQLite database per client | kit | Cloudflare Workers Paid (task 4); the accountant's retention answer (task 28) |
| 05 | Accounts, device pairing, staff PINs, permissions | kit | — |
| 06 | Device store, sync and Mode panne | kit | — |
| 07 | Control API, licence, statuses, admin tool | kit | admin keys generated, public keys as secrets (task 5) |
| 08 | BrandHub Station (local hub) | kit | a Windows PC for the final checks |
| 09 | Printing, cash drawer and the hardware test | kit | the reference kit or pilot 1's hardware, by 12 Oct (task 6) |
| 10 | Quality gates and CI | kit | — |
| 11 | Café app shell and onboarding | Café | pilot 1's menu, legal identity, VAT answer and minimum ticket mentions, by 26 Oct (task 7) |
| 12 | The counter till | Café | — |
| 13 | Waiter banking and tables | Café | — |
| 14 | Shifts, blind count and Z | Café | — |
| 15 | Dose counter | Café | — |
| 16 | Light stock | Café | — |
| 17 | Owner back office and reports | Café | — |
| 18 | Evening report on WhatsApp | Café | Meta verification, WhatsApp number, template, Darija review, by 9 Nov (tasks 8–9) |
| 19 | Café hardening before the pilot | Café | — |
| 20 | Café pilot release | Café | legal texts and support number by 27 Nov (tasks 10–11); pilot agreement by 29 Nov (task 12) |
| 21 | Borsat: the digital tip pool | kit, Café | the WhatsApp opt-in check (task 23) |
| 22 | Kredi: customer tabs and staff advances | kit, Café | the WhatsApp opt-in check (task 23) |
| 23 | Compliance pack and digital receipt | kit, Café | the answers on the buyer's ICE and the digital receipt (task 29) |
| 24 | Mode Ramadan | Café | — |
| 25 | Coût de la tasse and supplier prices | Café | — |
| 26 | Stamp card | kit, Café | — (before 1 Feb 2027: tasks 13–14) |
| 27 | Resto app shell, onboarding, menus and QR menu | Resto | the Resto pilot's menu and recipes (task 17) |
| 28 | Floor plan and table service | Resto | — |
| 29 | Handheld ordering: seats, courses, send and continue | Resto | — |
| 30 | Kitchen screens and routing | Resto | — |
| 31 | Bills and payments | Resto | — |
| 32 | Recipes and food cost | Resto | — |
| 33 | Stock, suppliers and purchasing | Resto | — |
| 34 | Staff, time clock and tips | Resto | — |
| 35 | Resto reports, compliance pack and evening report | Resto | each restaurant's débit-de-boissons answer (task 30) |
| 36 | Resto hardening and pilot release | Resto | Resto pilot agreement and legal texts (task 27) |
| 37 | Phone orders, deliveries and customer accounts | Resto | lawyer's consent wording, accountant's VAT answers (tasks 20–21) |
| 38 | Direct ordering by link, QR and WhatsApp | Resto | Turnstile widget, lawyer's order-page list (tasks 20, 22) |
| 39 | Reservations, deposits and Mode Match | kit, Resto (Café V2) | accountant's answer on deposits (task 21) |
| 40 | Order book: traiteur, pâtisserie and Aïd orders | kit, Resto (Café V2) | — |
| 41 | Menu engineering and table yield | Resto, Café V2 | — |
| 42 | Camera link: ticket text on the NVR recording | kit, both | access to a Hikvision NVR (task 24); the lawyer's answer on the video CNDP formality (task 31) |
| 43 | Delivery-app inbox: Glovo first | Resto | Glovo approval, staging access, API documentation, a payout statement (task 18) |
| 44 | Multi-site | Resto | a client with `limits.sites` ≥ 2 |
| 45 | Android shell for Sunmi and iMin (only if needed) | both | the device (task 25) |
| 46 | E-invoicing export: UBL 2.1 | kit, both | the state of the DGI specifications (task 26) |

## When something goes wrong
- A check fails: say "the check N failed, here is the output", and let Claude Code fix it inside the same prompt.
- A fact is missing: Claude Code stops, lists it in `docs/STATUS.md → Open items`; fill it and continue.
- You want a different behaviour: change the decision in `DECISIONS.md` first, then say "Apply the change to Dnn".
