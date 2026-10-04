// @ts-check
/**
 * ESLint rule `bh/logical-css`: class strings use logical properties only (D18, CLAUDE.md "Language and style of code"),
 * so Arabic screens mirror without a second stylesheet. Fails on physical utilities such as `ml-2`, `pr-4`, `left-0`,
 * `text-right`, `rounded-l-md`, `border-r`, including variants (`md:ml-2`, `-mr-1`, `!pl-3`).
 *
 * Checked strings: `class` / `className` JSX attributes (any string or template inside the expression) and the
 * arguments of class helpers (`cx`, `clsx`, `cn`, `classNames`, `tw`).
 */

const PHYSICAL = [/^(ml|mr|pl|pr)-/, /^(left|right)-/, /^text-(left|right)$/, /^(rounded|border)-(l|r)(-|$)/];

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
    // Drop variants (`md:`, `hover:`, `rtl:`), the important mark and the negative sign.
    const token = raw
      .slice(raw.lastIndexOf(":") + 1)
      .replace(/^!/, "")
      .replace(/^-/, "");
    return PHYSICAL.some((re) => re.test(token));
  });
}

/**
 * A call to a class helper is checked once, by the CallExpression visitor, even inside a class attribute.
 * @param {any} node
 */
function isClassHelper(node) {
  return node.callee.type === "Identifier" && CLASS_HELPERS.has(node.callee.name);
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
    /** @param {any} node */
    function checkStrings(node) {
      if (!node || typeof node !== "object") return;
      if (node.type === "Literal" && typeof node.value === "string") report(node, node.value);
      else if (node.type === "TemplateLiteral") {
        for (const q of node.quasis) report(q, q.value.cooked ?? q.value.raw);
        for (const e of node.expressions) checkStrings(e);
      } else if (node.type === "JSXExpressionContainer") checkStrings(node.expression);
      else if (node.type === "ConditionalExpression") {
        checkStrings(node.consequent);
        checkStrings(node.alternate);
      } else if (node.type === "LogicalExpression" || node.type === "BinaryExpression") {
        checkStrings(node.left);
        checkStrings(node.right);
      } else if (node.type === "ArrayExpression") node.elements.forEach(checkStrings);
      else if (node.type === "ObjectExpression") {
        for (const p of node.properties) {
          if (p.type !== "Property") continue;
          if (p.key.type === "Literal" && typeof p.key.value === "string") report(p.key, p.key.value);
          checkStrings(p.value);
        }
      } else if (node.type === "CallExpression" && !isClassHelper(node)) node.arguments.forEach(checkStrings);
    }

    /**
     * @param {any} node
     * @param {string} text
     */
    function report(node, text) {
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
        if (node.callee.type === "Identifier" && CLASS_HELPERS.has(node.callee.name))
          node.arguments.forEach(checkStrings);
      },
    };
  },
};

export default { rules: { "logical-css": logicalCss } };
