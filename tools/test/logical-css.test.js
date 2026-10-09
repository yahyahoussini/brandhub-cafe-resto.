// @ts-check
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "eslint";
import { findPhysicalClasses, logicalCss } from "../eslint/logical-css.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2025, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
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
  it("finds the Tailwind 4 trailing important mark and scroll margins and paddings", () => {
    assert.deepEqual(
      findPhysicalClasses("text-right! md:text-left! border-l! rounded-r! ml-2! scroll-ml-2 -scroll-pr-4"),
      ["text-right!", "md:text-left!", "border-l!", "rounded-r!", "ml-2!", "scroll-ml-2", "-scroll-pr-4"],
    );
  });
  it("keeps look-alike logical or colour classes", () => {
    assert.deepEqual(
      findPhysicalClasses(
        "rounded-lg border-lime-500 border-red-500 text-start start-0 rounded-s border-s-2 ps-4 rounded-lg! ms-2! scroll-ms-2",
      ),
      [],
    );
  });
});

tester.run("bh/logical-css", logicalCss, {
  valid: [
    { code: '<div class="ms-2 pe-4 rounded-lg border-lime-500 text-start start-0" />' },
    { code: '<div className={`ps-2 ${x ? "me-1" : "end-0"}`} />' },
    { code: 'const label = "left-hand menu";' }, // not a class string
    { code: 'const title = "ml-2"; <p class="ps-2" title={title} />;' }, // a variable not used as a class
    { code: 'const V = { a: "ps-4", b: "me-2" }; <b class={[V[k], on && "start-0"].filter(Boolean).join(" ")} />;' },
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
    { code: "const c = tw`pe-2 border-r`;", errors: physical(1) },
    { code: "<div class={tw`ml-2`} />", errors: physical(1) },
    { code: '<div class="text-right! scroll-ml-2" />', errors: physical(2) },
    // The rule follows constants, variant maps, ternary variables and join chains declared in the file.
    {
      code: [
        'const VARIANTS = { primary: "bg-primary pl-4 pe-4", danger: "bg-danger ml-2" };',
        'const pos = active ? "right-0" : "start-0";',
        'const Button = ({ variant }) => <button class={[VARIANTS[variant], pos, active && "border-r-2"].filter(Boolean).join(" ")} />;',
      ].join("\n"),
      errors: physical(4),
    },
    {
      code: 'const base = "ml-2"; const A = () => <a class={base} />; const B = () => <b class={base} />;',
      errors: physical(1),
    },
    {
      code: 'const cls = computed(() => (open ? "left-0" : "start-0")); <nav class={cls.value} />;',
      errors: physical(1),
    },
  ],
});
