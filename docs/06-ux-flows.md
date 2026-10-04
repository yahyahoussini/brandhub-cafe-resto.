# 06 · UX flows — screens, steps, states

Speed budgets (D12), numbers-not-accusations (D13) and visible offline (D15) apply to every screen. Words come from
`data/glossary.json`; every string exists in French and Arabic.

## 1. Common elements
- **Top bar (staff screens):** venue name · staff name and role · sync badge (green "Synchronisé" / orange "N en
  attente" / red "Hors ligne depuis 12 min") · shift state · licence banner when in grace ("Renouvellement à prévoir").
- **Lock screen:** staff tiles (name, colour) or a PIN pad; "Pointer" (clock in/out, when the module is on); the screen
  locks after 2 minutes without a tap on the till, 5 minutes on phones (settings).
- **Manager approval:** an overlay "Validation gérant" with a PIN pad and a reason list (erreur, client parti, offert,
  casse, autre); the approval is recorded in the event (`approvedBy`), never as a shared password.
- **Errors:** say what happened and what to do ("Imprimante hors ligne — le ticket attend. Vérifiez le papier."); codes
  come from docs/03 §9.

## 2. BrandHub Café — the till (`/caisse`, tablet landscape)
Layout: categories in a column at the start side · product tiles in the middle (≥ 96 × 96 px, name, price, "Rupture"
pill) · the current order at the end side (lines, total, actions) · bottom bar: **Payer** (primary), **En attente**,
**Table**, **Remise**, **Plus**.
1. **Open the till.** No open bank on this device → "Ouvrir la caisse": float (total, or by notes and coins) → dose
   counter reading when the module is on and it is the day's first opening → sell.
2. **Sell a coffee (2 taps).** Tap "Café noir" (one line, quantity 1) → tap "Espèces 10,00" (exact amount) → the receipt
   prints (setting), the drawer opens, the next order starts. Options (sucre, lait, taille) open only for products with
   required options; optional ones via a long press or "Options".
3. **Cash with change.** Payer → quick notes 20 · 50 · 100 · 200 → "Rendu 25,00" in large type → confirm.
4. **Other tenders.** Carte (TPE externe: reference required, last 4 digits or slip number) · Maroc Pay (reference) ·
   Virement · Bon · Crédit (Kredi, V1.1). **Split:** by amount or in n equal parts (`splitEvenly`).
5. **Tables.** "Table" → zone tabs (Salle, Terrasse) → table grid with time and amount → tap a table to open or resume it.
6. **Mistakes.** Tap a line → quantity stepper or "Annuler la ligne" (manager approval once sent). "Dernier ticket" →
   reprint (the first is free, the next ones need approval; counted on the Z).
7. **Out of stock ("86").** Long press a tile → "Rupture" (permission `availability_86`).
8. **Close the till.** "Fermer la caisse" → blind count (the expected amount is not shown) → confirm → the screen shows
   "Écart : −5,00 DH" → Z prints → dose counter closing reading and declared doses (tests, staff, offered).

## 3. BrandHub Café — the waiter phone (`/serveur`, portrait)
Bottom tabs: **Tables** · **Commande** · **Ma caisse** · **Pourboires** (V1.1).
1. Tables: his zone first; free/occupied/addition; a table he does not own shows the owner's name.
2. Order: categories or search; tap to add; "Envoyer au bar" sends the lines (bar ticket at the bar printer or screen).
3. "Encaisser": exact cash, notes, card (reference), Maroc Pay; the receipt prints at the counter printer (Station), or
   the phone shows "Ticket prêt au comptoir"; with `digital_receipt` (V1.1) it can show a QR instead.
4. Ma caisse: cash held, tables cashed, open tables; "Remettre ma caisse" shows a 4-character code the manager types at
   the till to take over and count the bank.

## 4. Bar or kitchen screen (`/ecran`)
See docs/05 §6. Café: optional bar screen that replaces paper tickets. Resto: one per station plus the pass screen.

## 5. Back office (`/gestion`, phone first, also desktop)
| Section | Shows |
|---|---|
| Aujourd'hui | revenue, tickets, average ticket, by hour, open tables, banks with expected cash, alerts (cash gaps, dose gap, stock, dead letters) |
| Rapports | day, week, month: by category, product, staff, zone, hour; tenders; VAT; voids, discounts, openings without sale, reprints; exports CSV and Sage |
| Carte | categories, products (price TTC, VAT, doses, deductions, options, zone prices, availability), import CSV |
| Équipe | staff, roles, PIN reset, permissions (within the floors of `data/permissions.json`) |
| Appareils | devices, pairing QR, revoke, printers and routes, Station state |
| Stock | items, counts, levels, low-stock list, waste |
| À vérifier | dead-letter events with their amounts, resolution actions |
| Réglages | identity and legal mentions, receipt, printing, taxes, approvals, reports (time, channels, thresholds), hours |
| Abonnement | status and dates from the licence, "Contacter BrandHub" (WhatsApp link) |
Numbers are always money-first: "Écart −35,00 DH (Ali, 3 services)". Every number links to the events behind it.

## 6. Account and onboarding
1. `/activer#<token>` + the 6-digit code sent by Yahya on WhatsApp (valid 72 h) → set a password → scan the TOTP QR →
   accept CGU and DPA (click-wrap, version and time recorded) → onboarding.
2. Café onboarding wizard: identity (name, address, city, phone, ICE, IF, RC, patente, CNSS) → taxes (VAT 10 % default,
   takeaway and delivery confirmed with the accountant, débit-de-boissons commune and rate) → service (counter, waiters,
   both; zones) → menu (template "Café marocain" from `data/menu-templates/cafe.json` with empty prices to fill, or a CSV
   import) → staff (names, roles, PINs) → devices (pair the till, test the printer) → evening report (owner's WhatsApp
   number and explicit opt-in, time) → a training sale in TEST mode → "Votre café est prêt".
3. Required fields that are missing stay listed in "À compléter" on the dashboard; the till still sells.

## 7. BrandHub Resto — what differs
- Till and handheld open on the floor plan (drawn rooms, table shapes, covers); an order has seats and courses.
- Handheld: add dishes by seat; "Envoyer et continuer" sends the current course and keeps the order open; later courses
  can go "à suivre" and be fired with "Lancer la suite".
- Bills: split by seat, by item or by amount; optional service charge; tips.
- Kitchen: one screen per station, the pass screen, printer fallback; "Tout le jour" counts.
- Back office adds: recipes (with sub-recipes), purchasing (orders, receipt with photo, prices), food cost, menu engineering.
Details come with prompts 27–41.

## 8. States every component must have
Default · pressed · disabled · loading · error · empty ("Aucune vente aujourd'hui") · offline · success; in French and in
Arabic (right to left, icons flipped where they point); back office readable at 200 % zoom. Screenshots of each screen
in both languages at 360 × 800 (phone) and 1280 × 800 (tablet) are part of every UI prompt.
