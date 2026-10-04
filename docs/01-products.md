# 01 · Products — who, what, when

Two products that share a kit (D1). This file is the scope reference; `data/modules.json` and `data/plans.json` are
its machine-readable copies and must stay in sync with it.

## 1. The two products
| | BrandHub Café | BrandHub Resto |
|---|---|---|
| Domain | `cafe.brandhub.ma` | `resto.brandhub.ma` |
| For | cafés, coffee shops, salons de thé, counter snacks, pâtisseries with a salon | restaurants, pizzerias, fast food with a grill, caterers |
| Rule (D3) | the kitchen cooks to order less than half of the revenue | the kitchen cooks to order more than half of the revenue |
| Promise | « Vous voyez chaque dirham, chaque dose et chaque serveur, même sans internet. » | « La cuisine reçoit, la salle encaisse, vous voyez ce que rapporte chaque plat, même sans internet. » |
| Typical day | 150–300 tickets at 8–15 DH, 1 till, 0–4 waiters | 40–200 covers, 1–2 tills, 2–8 waiters, 2–5 kitchen stations |
| Pilot 1 | Mon 30 Nov 2026 | Mon 12 Apr 2027 |

## 2. Personas
| Persona | Product | Wants | Hurts today | Touches |
|---|---|---|---|---|
| Le patron (absent owner) | both | to know every evening what came in and what leaked | learns the numbers from the gérant, after the fact | WhatsApp report, `/gestion` on his phone |
| Le gérant (manager) | both | a shift that closes without arguments | counts cash on paper, settles disputes between waiters | till, manager PIN, shift close |
| Le caissier (cashier) | both | to sell fast and never be blamed for someone else's gap | 12 DH tickets at rush hour, notes lost | `/caisse` on the till |
| Le serveur (waiter) | both | his tables, his cash, his tips, fairly counted | pooled tips split by hand, "table partie sans payer" | `/serveur` on his phone |
| Le barista | Café | clear drink orders, no shouting | paper "bons", doses he cannot prove | bar ticket or `/ecran` bar screen, dose counter at open and close |
| Le chef / le cuisinier | Resto | tickets on time, in order, by station | handwritten tickets, re-keyed delivery orders | `/ecran` kitchen screen |
| Le comptable (accountant) | both | clean exports without retyping | Z tickets and notebooks | exports in `/gestion` (read-only role) |

## 3. Jobs each product must do
**Café:** sell a coffee in two taps · let each waiter take and cash his own tables · print the bar ticket · close a shift
with a blind count and a Z per cashier and per waiter · compare the machine's dose counter with coffees sold · warn
before milk or beans run out · send the owner the evening report · keep selling and printing when the internet drops ·
(V1.1) pool and split tips · keep customer tabs · produce the accountant's and the commune's numbers.

**Resto:** take orders at the table on a phone with seats and courses · send each dish to its station within 2 s ·
fire the next course · split and settle bills · deduct stock by recipe and show food cost · receive goods and track
supplier prices · clock staff in and out · send the evening report · keep the kitchen running offline through the Station.

## 4. Modules by version
Module keys are what the licence switches on (`modules` in the licence, D27). A module ships when its prompt is done.

**BrandHub Café**
| Key | Module | Version | Prompt |
|---|---|---|---|
| `till` | Counter till: tiles, options, hold, split, tenders, receipts, bar ticket | V1 | 12 |
| `waiter_banking` | Each waiter's own cash bank on his phone; settlement at the till | V1 | 13 |
| `tables` | Zones (salle, terrasse), tables, time at table, transfer, merge | V1 | 13 |
| `shifts` | Float, blind count, Z per bank, voids/reprints/no-sale counters, training mode | V1 | 14 |
| `dose_counter` | Machine counter readings against coffees sold | V1 | 15 |
| `stock_light` | 10–20 key items, counts, deduction per sale, low-stock alert, waste | V1 | 16 |
| `back_office` | Dashboard, menu, staff, devices, reports, exports, audit | V1 | 17 |
| `evening_report` | 23:30 WhatsApp report, email fallback | V1 | 18 |
| `borsat` | Tip pool per shift, split rules, statements | V1.1 | 21 |
| `kredi` | Customer tabs, staff advances, reminders | V1.1 | 22 |
| `compliance_pack` | Revenue splits, débit-de-boissons base, VAT report, hours sheet, B2B invoices, journal check | V1.1 | 23 |
| `ramadan_mode` | Hours template, ftour menus, services ftour/s'hour | V1.1 | 24 |
| `cup_cost` | Cost and margin per cup, supplier price history | V1.1 | 25 |
| `stamp_card` | « 10 cafés = 1 offert » by phone number | V1.1 | 26 |
| `digital_receipt` | Receipt shown as a QR page instead of paper, on request | V1.1 | 23 |
| `match_mode` | Event nights: TTC event menu, reservations with deposit, minimum spend | V2 | 39 |
| `table_yield` | Revenue per seat-hour | V2 | 41 |
| `camera_link` | Ticket text on the NVR recording | V2 | 42 |
| `order_book` | Pâtisserie and Aïd orders with deposit | V2 | 40 |

**BrandHub Resto**
| Key | Module | Version | Prompt |
|---|---|---|---|
| `station` | Local hub (required) | V1 | 27 |
| `floor_plan` | Rooms and tables drawn to scale, states, transfer, merge | V1 | 28 |
| `handheld` | Waiter phone ordering: seats, courses, send and continue | V1 | 29 |
| `kds` | Kitchen screens and printers by station, timers, recall, pass | V1 | 30 |
| `bills` | Split by item/seat/amount, service charge, tips, per-waiter banking | V1 | 31 |
| `menu` | Options, set menus, menus by time of day, photos, view-only QR menu | V1 | 27 |
| `recipes` | Recipes, sub-recipes, stock deduction, expected vs actual | V1 | 32 |
| `stock` | Storage areas, counts, purchase orders, goods receipt, waste | V1 | 33 |
| `suppliers` | Suppliers, price history, delivery-note photos | V1 | 33 |
| `staff_clock` | Roles, PIN or badge clock, hours sheet | V1 | 34 |
| `borsat` | Tip pool (shared kit module) | V1 | 34 |
| `compliance_pack` | Same as Café | V1 | 35 |
| `back_office` | Dashboard, reports, exports | V1 | 35 |
| `evening_report` | Café report + food cost, dishes, kitchen times | V1 | 35 |
| `phone_delivery` | Phone orders, addresses, delivery states, drivers | V1.1 | 37 |
| `direct_ordering` | WhatsApp and QR ordering into the kitchen | V1.1 | 38 |
| `reservations` | Bookings, deposits, no-shows | V1.1 | 39 |
| `match_mode` | Event nights (shared kit module) | V1.1 | 39 |
| `order_book` | Traiteur and Aïd orders (shared kit module) | V1.1 | 40 |
| `kredi` | Customer accounts settled monthly with B2B invoice | V1.1 | 37 |
| `menu_engineering` | Dishes by margin and popularity | V1.1 | 41 |
| `camera_link` | Same as Café | V2 | 42 |
| `delivery_inbox` | Glovo Partner API, then others | V2 | 43 |
| `multi_site` | Consolidation, central menu, transfers | V2 | 44 |

## 5. Plans and limits (D7)
| Plan key | Product | Limits in the licence | Price to test (HT) |
|---|---|---|---|
| `cafe` | Café | `sites 1 · tills 1 · handhelds 5 · screens 1 · stations 1` | 199 MAD/month · 2,030 MAD/year · setup 990 MAD |
| `resto` | Resto | `sites 1 · tills 2 · handhelds 99 · screens 99 · stations 1` | 399 MAD/month · 4,070 MAD/year · setup 2,490 MAD |
| `extra_till` | both | `tills +1` | 49 MAD/month |
| `pilot_cafe`, `pilot_resto` | Café, Resto | the same numbers as `cafe`, `resto` | free for 3 months |
Staff users are unlimited. Every plan lists every limit key (a missing key means 0). The device list refuses a pairing
above the limit and names the limit reached.

## 6. Café acceptance day
Prompt 19's end-to-end test replays this day on the demo account and checks every number. Demo prices (not a
recommendation): café noir 10,00 · nss nss 10,00 · café crème 12,00 · thé à la menthe (verre) 8,00 · jus d'orange 15,00 ·
msemen 5,00 · eau minérale 50 cl 6,00. All at 10 % VAT. Staff: Sara (cashier), Ali (waiter), Karim (manager).

1. **07:00** Karim opens the day. Sara opens the till bank with a 500,00 float. Dose counter reading: 18 400.
2. **Counter.** Ticket C1-000001: 2 café noir + 1 msemen = 25,00, cash, 50,00 tendered, 25,00 change. Ticket C1-000002:
   1 jus d'orange + 1 café crème = 27,00 on the external card terminal, reference 1234. Ticket C1-000003: 3 thé = 24,00,
   Maroc Pay, reference MP-5521.
3. **Terrasse.** Ali opens his waiter bank (float 0). Table T4: 2 nss nss + 2 msemen = 30,00, sent to the bar, paid cash
   (50,00 tendered, 20,00 change) on his phone; receipt S1-000001 prints at the counter printer.
4. **Salle.** Table T2: 1 café noir sent, the customer leaves; Ali voids the line (Karim approves), then voids the order.
   No receipt number is used.
5. Sara opens the drawer without a sale for change; Karim approves.
6. **15:00** Sara counts 520,00 (expected 525,00): écart −5,00. Karim takes over Ali's bank at the till, counts 30,00
   (expected 30,00): écart 0,00. Dose counter at close: 18 408; the barista declares 1 test dose.
7. **Expected Z:** 4 tickets · revenue 106,00 TTC · VAT 10 % included 9,63 · cash 55,00 · card 27,00 · Maroc Pay 24,00 ·
   average ticket 26,50 · 1 line voided after sending · 1 order voided · 1 drawer opening without sale · doses: 8 on the
   machine, 5 sold + 1 declared, gap 2 doses (about 20,80 DH at the day's average of 10,40 per dose; below the alert
   threshold).
8. **23:30** the evening report shows the same numbers; the comparison with last Monday reads "première journée" on day one.

## 7. Restaurant acceptance service
Prompt 36's end-to-end test replays this lunch through a Station with the internet cut halfway. Demo prices: salade
marocaine 25,00 · harira 20,00 · tajine poulet citron 75,00 · brochettes kefta 70,00 · thé à la menthe (théière) 25,00.

1. Table 12, 4 covers. The waiter enters on his phone: seat 1 harira, seat 2 salade; seats 1–4 mains (2 tajines, 2
   brochettes), 1 théière. He sends the starters while still entering the mains ("envoyer et continuer").
2. The cold station screen shows the salade, the hot station the harira, within 2 s. The chef bumps both.
3. The internet is unplugged. The waiter fires the mains: the hot station and the grill receive them through the Station.
4. The bill: 2 × 75 + 2 × 70 + 25 + 20 + 25 = 360,00. Split by seat: seat 1 pays 95,00 (harira + tajine), the rest
   (265,00) pays cash to the waiter's bank.
5. Stock by recipe: 2 tajines deduct 2 × 250 g of chicken and 2 × 0,5 preserved lemons (recipe values in the demo).
6. The internet comes back: the Station pushes everything; the cloud totals equal the Station's; the evening report
   includes the food cost of the four mains.

## 8. What the products will not do
Accounting (exports only) · payroll (hours sheets only) · card terminal integration (D31) · fingerprint or face clocking
(D32) · sell hardware (D10) · stop a till during an open shift (D14) · send marketing messages to a client's customers
without their recorded consent (D42) · claim a tax certification (D39).
