# Prompt 42 — Camera link: ticket text on the NVR recording

> Run from Tue 6 Jul 2027 (V2), after `resto-v1.1.0`. Kit module `camera_link`, both products, through the Station.
> Needs from Yahya: access to a Hikvision NVR with POS support for the real test (a client's or a borrowed one, docs/14
> task 24). Without it, finish with the simulator and mark the real test "not run" in STATUS.

## Goal
Every receipt, void, drawer opening without a sale and reprint appears as text on the camera recording of the till that
made it, so the owner finds the video of ticket C1-000123 or of a drawer opening in seconds on his own recorder.

## Read first
`DECISIONS.md` D13, D24, D33 · `docs/05-devices.md §3, §10` · `docs/research/facts-2026-09.md §B4` ·
`packages/kit/src/escpos.js` (`encodeCp1252`, for the encoding pattern) · the Station code of prompt 08.

## Do
1. What the NVR supports (Hikvision manual, confirmed pages): POS protocols Universal Protocol, EPSON, AVE and NUCLEUS;
   connection by TCP, UDP, multicast, RS-232, USB-to-RS-232 or sniffing; for TCP and UDP a port from 1 to 65535, unique
   per POS, and an "allowed remote IP address" (the Station's); overlay text in Latin-1 only, scrolling or page mode,
   display time and POS event timeout of 5–3600 s, and privacy masking. Use Universal Protocol over TCP (UDP as an
   option); write down the exact fields your NVR's firmware shows in `docs/research/nvr-<model>.md`.
2. Station module `nvr/`: one sender per till or phone, mapped in `/gestion → Appareils → Caméra` (NVR address,
   protocol, the port of each device, the camera channel the owner linked on the NVR); a "Envoyer un test" button.
3. Text blocks built from stored events (never from the screen): a start marker, then lines of at most the configured
   width (default 32) — `C1-000123 12:41 SARA`, `2 x CAFÉ NOIR 20,00`, `TOTAL 25,00 ESPÈCES`; `ANNULATION LIGNE …
   VALIDÉ KARIM`; `TIROIR SANS VENTE … VALIDÉ KARIM`; `RÉIMPRESSION C1-000123` — then an end marker. Latin-1 only: French
   names with their accents (É, È and À exist in Latin-1), other characters transliterated (œ → oe, ’ → '); a product
   with an Arabic name only is shown by its product code; amounts with the decimal comma.
4. Best effort: a queue per NVR with a 10-minute limit; beyond it, blocks are dropped and counted ("12 textes non
   envoyés"); a sale is never delayed or refused because of the camera link.
5. `/gestion`: every receipt, void, drawer opening and reprint shows "Caméra 2 · 12:41:07" (channel and Station time) so
   the owner can search his NVR by time or by text; a note in the setup guide asks for NTP on the NVR so clocks agree.
6. `tools/nvr-sim/`: a small TCP and UDP listener that logs what it receives with timestamps; used by the tests.
7. Setup guide `docs/guides/camera-link.md` (French, with the Arabic summary): enable POS on the NVR, choose Universal
   Protocol, set the port and allowed IP, link the POS to the camera channel, set the overlay, test.

## Constraints
No customer data in the text (no name, phone or address); staff appear by the first name printed on receipts. The
video system is the client's: the setup guide reminds him of his CNDP formality for it (docs/11 §11 item 13). Dahua and
other brands wait until their protocol is checked on real hardware. The Station sends; it never reads video.

## Acceptance checks (run them, paste the output)
1. With `tools/nvr-sim`: a sale, a void after sending, a drawer opening without a sale and a reprint produce the expected
   blocks, in order, each within 1 s of the event being stored, with Latin-1 bytes only (test on "Crème brûlée", "œufs"
   and an Arabic-only product name).
2. The simulator stopped for 15 minutes during sales: sales continue; the dropped count is right; blocks resume after.
3. A real NVR (model and firmware in STATUS): the ticket text shows on the recording and the NVR's text search finds
   `C1-000123`; or "not run — needs hardware".
4. `npm run gate`.

## Release
Café V2 is complete with this prompt (the Café parts of prompts 39–41 and the camera link): tag `cafe-v2.0.0` in the
release window (D46), then switch the modules on per client through the licence.

## Update docs/STATUS.md
Row 42; NVR models tested; the firmware's field names; the `cafe-v2.0.0` tag and date.

## Commit
`feat(station): camera link sends ticket text to the NVR POS overlay`
