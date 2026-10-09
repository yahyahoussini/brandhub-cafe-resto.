// @ts-check
/**
 * i18n runtime of both products (D11, docs/07 §7): French by default, Arabic right to left per user, Western digits by
 * default with an Arabic-Indic option per user. Messages are nested JSON (`fr.json`, `ar.json`, plus each app's own
 * files added with `addMessages`); a value is a string or a plural object keyed by the CLDR categories of the
 * language (`one`, `other`; Arabic also `zero`, `two`, `few`, `many`). `{name}` is replaced by `params.name`, and the
 * plural form is chosen by `params.count`.
 *
 * The locale and the digits are signals: a Preact component that calls `t()` re-renders when they change.
 */
import { signal } from "@preact/signals";
import { formatAmount as kitFormatAmount } from "@brandhub/kit/money";
import fr from "./fr.json" with { type: "json" };
import ar from "./ar.json" with { type: "json" };

/** @typedef {"fr" | "ar"} Locale */
/** @typedef {"latn" | "arab"} Digits */
/** @typedef {string | { [category: string]: string }} Message */
/** @typedef {{ [key: string]: Message | Messages }} Messages */

/** @type {readonly Locale[]} */
export const LOCALES = ["fr", "ar"];
export const DEFAULT_LOCALE = /** @type {Locale} */ ("fr");
export const PLURAL_CATEGORIES = /** @type {const} */ (["zero", "one", "two", "few", "many", "other"]);

export const locale = signal(DEFAULT_LOCALE);
export const digits = signal(/** @type {Digits} */ ("latn"));

/** @type {Record<Locale, Map<string, Message>>} */
const catalog = { fr: new Map(), ar: new Map() };

/**
 * A plural object has only plural categories as keys, and always `other`.
 * @param {unknown} v
 * @returns {v is Record<string, string>}
 */
export function isPlural(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.includes("other") && keys.every((k) => /** @type {readonly string[]} */ (PLURAL_CATEGORIES).includes(k));
}

/**
 * Flattens nested messages to dotted keys (`sync.pending`).
 * @param {Messages} messages
 * @param {string} [prefix]
 * @returns {[string, Message][]}
 */
export function flatten(messages, prefix = "") {
  /** @type {[string, Message][]} */
  const out = [];
  for (const [k, v] of Object.entries(messages)) {
    if (k.startsWith("$")) continue; // "$comment"
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || isPlural(v)) out.push([key, /** @type {Message} */ (v)]);
    else out.push(...flatten(/** @type {Messages} */ (v), key));
  }
  return out;
}

/**
 * Adds messages for a locale (the kit's shared strings are loaded already; each app adds its own).
 * @param {Locale} loc
 * @param {Messages} messages
 */
export function addMessages(loc, messages) {
  for (const [k, v] of flatten(messages)) catalog[loc].set(k, v);
}

addMessages("fr", /** @type {Messages} */ (fr));
addMessages("ar", /** @type {Messages} */ (ar));

/**
 * @param {string} l
 * @returns {l is Locale}
 */
export function isLocale(l) {
  return /** @type {readonly string[]} */ (LOCALES).includes(l);
}

/**
 * Switches the language; in a browser, also sets `lang` and `dir` on <html>.
 * @param {Locale} l
 */
export function setLocale(l) {
  if (!isLocale(l)) throw new RangeError(`unknown locale ${l}`);
  locale.value = l;
  if (typeof document !== "undefined") {
    document.documentElement.lang = l;
    document.documentElement.dir = dir(l);
  }
}

/**
 * Western (`latn`, default) or Arabic-Indic (`arab`) digits, a per-user option (D11).
 * @param {Digits} d
 */
export function setDigits(d) {
  if (d !== "latn" && d !== "arab") throw new RangeError(`unknown digits ${d}`);
  digits.value = d;
}

/**
 * @param {Locale} [l]
 * @returns {"ltr" | "rtl"}
 */
export function dir(l = locale.value) {
  return l === "ar" ? "rtl" : "ltr";
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

/**
 * Applies the user's digits to a string of Western digits.
 * @param {string} s
 * @param {Digits} [d]
 */
export function localizeDigits(s, d = digits.value) {
  return d === "arab" ? s.replace(/[0-9]/g, (c) => ARABIC_INDIC[Number(c)]) : s;
}

/**
 * @param {number} n
 */
export function formatNumber(n) {
  return localizeDigits(String(n));
}

/**
 * An amount in centimes, formatted by the kit (`25,00 DH`, `25,00 درهم`) in the user's digits. Display it inside an
 * element with `dir="ltr"` (the `Amount` component does).
 * @param {number} centimes
 * @param {Locale} [l]
 */
export function formatAmount(centimes, l = locale.value) {
  return localizeDigits(kitFormatAmount(centimes, l));
}

/** @type {Map<Locale, Intl.PluralRules>} */
const pluralRules = new Map();

/**
 * @param {number} count
 * @param {Locale} [l]
 */
export function pluralCategory(count, l = locale.value) {
  let rules = pluralRules.get(l);
  if (!rules) {
    rules = new Intl.PluralRules(l);
    pluralRules.set(l, rules);
  }
  return rules.select(count);
}

/**
 * Translates a key. Falls back to French, then to the key itself (the i18n check makes that impossible in a build).
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const l = locale.value;
  const msg = catalog[l].get(key) ?? catalog.fr.get(key);
  if (msg === undefined) return key;
  let text;
  if (typeof msg === "string") text = msg;
  else {
    const count = Number(params.count ?? 0);
    text = msg[pluralCategory(count, l)] ?? msg.other;
  }
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    const v = params[name];
    if (v === undefined) return whole;
    return typeof v === "number" ? formatNumber(v) : v;
  });
}

/**
 * Whether a key exists (for components that show an optional line).
 * @param {string} key
 */
export function has(key) {
  return catalog[locale.value].has(key) || catalog.fr.has(key);
}
