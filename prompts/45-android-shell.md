# Prompt 45 — Android shell for Sunmi and iMin tills (only if needed)

> Run only if `tools/hardware-test/results/` shows that the web app could not print on a Sunmi or iMin all-in-one till
> (prompt 09) and a client needs that device (D34). Otherwise write "not needed" in STATUS and skip. It can run any time
> after prompt 20 when a pilot needs it. Needs from Yahya: the Sunmi or iMin device to test (docs/14 task 25).

## Goal
The same Café or Resto web app runs inside a small Android app on all-in-one tills, prints on the built-in printer and
opens the drawer, and passes the same hardware test as any other kit.

## Read first
`DECISIONS.md` D17, D23, D24, D29, D30, D34 · `docs/05-devices.md §4, §8, §10` · `docs/research/facts-2026-09.md §B1, §B3,
§B6` · the prompt 09 results for the device · `packages/kit-web` printing transports.

## Do
1. `apps/android-shell/`: a Capacitor 8 project (JavaScript only; pin the versions current at the time, 8.5.2 was the
   core release seen in September 2026) that bundles the built PWA of one product per flavour (`ma.brandhub.cafe`,
   `ma.brandhub.resto`); the same routes, IndexedDB (Dexie) storage and code as the browser.
2. Printing: choose a community Sunmi or iMin printer plugin after reading its code, licence and last release; wrap it
   in a `native` transport in `packages/kit-web/src/print/` selected when `Capacitor.isNativePlatform()`. Latin text as
   ESC/POS bytes or the plugin's text call; Arabic always as the raster image of `packBitmap` (D29); the drawer through
   the printer's pulse.
3. Network: the shell's pages are served from a local origin (`https://localhost`), so every call — to the product
   Worker and to the Station — goes through `CapacitorHttp` (native requests): the Worker sees no cross-origin request,
   the session cookie rules of docs/08 §1 hold, and the Station is reachable over plain HTTP. Android's network security
   config cannot scope cleartext to private ranges, so it permits cleartext and the app's HTTP layer refuses any
   `http://` URL that is not a private IPv4 address (10/8, 172.16/12, 192.168/16), tested. Test login, sync and
   printing inside the shell.
4. Updates: signed APKs published to R2 with their SHA-256; the app checks the product Worker for a new version and
   installs only when every bank on the device is closed (D46); BrandHub installs the first version at the venue. No
   store publication in this prompt.
5. `docs/05-devices.md §9`: add the device as a kit only after it passes the full hardware test.

## Constraints
One code base: no screen or rule written only for the shell. The shell adds no new permission beyond printing, network
and installing its own updates.

## Acceptance checks (run them, paste the output)
1. On the device: the 9 steps of `docs/05-devices.md §8`, recorded in `tools/hardware-test/results/<device>.md`.
2. Unit test: the HTTP guard accepts `http://192.168.1.20:17800` and refuses `http://example.com` and `http://8.8.8.8`.
3. `npm run gate`; the APK's SHA-256 matches the value published by the Worker.

## Release
If built: tag `android-v1.0.0`; the CI job builds and signs the APK with a key kept as a CI secret (never in the
repository, never printed) and uploads it to R2 with its SHA-256.

## Update docs/STATUS.md
Row 45; "not needed", or the device, plugin and versions used.

## Commit
`feat(android): Capacitor shell for Sunmi and iMin with native printing`
