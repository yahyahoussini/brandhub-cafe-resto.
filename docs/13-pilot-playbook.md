# 13 · Pilot playbook — choosing, installing, following up

Pilot 1 (Café): Mon 30 Nov 2026 in Casablanca. Pilots 2–5 (Café) from Mon 4 Jan 2027. Resto pilot 1: Mon 12 Apr 2027.

## 1. Choosing a pilot
A good pilot: the owner already feels the loss (the pain-aware rule) · 150+ tickets a day · at least one waiter who
handles cash · a working internet line · the owner answers WhatsApp in the evening · within 30 minutes of you. Avoid a
first pilot in a place with a busy match night in the first two weeks.
Agreement (one page, FR/AR): 3 months free, weekly 10-minute feedback, the owner's written agreement that Yahya reads
the evening report and the day's figures during the pilot for support (revocable at any time), the owner's consent to
use anonymous figures as a case study only if he signs it later, the DPA, and who to call.

## 2. Before the visit (you, with Claude Code's help)
1. Create the tenant (`tools/admin.mjs tenant:create`, then `tenant:subscription` with the `pilot_cafe` or `pilot_resto` plan).
2. Send the activation link and code on WhatsApp; help the owner activate on his phone.
3. Import the menu yourself from the template and his price list; check VAT with his accountant; fill the legal fields.
4. Staff list with roles; PINs chosen on site.
5. Hardware: check the kit against `docs/05-devices.md §9`; buy what is missing; run the hardware test at home first.
6. Router: note the brand; plan the DHCP reservation for the Station and printers; bring the 4G router.

## 3. The visit (60–90 minutes, outside service, e.g. 15:30–17:00)
1. Tablet: Chrome updated, screen lock set, battery optimisation off for Chrome, screen timeout 30 min; pair "Caisse 1".
2. Station (if any): install, start with Windows, DHCP reservation, UPS; pair; printers routed.
3. Printers: test page, French and Arabic receipt, bar ticket; drawer on cash only.
4. Staff PINs (no birthdays), a first "Pointer" if the clock module is on.
5. Training: cashier 10 min (sell, pay, split, void with approval, close) · waiter 10 min (tables, send, cash, hand over
   the bank) · manager 15 min (approvals, take-over, count, Z) · owner 10 min (evening report, `/gestion`, "À vérifier").
6. Drills in front of the owner: unplug the router and sell 5 tickets; switch the printer off and on; restart the Station.
7. Open the first real shift with the team; stay for the first rush if you can; come back for the blind count and Z.
Leave the laminated card "Problème ? / مشكل ؟" with your support number.

## 4. Days 1–7
Read the pilot's evening report every night (the agreement allows it; without it, read only the control report's counts). Call on day 3 and day 7. Log every issue in STATUS with its time,
cause and fix. Fixes only for two weeks: no new feature on a pilot's version. Compare the till's totals with the owner's
paper count for the first 5 days (capture rate).

## 5. What we measure (Gate 2, D48)
Gate 2 (15 Jan 2027) needs pilot 1 to run 5 weeks and meet these three targets (D48):

| Measure | Target |
|---|---|
| Sales captured vs the paper count | ≥ 95 % |
| Payments lost | 0 |
| Support time | ≤ 6 h a week |

Also watched; these do not decide Gate 2:

| Measure | Target |
|---|---|
| Median sync delay online | < 10 s |
| Dead letters open for more than 48 h | 0 |
| Owner reads the evening report | ≥ 5 evenings of 7 |
| Staff back on paper | never |

## 6. Support
One WhatsApp Business number, 08:00–00:00, answer within an hour during pilots (D47). Scripts (French; say them in Darija):
- "Le badge est orange : c'est normal sans internet. Continuez à vendre, tout part tout seul quand internet revient."
- "L'imprimante ne sort rien : vérifiez le papier et le câble, puis appuyez sur Réimprimer. Le ticket n'est pas perdu."
- "Un serveur a remis sa caisse : ouvrez Caisse → Reprendre, tapez son code, comptez."
Remote access to a client's data only after his written request on WhatsApp (D47).

## 7. Stop rules
Stop adding pilots if support passes 10 hours a week; freeze features for 4 weeks if Gate 2 fails (4 Sep plan rule).
