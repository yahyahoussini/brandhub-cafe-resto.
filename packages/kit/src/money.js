// @ts-check
/**
 * Money rules shared by BrandHub Café, BrandHub Resto and the Station.
 *
 * - Every amount is an integer number of centimes of MAD (1 DH = 100 centimes).
 * - Prices are TTC (VAT included), as Moroccan customers see them.
 * - VAT rates are basis points: 1000 = 10 %, 2000 = 20 %.
 * - Rounding is half away from zero, done once per line (see docs/03-domain-model.md §3).
 *
 * No floating point touches an amount after parsing.
 */

/** @typedef {number} Centimes integer, may be negative for refunds */

/**
 * @param {unknown} n
 * @param {string} [name]
 * @returns {asserts n is number}
 */
export function assertCentimes(n, name = "amount") {
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    throw new TypeError(`${name} must be an integer number of centimes, got ${String(n)}`);
  }
}

/**
 * @param {unknown} bp
 * @returns {asserts bp is number}
 */
export function assertRateBp(bp) {
  if (typeof bp !== "number" || !Number.isInteger(bp) || bp < 0 || bp > 10000) {
    throw new RangeError(`VAT rate must be an integer between 0 and 10000 basis points, got ${String(bp)}`);
  }
}

/**
 * Integer division rounded half away from zero.
 * @param {number} numerator safe integer
 * @param {number} denominator safe integer, not 0
 * @returns {number}
 */
export function divRound(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new TypeError("divRound expects safe integers");
  }
  if (denominator === 0) throw new RangeError("division by zero");
  const negative = (numerator < 0) !== (denominator < 0) && numerator !== 0;
  const a = Math.abs(numerator);
  const b = Math.abs(denominator);
  const q = Math.floor(a / b);
  const r = a - q * b;
  const rounded = r * 2 >= b ? q + 1 : q;
  return negative ? -rounded : rounded;
}

/**
 * Parse what a person typed ("12", "12,5", "12.50", "1 234,50 DH") into centimes.
 * Rejects more than two decimals and anything that is not a plain amount.
 * @param {string | number} input
 * @returns {Centimes}
 */
export function parseAmount(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new RangeError("amount must be finite");
    const c = Math.round(input * 100);
    if (Math.abs(c - input * 100) > 1e-6) throw new RangeError("at most two decimals");
    assertCentimes(c);
    return c;
  }
  const s = String(input)
    .trim()
    .replace(/[\s  ]/g, "")
    .replace(/(DH|MAD|درهم|د\.م\.)$/iu, "");
  const m = /^([-−])?(\d+)(?:[.,](\d{1,2}))?$/u.exec(s);
  if (!m) throw new RangeError(`not an amount: "${String(input)}"`);
  const [, sign, whole, frac = ""] = m;
  const c = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(c)) throw new RangeError("amount too large");
  return sign ? -c : c;
}

/**
 * Display an amount: "1 234,50 DH" (fr) or "1 234,50 درهم" (ar). Western digits by default.
 * @param {Centimes} c
 * @param {"fr" | "ar"} [locale]
 * @returns {string}
 */
export function formatAmount(c, locale = "fr") {
  assertCentimes(c);
  const negative = c < 0;
  const a = Math.abs(c);
  const whole = Math.floor(a / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const frac = String(a % 100).padStart(2, "0");
  const s = `${negative ? "−" : ""}${whole},${frac}`;
  return locale === "ar" ? `${s} درهم` : `${s} DH`;
}

/**
 * VAT contained in a TTC amount: total − round(total × 10000 / (10000 + rate)).
 * Works for negative amounts (credit notes) with the same rounding rule.
 * @param {Centimes} totalTTC
 * @param {number} rateBp
 * @returns {Centimes}
 */
export function vatIncluded(totalTTC, rateBp) {
  assertCentimes(totalTTC, "totalTTC");
  assertRateBp(rateBp);
  if (rateBp === 0) return 0;
  const net = divRound(totalTTC * 10000, 10000 + rateBp);
  return totalTTC - net;
}

/**
 * Split a total over weights with the largest-remainder method.
 * The parts always sum exactly to the total. Weights are non-negative safe integers.
 * With all weights at 0, the total is split evenly.
 * @param {Centimes} total
 * @param {number[]} weights
 * @returns {Centimes[]}
 */
export function allocate(total, weights) {
  assertCentimes(total, "total");
  if (!Array.isArray(weights) || weights.length === 0) throw new RangeError("weights required");
  weights.forEach((w, i) => {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`weight ${i} must be a non-negative integer`);
  });
  const sumW = weights.reduce((acc, w) => acc + w, 0);
  if (sumW === 0) return allocate(total, weights.map(() => 1));
  const sign = total < 0 ? -1n : 1n;
  const T = BigInt(Math.abs(total));
  const S = BigInt(sumW);
  const parts = weights.map((w) => (T * BigInt(w)) / S);
  let rest = T - parts.reduce((acc, p) => acc + p, 0n);
  const order = weights
    .map((w, i) => ({ i, r: (T * BigInt(w)) % S }))
    .sort((x, y) => (y.r > x.r ? 1 : y.r < x.r ? -1 : x.i - y.i));
  for (let k = 0; rest > 0n; k++, rest--) parts[order[k].i] += 1n;
  return parts.map((p) => Number(p * sign));
}

/**
 * Split a total into n near-equal parts (for "split the bill in n").
 * @param {Centimes} total
 * @param {number} n
 * @returns {Centimes[]}
 */
export function splitEvenly(total, n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  return allocate(total, Array.from({ length: n }, () => 1));
}

/**
 * Discount on a base amount.
 * percent: value in basis points (1000 = 10 %); amount: value in centimes.
 * The result is never negative and never above the base.
 * @param {Centimes} base
 * @param {{ kind: "percent" | "amount", value: number }} discount
 * @returns {Centimes}
 */
export function discountAmount(base, discount) {
  assertCentimes(base, "base");
  if (base <= 0) return 0;
  if (discount.kind === "percent") {
    if (!Number.isInteger(discount.value) || discount.value < 0 || discount.value > 10000) {
      throw new RangeError("percent discount must be 0..10000 basis points");
    }
    return Math.min(base, divRound(base * discount.value, 10000));
  }
  if (discount.kind === "amount") {
    assertCentimes(discount.value, "discount");
    if (discount.value < 0) throw new RangeError("discount cannot be negative");
    return Math.min(base, discount.value);
  }
  throw new RangeError(`unknown discount kind: ${String(/** @type {any} */ (discount).kind)}`);
}

/**
 * Line total TTC for a unit price and a quantity in thousandths (1000 = 1 unit).
 * @param {Centimes} unitCentimes
 * @param {number} qtyMilli safe integer, negative for credit-note lines
 * @returns {Centimes}
 */
export function lineTotal(unitCentimes, qtyMilli) {
  assertCentimes(unitCentimes, "unitCentimes");
  if (!Number.isSafeInteger(qtyMilli) || qtyMilli === 0) throw new RangeError("qtyMilli must be a non-zero integer");
  return divRound(unitCentimes * qtyMilli, 1000);
}

/**
 * Cash change for a tendered amount.
 * @param {Centimes} due
 * @param {Centimes} tendered
 * @returns {Centimes}
 */
export function changeDue(due, tendered) {
  assertCentimes(due, "due");
  assertCentimes(tendered, "tendered");
  if (tendered < due) throw new RangeError("tendered is below the amount due");
  return tendered - due;
}
