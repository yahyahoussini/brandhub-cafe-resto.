// @ts-check
/**
 * ESC/POS byte builder for 58 and 80 mm thermal printers (Epson TM-T20III, Xprinter and clones).
 * Pure: produces a Uint8Array; transports (WebUSB, Web Serial, TCP 9100 on the Station) only send it.
 *
 * Latin text goes out in a single-byte code page (Windows-1252 layout for 0x80–0xFF).
 * Arabic never goes out as text: render it to a bitmap and send it with raster() (docs/05-devices.md §4),
 * because Arabic code pages differ between printer models and do not shape letters.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Windows-1252 bytes 0x80–0x9F for the characters French receipts use. */
const CP1252_HIGH = new Map([
  ["€", 0x80], ["‚", 0x82], ["„", 0x84], ["…", 0x85], ["‹", 0x8b], ["Œ", 0x8c],
  ["‘", 0x91], ["’", 0x92], ["“", 0x93], ["”", 0x94], ["•", 0x95], ["–", 0x96],
  ["—", 0x97], ["›", 0x9b], ["œ", 0x9c], ["Ÿ", 0x9f],
]);

/**
 * Encode text as Windows-1252; characters outside it become "?".
 * Narrow and normal no-break spaces become spaces; U+2212 (minus) becomes "-".
 * @param {string} s
 * @returns {number[]}
 */
export function encodeCp1252(s) {
  /** @type {number[]} */
  const out = [];
  for (const ch of s) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    if (ch === " " || ch === " ") out.push(0x20);
    else if (ch === "−") out.push(0x2d);
    else if (cp < 0x80) out.push(cp);
    else if (cp >= 0xa0 && cp <= 0xff) out.push(cp);
    else if (CP1252_HIGH.has(ch)) out.push(/** @type {number} */ (CP1252_HIGH.get(ch)));
    else out.push(0x3f);
  }
  return out;
}

/**
 * True when a string contains Arabic letters (these must be printed as a raster image).
 * @param {string} s
 */
export function hasArabic(s) {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u.test(s);
}

export class EscPos {
  /**
   * @param {{ codePage?: number }} [opts] codePage: the printer's ESC t number for Windows-1252
   *   (16 on Epson; check data/printer-profiles.json for other models).
   */
  constructor(opts = {}) {
    /** @type {number[]} */
    this.buf = [];
    this.codePage = opts.codePage ?? 16;
  }

  /** ESC @ then select the code page. */
  init() {
    this.buf.push(ESC, 0x40, ESC, 0x74, this.codePage);
    return this;
  }

  /** @param {string} s */
  text(s) {
    if (hasArabic(s)) throw new RangeError("Arabic text must be rendered with raster()");
    this.buf.push(...encodeCp1252(s));
    return this;
  }

  /** @param {string} [s] */
  line(s = "") {
    if (s) this.text(s);
    this.buf.push(LF);
    return this;
  }

  /** @param {boolean} on */
  bold(on) {
    this.buf.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** @param {"left" | "center" | "right"} a */
  align(a) {
    const n = { left: 0, center: 1, right: 2 }[a];
    if (n === undefined) throw new RangeError("align must be left, center or right");
    this.buf.push(ESC, 0x61, n);
    return this;
  }

  /**
   * Character size, 1–8 times in each direction.
   * @param {number} width
   * @param {number} height
   */
  size(width = 1, height = 1) {
    for (const v of [width, height]) if (!Number.isInteger(v) || v < 1 || v > 8) throw new RangeError("size must be 1..8");
    this.buf.push(GS, 0x21, ((width - 1) << 4) | (height - 1));
    return this;
  }

  /** @param {number} lines */
  feed(lines = 1) {
    if (!Number.isInteger(lines) || lines < 0 || lines > 255) throw new RangeError("feed must be 0..255");
    this.buf.push(ESC, 0x64, lines);
    return this;
  }

  /** Feed to the cutter and cut (partial cut; full cut on printers that only do full). */
  cut() {
    this.buf.push(GS, 0x56, 0x42, 0x00);
    return this;
  }

  /**
   * Cash drawer pulse: ESC p m t1 t2, times in 2 ms units.
   * @param {0 | 1} pin 0 = connector pin 2, 1 = pin 5
   * @param {number} onMs
   * @param {number} offMs
   */
  drawer(pin = 0, onMs = 100, offMs = 250) {
    const t1 = Math.min(255, Math.max(1, Math.round(onMs / 2)));
    const t2 = Math.min(255, Math.max(t1, Math.round(offMs / 2)));
    this.buf.push(ESC, 0x70, pin, t1, t2);
    return this;
  }

  /**
   * Raster bit image (GS v 0), sent in bands of at most 256 rows.
   * @param {{ width: number, height: number, data: Uint8Array }} bitmap 1 bit per pixel, rows padded to
   *   whole bytes, most significant bit first, 1 = black. Build it with packBitmap().
   */
  raster(bitmap) {
    const bytesPerRow = Math.ceil(bitmap.width / 8);
    if (bitmap.data.length !== bytesPerRow * bitmap.height) throw new RangeError("bitmap size does not match width × height");
    const BAND = 256;
    for (let y = 0; y < bitmap.height; y += BAND) {
      const rows = Math.min(BAND, bitmap.height - y);
      this.buf.push(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff);
      const start = y * bytesPerRow;
      for (let i = start; i < start + rows * bytesPerRow; i++) this.buf.push(bitmap.data[i]);
    }
    return this;
  }

  /**
   * QR code, model 2 (GS ( k). Used for the receipt check link and the menu.
   * @param {string} data ASCII (URLs)
   * @param {number} moduleSize 1..16
   */
  qr(data, moduleSize = 6) {
    const bytes = encodeCp1252(data);
    if (bytes.length > 700) throw new RangeError("QR data too long");
    const store = bytes.length + 3;
    this.buf.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
    this.buf.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.min(16, Math.max(1, moduleSize))); // size
    this.buf.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // error correction M
    this.buf.push(GS, 0x28, 0x6b, store & 0xff, (store >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes); // store
    this.buf.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // print
    return this;
  }

  /** @returns {Uint8Array} */
  bytes() {
    return Uint8Array.from(this.buf);
  }
}

/**
 * Pack RGBA pixels (e.g. canvas ImageData) into a 1-bit raster: luminance below threshold = black.
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray | Uint8Array} rgba
 * @param {number} [threshold] 0..255
 */
export function packBitmap(width, height, rgba, threshold = 160) {
  if (rgba.length !== width * height * 4) throw new RangeError("rgba length must be width × height × 4");
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = rgba[i + 3] / 255;
      const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha + 255 * (1 - alpha);
      if (lum < threshold) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data };
}

/**
 * Columns for a receipt line: name on the left, amount on the right, within `width` characters
 * (48 on 80 mm with font A, 32 on 58 mm). Long names wrap onto following lines.
 * @param {string} left
 * @param {string} right
 * @param {number} width
 * @returns {string[]}
 */
export function twoColumns(left, right, width = 48) {
  const room = width - right.length - 1;
  if (room < 8) throw new RangeError("line too narrow");
  /** @type {string[]} */
  const lines = [];
  let rest = left;
  while (rest.length > room) {
    let cut = rest.lastIndexOf(" ", room);
    if (cut <= 0) cut = room;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  lines.push(rest.padEnd(room) + " " + right);
  return lines;
}
