# Prompt 09 — Printing, cash drawer and the hardware test

> Run after prompt 08. Needs from Yahya: the reference kit, or pilot 1's hardware (docs/14 task 6).

## Goal
Receipts, bar and kitchen tickets print in French and Arabic from a tablet or through the Station, the drawer opens only
when it should, and the hardware test decides which kits BrandHub recommends.

## Read first
`docs/05-devices.md §4–§5, §8–§10` · `DECISIONS.md` D29, D30, D34 · `packages/kit/src/escpos.js` and tests ·
`data/printer-profiles.json` · `docs/11-compliance.md §1`.

## Do
1. `packages/kit-web/src/print/documents.js`: layout functions for the receipt, pre-bill, bar/kitchen ticket, Z, test
   page and reconnection proof, producing a document model (lines, sizes, alignment, language) from kit data; width from
   the profile (48/32 characters, 576/384 dots).
2. `packages/kit-web/src/print/render.js`: document model → ESC/POS bytes with `EscPos`; Latin lines as text; Arabic lines
   drawn on an `OffscreenCanvas` with the bundled IBM Plex Sans Arabic, right-aligned, packed with `packBitmap`, sent with
   `raster()`. The Station reuses this renderer in a hidden window.
3. Transports: `webusb.js` (class 7 filter, claim, bulk OUT, reconnect) and `webserial-bt.js` (RFCOMM service id of
   docs/05 §4) in kit-web; on the Station, TCP 9100 (`net`), USB (`usb`), COM (`serialport`) and Windows RAW to a shared
   printer. Remember the user's device choice; retry 3 times; then "Imprimante hors ligne" with reprint.
4. Printers in `/gestion/appareils`: add a printer (profile, transport, address), routes by category/station
   (`printing.routes`), test page. Drawer pulse on cash payments only when the setting says so.
5. The Station prints kitchen and bar tickets when it stores `lines.sent` / `lines.fired` (docs/04 §7).
6. `tools/hardware-test/`: a guided page (`/dev/hardware-test`) that runs the 9 steps of docs/05 §8 and writes
   `tools/hardware-test/results/<kit>.md`; update `verified` and code pages in `data/printer-profiles.json` from the results.

## Constraints
Arabic is never sent as text to a printer. Reprints of receipts are counted (`bank.reprint`). No printer brand is
recommended until its test passes.

## Acceptance checks (run them, paste the output)
1. Byte snapshots for a fixed receipt (French) and a kitchen ticket; the Arabic raster test in Playwright (canvas output
   dimensions and a checksum).
2. The hardware test result file for at least one kit, with each step pass/fail and the time from "Payer" to printing.
3. `npm run gate`.

## Update docs/STATUS.md
Row 09; recommended kits (only those that passed); Sunmi/iMin result (decides prompt 45).

## Commit
`feat(print): receipts and tickets in French and Arabic, transports, drawer, hardware test`
