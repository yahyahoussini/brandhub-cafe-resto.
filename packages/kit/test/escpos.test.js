// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeCp1252, EscPos, hasArabic, packBitmap, twoColumns } from "../src/escpos.js";

/** @param {Uint8Array} u8 */
const hex = (u8) => Buffer.from(u8).toString("hex");

test("init selects the Windows-1252 code page", () => {
  assert.equal(hex(new EscPos().init().bytes()), "1b401b7410");
  assert.equal(hex(new EscPos({ codePage: 71 }).init().bytes()), "1b401b7447");
});

test("French text is encoded in one byte per character", () => {
  assert.deepEqual(encodeCp1252("Café crème"), [0x43, 0x61, 0x66, 0xe9, 0x20, 0x63, 0x72, 0xe8, 0x6d, 0x65]);
  assert.deepEqual(encodeCp1252("12,50 €"), [0x31, 0x32, 0x2c, 0x35, 0x30, 0x20, 0x80]);
  assert.deepEqual(encodeCp1252("1 234"), [0x31, 0x20, 0x32, 0x33, 0x34]);
});

test("Arabic text is refused as text (must be a raster image)", () => {
  assert.ok(hasArabic("شكرا لزيارتكم"));
  assert.ok(!hasArabic("Merci"));
  assert.throws(() => new EscPos().text("شكرا"), RangeError);
});

test("drawer kick on pin 2 with default timing", () => {
  assert.equal(hex(new EscPos().drawer().bytes()), "1b7000327d");
  assert.equal(hex(new EscPos().drawer(1, 50, 100).bytes()), "1b70011932");
});

test("cut, feed, bold, align, size", () => {
  const b = new EscPos().bold(true).align("center").size(2, 2).line("TOTAL").feed(3).cut().bytes();
  assert.equal(hex(b), "1b4501" + "1b6101" + "1d2111" + "544f54414c0a" + "1b6403" + "1d564200");
});

test("raster image header and bands of 256 rows", () => {
  const width = 16;
  const height = 300;
  const data = new Uint8Array((width / 8) * height).fill(0xff);
  const bytes = new EscPos().raster({ width, height, data }).bytes();
  assert.equal(hex(bytes.slice(0, 8)), "1d76300002000001");
  const second = 8 + 2 * 256;
  assert.equal(hex(bytes.slice(second, second + 8)), "1d76300002002c00");
  assert.equal(bytes.length, 8 + 512 + 8 + 88);
});

test("packBitmap turns dark pixels into set bits", () => {
  const w = 10;
  const h = 1;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const x of [0, 9]) rgba.set([0, 0, 0, 255], x * 4);
  const bmp = packBitmap(w, h, rgba);
  assert.deepEqual([...bmp.data], [0b10000000, 0b01000000]);
});

test("QR store length counts the payload plus 3", () => {
  const b = new EscPos().qr("https://cafe.brandhub.ma/r/7F3K-2Q").bytes();
  const url = "https://cafe.brandhub.ma/r/7F3K-2Q";
  const storeAt = 9 + 8 + 8;
  assert.deepEqual([...b.slice(storeAt, storeAt + 8)], [0x1d, 0x28, 0x6b, (url.length + 3) & 0xff, 0x00, 0x31, 0x50, 0x30]);
});

test("twoColumns wraps long names and right-aligns amounts", () => {
  const lines = twoColumns("2 x Jus d'orange pressé avec glaçons", "36,00", 32);
  assert.ok(lines.length >= 2);
  lines.forEach((l) => assert.ok(l.length <= 32));
  assert.ok(lines[lines.length - 1].endsWith(" 36,00"));
  assert.equal(twoColumns("Café noir", "10,00", 32)[0], "Café noir".padEnd(26) + " 10,00");
});
