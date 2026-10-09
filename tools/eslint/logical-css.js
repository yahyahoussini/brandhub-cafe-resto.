// @ts-check
/**
 * ESLint rule `bh/logical-css`: class strings use logical properties only (D18, CLAUDE.md "Language and style of code"),
 * so Arabic screens mirror without a second stylesheet. Fails on physical utilities such as `ml-2`, `pr-4`, `left-0`,
 * `text-right`, `rounded-l-md`, `border-r`, `scroll-ml-2`, including variants (`md:ml-2`, `-mr-1`, `!pl-3`, `pl-3!`).
 *
 * Checked strings: `class` / `className` JSX attributes and the arguments of class helpers (`cx`, `clsx`, `cn`,
 * `classNames`, and the `tw` tag or call). The rule follows the value: constants and variant maps declared in the file
 * (`const VARIANTS = { primary: "ps-4 …" }`), ternaries, `&&`, arrays, `.filter(Boolean).join(" ")` chains and arrow
 * bodies (`computed(() => …)`).
 */

const PHYSICAL = [/^(scroll-)?(ml|mr|pl|pr)-/, /^(left|right)-/, /^text-(left|right)$/, /^(rounded|border)-(l|r)(-|$)/];

const LOGICAL_HINT = "use ms-/me-, ps-/pe-, start-/end-, text-start/text-end, rounded-s/rounded-e, border-s/border-e";
const CLASS_ATTRS = new Set(["class", "className"]);
const CLASS_HELPERS = new Set(["cx", "clsx", "cn", "classNames", "tw"]);

/**
 * @param {string} text
 * @returns {string[]} the physical classes found, in order
 */
export function findPhysicalClasses(text) {
  return text.split(/\s+/).filter((raw) => {
    if (!raw) return false;
    // Drop variants (`md:`, `hover:`, `rtl:`), the important mark (leading or Tailwind 4 trailing) and the minus sign.
    const token = raw
      .slice(raw.lastIndexOf(":") + 1)
      .replace(/^!|!$/g, "")
      .replace(/^-/, "");
    return PHYSICAL.some((re) => re.test(token));
  });
}

/**
 * A class helper (`cx(…)`, `` tw`…` ``) is checked once, by its own visitor, even inside a class attribute.
 * @param {any} node
 */
function isClassHelper(node) {
  const callee = node.type === "TaggedTemplateExpression" ? node.tag : node.callee;
  return callee?.type === "Identifier" && CLASS_HELPERS.has(callee.name);
}

/** @type {import("eslint").Rule.RuleModule} */
export const logicalCss = {
  meta: {
    type: "problem",
    docs: { description: "Class strings use logical CSS properties only (no ml-, mr-, pl-, pr-, left-, right-, …)" },
    schema: [],
    messages: { physical: 'Physical class "{{cls}}": {{hint}}.' },
  },
  create(context) {
    /** Literals already reported, so a constant used in two attributes is reported once, where it is written. */
    const reported = new WeakSet();

    /**
     * @param {any} node
     * @param {Set<any>} seen nodes already walked from this attribute or helper (stops cycles)
     */
    function checkStrings(node, seen = new Set()) {
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      /** @param {any} n */
      const walk = (n) => checkStrings(n, seen);
      switch (node.type) {
        case "Literal":
          if (typeof node.value === "string") report(node, node.value);
          break;
        case "TemplateLiteral":
          for (const q of node.quasis) report(q, q.value.cooked ?? q.value.raw);
          node.expressions.forEach(walk);
          break;
        case "TaggedTemplateExpression":
          if (!isClassHelper(node)) walk(node.quasi);
          break;
        case "JSXExpressionContainer":
          walk(node.expression);
          break;
        case "ConditionalExpression":
          walk(node.consequent);
          walk(node.alternate);
          break;
        case "LogicalExpression":
        case "BinaryExpression":
          walk(node.left);
          walk(node.right);
          break;
        case "ArrayExpression":
          node.elements.forEach(walk);
          break;
        case "SpreadElement":
          walk(node.argument);
          break;
        case "ObjectExpression":
          for (const p of node.properties) {
            if (p.type === "SpreadElement") walk(p.argument);
            if (p.type !== "Property") continue;
            if (p.key.type === "Literal" && typeof p.key.value === "string") report(p.key, p.key.value);
            walk(p.value);
          }
          break;
        case "MemberExpression": // VARIANTS[variant], styles.primary
          walk(node.object);
          break;
        case "CallExpression": // [..].filter(Boolean).join(" "); cx(..) is handled by its own visitor
          if (isClassHelper(node)) break;
          if (node.callee.type === "MemberExpression") walk(node.callee.object);
          node.arguments.forEach(walk);
          break;
        case "ArrowFunctionExpression": // computed(() => …)
          walk(node.body);
          break;
        case "Identifier":
          for (const init of initialValues(node)) walk(init);
          break;
      }
    }

    /**
     * The values a variable of this file is declared with (`const x = …`), found through the scope chain.
     * @param {any} id
     * @returns {any[]}
     */
    function initialValues(id) {
      /** @type {any} */
      let scope = context.sourceCode.getScope(id);
      while (scope) {
        const variable = scope.set.get(id.name);
        if (variable) {
          return variable.defs
            .filter((/** @type {any} */ d) => d.type === "Variable" && d.node.init)
            .map((/** @type {any} */ d) => d.node.init);
        }
        scope = scope.upper;
      }
      return [];
    }

    /**
     * @param {any} node
     * @param {string} text
     */
    function report(node, text) {
      if (reported.has(node)) return;
      reported.add(node);
      for (const cls of findPhysicalClasses(text)) {
        context.report({ node, messageId: "physical", data: { cls, hint: LOGICAL_HINT } });
      }
    }

    return {
      /** @param {any} node */
      JSXAttribute(node) {
        if (node.name.type === "JSXIdentifier" && CLASS_ATTRS.has(node.name.name)) checkStrings(node.value);
      },
      /** @param {any} node */
      CallExpression(node) {
        if (isClassHelper(node)) node.arguments.forEach((/** @type {any} */ a) => checkStrings(a));
      },
      /** @param {any} node */
      TaggedTemplateExpression(node) {
        if (isClassHelper(node)) checkStrings(node.quasi);
      },
    };
  },
};

export default { rules: { "logical-css": logicalCss } };
