# STATUS — build log

Claude Code updates this file at the end of every prompt (CLAUDE.md, "Each prompt").

## Inputs from Yahya
| Input | Value | Date |
|---|---|---|
| Gate 1 result (18 Sep interviews) | Not run yet. No interview result recorded; the build starts without Gate 1 evidence. | 4 Oct 2026 |
| Pilot 1 (name, address, current till) | Not chosen yet. Needed by prompt 09 (hardware, 12 Oct) and prompt 11 (menu, legal identity, VAT, 26 Oct). | 4 Oct 2026 |
| Existing code from the 5 Sep runbook | No. The pack starts from an empty repository. | 4 Oct 2026 |
| Reference hardware bought for tests | _to fill before prompt 09_ | |
| WhatsApp Business number (reports) | _to fill before prompt 18_ | |

## Prompts
| # | Prompt | State | Date | Notes |
|---|---|---|---|---|
| 00 | Orientation | done | 4 Oct 2026 | Node v22.22.0, `npm test` 75/75. 15 contradictions or gaps listed below (not applied). Gate 1 not run, pilot 1 not chosen. |

## Current state
- Kit: 75 unit tests passing (money, ids, order with moves and customers, bank with the bank guard, receipts, escpos,
  timezone, licence, control signature, journal).
- Apps: not started.
- Repository: the pack is commit `5a6674a` in `yahyahoussini/brandhub-cafe-resto`. The build runs on
  `yahyahoussini/brandhub-cafe-resto.` (trailing dot), branch `claude/gallant-brown-cq49fc`. Both repositories are
  **public**; README §Before you start and docs/14 task 3 ask for a private one. Yahya to choose one repository and make it private
  before prompt 01.

## Orientation findings (prompt 00) — not applied
Each one was found by one reader and checked by a second agent. Items 1–3 were reproduced with node. Nothing is changed until Yahya
approves; DECISIONS.md wins unless stated.

1. **Receipt numbering crashes** — `packages/kit/src/receipts.js:88,118-127`, docs/04 §10 scenario 8. After a till uses
   up its blocks, `addBlock` keeps the stale `next`; the next non-contiguous block gives `remaining()=10` and
   `takeNumber` throws `TypeError` (reads `.end` of undefined). Fix: reset `next` to `block.start` when no held block
   contains it; failing test first (prompt 03 allows it).
2. **Business day split after Ramadan** — `packages/kit/src/timezone.js:82` vs D26 (`DECISIONS.md:186-189`). On
   Mon 15 Mar 2027 00:10 and 00:30 give `2027-03-13` and 01:10 gives `2027-03-14` (subtracts 24 h of UTC instead of one
   calendar day). Also `cutoffHour` is an integer while `hours.businessDayCutoff` is HH:MM (docs/03:202). Fix: step back
   one local calendar day; accept HH:MM; add the 15 Mar 00:30 case to prompt 24's check.
3. **`dev_cloud` is not a valid writer id** — docs/03:23 vs `packages/kit/src/ids.js:94` (`isEntityId("dev_cloud","dev")`
   is false); owner-session (office) events have no writer id. Fix: export `CLOUD_DEVICE_ID`, accept it in validation,
   and define the office writer in docs/03 §4.
4. **Licence `modules` has no source** — `licence.js:33,53,133` requires it; `data/plans.json`, docs/09 §2 bodies, the
   `licence_mismatch` check (docs/09:39-40) and `admin.mjs` never set it, so prompt 11 would hide every screen. Fix:
   Yahya picks the rule (modules per plan in plans.json, or all shipped modules minus per-client holds), written in
   docs/01 §5 and docs/09.
5. **Test runner** — D44 (`DECISIONS.md:303`), CLAUDE.md:75 and prompt 01:30 say `node --test`; prompt 04:31,40 adds
   `@cloudflare/vitest-pool-workers` and expects `npm test` to run it. Fix: amend D44 to name Vitest for Worker tests and
   have prompt 04 extend the root `npm test`.
6. **VAT precedence undefined** — D40 (`DECISIONS.md:278-281`), docs/03:192-193, docs/11:40-41; templates hard-code
   `vatBp: 1000` on every product. Fix: rule `product.vatBp ?? taxes.byMode[mode] ?? taxes.defaultVatBp` in one kit
   function (prompt 03); template products get `vatBp: null`.
7. **Catalog events miss fields the data uses** — `catalog.category_set` (docs/03:109) has no `taxClass` or `course`,
   but both templates, docs/11:49-50, prompts 23 and 29 rely on them; resto.json "Ftour complet" has `setMenu: true`
   with no set menu defined. Fix: add the fields to docs/03 §5 and `taxClass` to the `sales_lines` projection.
8. **Kit errors without codes** — docs/03 §9 requires a code on every rejection; `order.js`/`bank.js` let `money.js`
   `TypeError`/`RangeError` escape uncoded (e.g. `unitCentimes: 12.5`, `vatBp: 12000`). Fix: map to `E_BAD_DATA`, tests first.
9. **Journal hash gaps** — `journal.js:3-5` `HASHED_FIELDS` omits `relayedBy`, `clockSkew`, `v`; docs/03 §6 stores
   the first two and not `v`. Fix before prompt 04 stores events: hash them and add `v` to the `events` table.
10. **Licence key lifecycle** — docs/08:42 says public keys are "shipped to devices at pull", but no response in docs/04
    carries them; docs/12 §11 yearly rotation (old kid kept 1 month) breaks 12-month prepaid licences (D7). Fix: bundle
    keys in the build (keeps D27's guarantee) and re-sign live licences during the rotation month.
11. **Admin restore endpoint has no builder** — D28/D49, docs/02 §5, docs/12 §8 define `POST /api/admin/restore`; no
    prompt builds it and no `admin.mjs` command calls it, but prompts 19 and 36 require the restore drill. Fix: add it to
    prompt 07 with a command such as `tenant:pitr` (`tenant:restore` already means un-suspend).
12. **D9 signals** — "weak visibility" (`DECISIONS.md:67-68`) is defined nowhere (docs/09:47-51, docs/10:89-92), and
    only Resto prompt 35 computes signals; Café's control report has none. Fix: define or drop the flag; compute
    the Café flags in prompt 17.
13. **Meta opt-in check timing** — D35 and docs/14 task 23 need it before prompt 22 (Dec 2026); docs/11 §11 item 11
    sits under "Before Resto V1.1"; prompt 21 also branches on it. Fix: move item 11 to "Before Café V1.1".
14. **Station for waiter cafés** — D24 (`DECISIONS.md:172-173`) requires a Station; docs/02:39 describes waiter phones
    without one. Fix: rewrite docs/02:39 as the D25 outage fallback.
15. **Settings missing from docs/03 §8** — the drawer setting (prompt 09), lock-screen timeouts (docs/06), the
    loss-signal thresholds docs/10 §4 calls settings, and the printer `charsPerLine` vs `receipt.width` overlap.
    Fix: add the paths and defaults in prompt 03.

Smaller verified items for later: D11 Arabic-Indic digits not in docs/07 or settings; D20 calls heartbeats marks while
docs/03 says they are not events; docs/03 says the kit implements §2–§6 (only §7 is provided); docs/04 §9 cites docs/03
§4 instead of §7; `dev:*` scripts and `npm run rebuild` created by no prompt; docs/02 §2 workspace globs vs prompt 01;
long press on a till tile has two meanings (docs/06 §2.2 and §2.7); docs/07 colour tokens incomplete and some fail contrast;
sync-badge wording (D15 vs glossary); D7 "unlimited" vs `99` in plans.json; no module key for Café's PIN clock (D32);
`deadletter.resolved` shape differs (docs/03 vs docs/04); Z tender list omits `other`; Station keys differ (docs/05 §1,
`printing.routes`, templates); evening-report template has no dead-letter variable; docs/13 lists seven Gate 2 targets
under D48, which sets three; docs/02 cites a shutdown order docs/13 lacks; training times differ (digest vs docs/13);
docs/14 has no task for several docs/11 §11 items (2, 3, 4, 6, 12, 13).

## Open items
To confirm (from docs/11 §11, data flags and Darija drafts). Who confirms → needed by.

**Accountant (client's)**
- §11.1 takeaway/delivery VAT; `tax-presets.json` `vat.takeawayBp`, `vat.deliveryBp` (`toConfirm`) → prompt 11, 37 (tasks 7, 21).
- On-site 10 % and standard 20 % VAT (`secondary_sources`; onboarding checkbox) → prompt 11 (task 7).
- §11.2 minimum mentions on consumer tickets → prompt 09/11 (no docs/14 task; add to task 7).
- §11.3 buyer's ICE on B2B invoices → prompt 23 (no docs/14 task).
- §11.4 retention 10 years (D43, D49) → prompt 04 (no docs/14 task).
- §11.6 débit-de-boissons liability per restaurant; commune rate outside Casablanca/Salé → prompt 23, 35.
- §11.10 VAT on deposits and delivery fee → prompt 37, 39 (task 21).
- PCGE account codes of the Sage export → prompt 17.

**Lawyer**
- §11.5 CNDP transfer formality, DPA, privacy, CGU (FR/AR) → prompt 20, 1 Feb 2027, prompt 36 (tasks 10, 14, 27).
- §11.8 oral phone consent text; §11.9 online order page (Law 31-08) → prompt 37, 38 (task 20).
- §11.12 digital receipt replacing paper (Law 31-08 art. 4) → prompt 23 (no docs/14 task).
- §11.13 client's CNDP formality for video with ticket text → prompt 42 (no docs/14 task).

**Yahya**
- §11.11 Meta opt-in for messages to clients' customers → before prompt 22 (task 23).
- §11.7 e-invoicing phase per client; UBL mapping when DGI publishes → prompt 46 (task 26).
- Darija drafts: evening report `data/evening-report.json:54` → prompt 18 (task 9); 40 glossary terms
  `data/glossary.json` (`draft_review_by_yahya`) → prompt 18, 20, 22 (no task); quick-card Darija lines → prompt 20
  (no draft exists in the pack); `rappel_kredi` Darija → prompt 22 (not drafted).
- Plan prices (`plans.json`, `to_test`), free entry app, loss-review price → Gate 2, 15 Jan 2027 (task 16).
- WhatsApp utility price in Morocco ($0.0230 is a reseller figure) → prompt 18.
- Legal entity that invoices (SARL AU vs auto-entrepreneur) → 1 Feb 2027 (task 13); OMPIC check → launch (task 15).
- MOWAKABA eligibility; Payzone/Fatourati/Chari fees → no prompt (sales only / only if D8 changes).
- Code-signing certificate price → optional (task 19).

**Hardware test (prompt 09, task 6)**
- Printer profiles `verified: false`: `epson_tm_t20iii`, `xprinter_xp_v330n` (code page), `generic_58_bt`,
  `sunmi_inner`; reference kits and their prices.

**Others**
- R2 free tier "10 GB" → Claude Code checks in prompt 04 (docs/02:99).
- Hikvision/Dahua POS protocol fields → prompt 42 (task 24); Glovo API version → prompt 43 (task 18).
- Suggested dose quantities (`cafe.json`, 15 entries) → the café owner; recipe quantities (`resto.json`, 7) → the
  Resto chef (task 17).

**Inputs**
- Gate 1 not run: no demand evidence before the build. Pilot 1 not chosen: blocks prompt 09 hardware by 12 Oct and
  prompt 11 by 26 Oct.

## Decisions changed during the build
_None yet. Any change is made in DECISIONS.md first._
