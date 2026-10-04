# 05 · Devices — pairing, printing, screens, drawer, clocks, cameras, hardware test

Facts behind this file (browser APIs, printer interfaces, protocols) with sources: `docs/research/facts-2026-09.md §B`.

## 1. Device kinds
| Kind | App route | Typical hardware | Needs |
|---|---|---|---|
| `till` | `/caisse` | Android tablet 10–11" or Windows touch PC | receipt prefix `C1…`, a printer, a drawer |
| `phone` | `/serveur` | the waiter's Android phone | receipt prefix `S1…`, the Station or the internet to print |
| `screen` | `/ecran` | Android tablet, or a TV with an Android box that runs Chrome 142 or later (many TV boxes have no Chrome: check before buying) | a station key (bar, chaud, froid, grill, pizza, pâtisserie) |
| `station` | Station app | Windows mini-PC or the counter PC, wired to the router | UPS; DHCP reservation |
| `office` | `/gestion` | the owner's phone or any browser | nothing local; not a paired device, an owner session |

## 2. Pairing
1. In `/gestion → Appareils → Ajouter`, the owner or manager picks the kind, a name ("Caisse 1", "Téléphone Ali",
   "Écran bar") and, for a screen, its station. The limit of the plan is checked here (docs/01 §5).
2. The back office shows a QR code and a 6-digit code, valid 10 minutes, single use.
3. On the device, `cafe.brandhub.ma/appairer` (or `resto.`) scans the QR (`BarcodeDetector`, else the code is typed).
4. The device receives its token (docs/04 §1), its prefix and settings, requests persistent storage, downloads the
   catalog, staff and licence, and shows "Appareil prêt".
5. With a Station, the device then scans the QR shown in the Station window, which carries the Station's LAN address, and
   grants Chrome's local-network permission when asked.
Revoking (`Appareils → Révoquer`) takes effect at the device's next contact (docs/04 §9 for offline cases).

## 3. The Station
Windows app (Electron with its embedded Node, better-sqlite3 rebuilt with `@electron/rebuild`), one per venue:
- starts with Windows, single instance, restarts itself after a crash; a tray icon and a status window (online/offline,
  last cloud contact, pending events, devices seen in the last 5 minutes, printers with their last job, "Imprimer un test");
- LAN API on port 17800 (docs/04 §7); ZKTeco receiver on port 8081 (§7); logs 30 days, exportable by the manager;
- installer built with electron-builder (NSIS). Until a code-signing certificate is bought, Windows SmartScreen warns at
  installation: BrandHub installs it, never the client alone;
- updates: the status window offers a new version only when every bank is closed (D46); the installer is fetched from
  R2 and its SHA-256 is checked against the value published by the product Worker.

## 4. Printing (`packages/kit/src/escpos.js`, D29)
**Documents.** Receipt (ticket de caisse), pre-bill ("NOTE — ne vaut pas ticket de caisse"), bar or kitchen ticket,
Z report, test page, reconnection proof ("12 tickets synchronisés, 0 perdu").

**Receipt layout (80 mm, 48 characters; 58 mm, 32).** Business name (double size) · address, phone · legal line(s)
(docs/11 §1) · `Ticket C1-000123` · date and time · cashier or waiter · table and zone · lines `2 x Café noir .. 20,00`
with options indented · discount · `TOTAL TTC` (double size) · `dont TVA 10 % : 9,63` per rate · tenders (`Espèces 50,00`,
`Rendu 25,00`, `Carte réf. 1234`) · footer · "Merci · شكرا لزيارتكم" · QR (digital receipt, V1.1).
`receipt.languages = fr+ar` prints the header and footer in both languages and the lines in `receipt.lineLanguage`.

**Arabic.** Never sent as text. The app (or the Station's renderer window) draws each Arabic line on a canvas with the
bundled IBM Plex Sans Arabic, right-aligned to the printer's width in dots (576 for 80 mm, 384 for 58 mm), packs it with
`packBitmap` and sends it with `raster()`. Latin lines stay text (faster).

**Bar and kitchen tickets.** Large table/zone and order code, waiter, time, lines with options and notes, seat and course;
header "À SUIVRE" for held lines, "ENVOI" when fired, "RÉIMPRESSION" on reprints. Printed by the Station when it stores
`lines.sent`/`lines.fired`; by the till itself when there is no Station.

**Transports.**
| From | To | How |
|---|---|---|
| Android tablet | USB printer | WebUSB: `navigator.usb.requestDevice({ filters: [{ classCode: 7 }] })`, claim the interface, bulk OUT transfer. Printer class 0x07 is not blocked by WebUSB. |
| Android tablet | classic Bluetooth printer | Web Serial over Bluetooth RFCOMM (Chrome 138+): `navigator.serial.requestPort({ allowedBluetoothServiceClassIds: ["00001101-0000-1000-8000-00805f9b34fb"] })` |
| Windows PC in Chrome/Edge | USB/serial printer | prefer the Station; WebUSB needs the WinUSB driver on Windows |
| Station | network printer | TCP port 9100 (`net.Socket`) |
| Station | USB printer | `usb` (libusb; WinUSB driver set with Zadig at installation) or Windows RAW printing to a shared printer |
| Station | serial / Bluetooth COM port | `serialport` |
Web Bluetooth is BLE only and not used for printers. No web page can open port 9100 (Direct Sockets are limited to
Isolated Web Apps on managed ChromeOS).

**Printer profiles.** `data/printer-profiles.json`: paper width, characters per line, dots, the ESC t number for
Windows-1252, cut command, drawer pins, known interfaces. Values marked `verified: false` are confirmed by the hardware test.

**Queue.** Every print is a job (`print_jobs` on the Station, an in-memory queue on a tablet): retried 3 times, then shown
as "Imprimante hors ligne" with a reprint button (a reprint of a receipt is counted, D38).

## 5. Cash drawer
Opened by the printer's pulse (`drawer()`, pin 2 by default) on a cash payment, when `settings` say so. Any other
opening is `bank.no_sale` with a manager approval. The Z report counts openings without a sale per bank.

## 6. Screens (`/ecran`)
Dark theme; tickets in columns by age; each ticket shows table, code, waiter, time since sent, lines with options, seat
and course. States: new (brand blue) → preparing (warning) → ready (success); late (danger) after 10 min amber and 15
min red by default, per station. Tap to move a ticket forward, long-press to recall, "Tout le jour" shows totals per
dish. Sound and a double flash on a new ticket (reduced-motion respected). Café uses one bar screen (optional); Resto one
screen per station plus an optional pass screen. Screens receive tickets from the Station (long-poll) or the cloud.

## 7. Time clocks (V1.1 Café, V1 Resto; D32)
- PIN clock: on the till or phone, "Pointer" with the staff PIN → `staff.clock`.
- ZKTeco in badge or PIN mode: the clock's "Cloud Server Setting" points to the Station (`http://<ip>:8081`). The Station
  answers the ADMS calls (`/iclock/cdata` handshake and ATTLOG upload, `/iclock/getrequest`, `/iclock/devicecmd`), maps the
  clock's user PIN to `staff.clockId` and writes `staff.clock` events with `source: badge`. A punch whose verify mode
  is fingerprint or face is refused and counted ("mode biométrique refusé") until the clock is switched to badge or PIN.
- Biometric data is never requested, stored or relayed: the Station ignores fingerprint and face templates and the setup
  guide switches the clock to badge or PIN verification (CNDP deliberation 478-2013).

## 8. Hardware test (D30) — run by prompt 09 and before recommending any kit
For each kit, record results in `tools/hardware-test/results/<kit>.md`:
1. Receipt in French and Arabic, legible, Arabic letters joined, correct width.
2. Bar or kitchen ticket on the station printer.
3. The drawer opens on a cash payment, and only then.
4. 50 receipts in a row: none lost, none duplicated; time from "Payer" to the start of printing ≤ 2 s.
5. The printer switched off during a job: the job waits and prints when the printer is back.
6. Bluetooth: the printer switched off and on; the tablet reconnects without re-pairing.
7. Unplug-the-router drill: sell 5 tickets offline, print, plug back; the proof prints and the cloud shows the 5 tickets.
8. Station restart during a service: devices keep selling; kitchen tickets resume.
9. The tablet on battery for a full service (screen timeout 30 min, battery optimisation off for Chrome).
A kit that fails one step is not recommended; the fix is another device, not another architecture.

## 9. Reference kits (candidates until the hardware test passes)
| Kit | Contents | Notes |
|---|---|---|
| Café S (one till) | Android tablet 10–11" (4 GB RAM, Android 12+), 80 mm USB or Bluetooth printer, RJ11 drawer, stand | Epson TM-T20III USB seen at 1,959 MAD (iris.ma) |
| Café M (with waiters) | Café S + Station mini-PC (Intel N100 class, Windows 11, wired) + network bar printer + UPS + 4G router | Epson TM-T20III Ethernet seen at 2,140 MAD (jeshop.ma, Dec 2024); waiters use their phones |
| Resto | Station mini-PC or Windows touch till + 2 network printers (cuisine, bar) + 1–3 kitchen screens + handhelds + UPS + 4G router | screens: 10" tablets, or a TV with an Android box that runs Chrome 142+ |
Tablet and mini-PC prices are checked at purchase; the Innovation Map's ranges were 2,500–6,100 MAD for a café kit and
6,100–13,800 MAD for a restaurant kit.

## 10. Later devices
Camera link (V2, prompt 42): the Station sends ticket text, voids and drawer openings to a Hikvision NVR's POS overlay
(Universal Protocol over TCP or UDP, a unique port per till). Scales (V2) on the Station's serial port. Customer display
(V2). Sunmi/iMin built-in printers: tested in prompt 09 through Bluetooth ("InnerPrinter") with Web Serial; if that fails,
prompt 45 builds the Capacitor shell with a community printer plugin.
