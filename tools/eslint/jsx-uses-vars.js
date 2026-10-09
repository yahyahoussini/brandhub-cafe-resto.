// @ts-check
/**
 * ESLint rule `bh/jsx-uses-vars`: marks components used as JSX elements (`<Button />`, `<ui.Tile />`) as used, so
 * `no-unused-vars` does not report their imports. ESLint core does not track JSX references.
 */

/** @type {import("eslint").Rule.RuleModule} */
export const jsxUsesVars = {
  meta: {
    type: "problem",
    docs: { description: "Components used in JSX count as used variables" },
    schema: [],
  },
  create(context) {
    return {
      /** @param {any} node */
      JSXOpeningElement(node) {
        let name = node.name;
        while (name.type === "JSXMemberExpression") name = name.object;
        if (name.type === "JSXIdentifier" && /^[A-Z]/.test(name.name)) {
          context.sourceCode.markVariableAsUsed(name.name, node);
        } else if (name.type === "JSXIdentifier" && node.name.type === "JSXMemberExpression") {
          context.sourceCode.markVariableAsUsed(name.name, node);
        }
      },
    };
  },
};
