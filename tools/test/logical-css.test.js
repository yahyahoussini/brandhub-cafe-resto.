// @ts-check
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "eslint";
import { findPhysicalClasses, logicalCss } from "../eslint/logical-css.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2024, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
});

/** @param {number} n */
const physical = (n) => Array.from({ length: n }, () => ({ messageId: "physical" }));

describe("findPhysicalClasses", () => {
  it("finds physical utilities with variants, negatives and the important mark", () => {
    assert.deepEqual(findPhysicalClasses("md:ml-2 -mr-1 !pl-3 hover:pr-2 ms-2"), [
      "md:ml-2",
      "-mr-1",
      "!pl-3",
      "hover:pr-2",
    ]);
  });
  it("keeps look-alike logical or colour classes", () => {
    assert.deepEqual(
      findPhysicalClasses("rounded-lg border-lime-500 border-red-500 text-start start-0 rounded-s border-s-2 ps-4"),
      [],
    );
  });
});

tester.run("bh/logical-css", logicalCss, {
  valid: [
    { code: '<div class="ms-2 pe-4 rounded-lg border-lime-500 text-start start-0" />' },
    { code: '<div className={`ps-2 ${x ? "me-1" : "end-0"}`} />' },
    { code: 'const label = "left-hand menu";' }, // not a class string
  ],
  invalid: [
    { code: '<div class="ml-2" />', errors: physical(1) },
    { code: '<div class="md:ml-2 -mr-1 !pl-3 hover:pr-2" />', errors: physical(4) },
    { code: '<div className={`left-0 ${on ? "right-0" : "text-right"}`} />', errors: physical(3) },
    {
      code: '<div class={cx("rounded-l-md", { "border-r": on }, "rounded-r", "border-l-2", "text-left")} />',
      errors: physical(5),
    },
    { code: 'const c = clsx("pr-2", cond && "text-left");', errors: physical(2) },
  ],
});
