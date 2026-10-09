// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMessages,
  dir,
  flatten,
  formatAmount,
  isPlural,
  localizeDigits,
  pluralCategory,
  setDigits,
  setLocale,
  t,
} from "../src/i18n/index.js";

test.afterEach(() => {
  setLocale("fr");
  setDigits("latn");
});

test("French by default, glossary terms in both languages, Arabic right to left", () => {
  assert.equal(t("term.till"), "Caisse");
  assert.equal(dir(), "ltr");
  setLocale("ar");
  assert.equal(t("term.till"), "الصندوق");
  assert.equal(dir(), "rtl");
});

test("plural forms follow the language: French one/other, Arabic six categories", () => {
  assert.equal(t("sync.offline", { count: 1 }), "Hors ligne depuis 1 min");
  assert.equal(t("sync.offline", { count: 12 }), "Hors ligne depuis 12 min");
  setLocale("ar");
  assert.equal(pluralCategory(1), "one");
  assert.equal(pluralCategory(2), "two");
  assert.equal(pluralCategory(10), "few");
  assert.equal(pluralCategory(12), "many");
  assert.equal(t("sync.offline", { count: 1 }), "بدون اتصال منذ دقيقة واحدة");
  assert.equal(t("sync.offline", { count: 2 }), "بدون اتصال منذ دقيقتين");
  assert.equal(t("sync.offline", { count: 10 }), "بدون اتصال منذ 10 دقائق");
  assert.equal(t("sync.offline", { count: 12 }), "بدون اتصال منذ 12 دقيقة");
});

test("amounts come from the kit; Arabic-Indic digits are a per-user option (D11)", () => {
  assert.equal(formatAmount(10600), "106,00 DH");
  assert.equal(formatAmount(-500), "−5,00 DH");
  setLocale("ar");
  assert.equal(formatAmount(10600), "106,00 درهم");
  setDigits("arab");
  assert.equal(formatAmount(10600), "١٠٦٫٠٠ درهم");
  assert.equal(formatAmount(125050), "١٬٢٥٠٫٥٠ درهم");
  assert.equal(formatAmount(-500), "−٥٫٠٠ درهم");
  assert.equal(t("sync.pending", { count: 3 }), "في الانتظار: ٣");
  assert.equal(localizeDigits("C1-000001", "latn"), "C1-000001");
});

test("a French fallback keeps the French plural rule", () => {
  addMessages("fr", { probe: { digits: { one: "{count} chiffre saisi", other: "{count} chiffres saisis" } } });
  setLocale("ar");
  assert.equal(t("probe.digits", { count: 0 }), "0 chiffre saisi");
  assert.equal(t("probe.digits", { count: 3 }), "3 chiffres saisis");
});

test("unknown keys fall back to French, then to the key", () => {
  addMessages("fr", { only: { fr: "Seulement en français" } });
  setLocale("ar");
  assert.equal(t("only.fr"), "Seulement en français");
  assert.equal(t("does.not.exist"), "does.not.exist");
});

test("placeholders are replaced; missing ones stay visible", () => {
  assert.equal(t("pin.entered", { count: 2, length: 4 }), "2 chiffres saisis sur 4");
  assert.equal(t("pin.entered", { count: 1 }), "1 chiffre saisi sur {length}");
});

test("flatten keeps plural objects whole and skips $comment", () => {
  const flat = new Map(flatten({ $comment: "x", a: { b: "c", n: { one: "1", other: "n" } } }));
  assert.deepEqual([...flat.keys()], ["a.b", "a.n"]);
  assert.equal(isPlural(flat.get("a.n")), true);
  assert.equal(isPlural({ title: "x" }), false);
});

test("setLocale and setDigits refuse unknown values", () => {
  assert.throws(() => setLocale(/** @type {any} */ ("en")), RangeError);
  assert.throws(() => setDigits(/** @type {any} */ ("thai")), RangeError);
});
