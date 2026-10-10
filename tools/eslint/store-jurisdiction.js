// @ts-check
/**
 * ESLint rule `bh/store-through-jurisdiction`: Worker code reaches a client's TenantStore only through
 * `jurisdictionStore(env, tenantId)` (@brandhub/kit-worker/jurisdiction), which always asks for the EU jurisdiction
 * (D19, docs/02 §4). Any other read of the `STORE` binding is reported: `env.STORE.idFromName(…)`,
 * `env.STORE.getByName(…)`, `env["STORE"]`, `const { STORE } = env`, `({ STORE }) => …`.
 * eslint.config.js applies it to the Workers' source and exempts the helper itself.
 */

/** @param {any} node a property or member key @param {boolean} computed */
function keyName(node, computed) {
  if (!computed && node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
export const storeThroughJurisdiction = {
  meta: {
    type: "problem",
    docs: { description: "The STORE binding is read only by jurisdictionStore (EU jurisdiction, D19)" },
    schema: [],
    messages: {
      direct:
        "Reach a client's store with jurisdictionStore(env, tenantId) from @brandhub/kit-worker/jurisdiction, never through the STORE binding directly (D19: EU jurisdiction).",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (keyName(node.property, node.computed) === "STORE") context.report({ node, messageId: "direct" });
      },
      /** @param {any} node */
      Property(node) {
        if (node.parent.type === "ObjectPattern" && keyName(node.key, node.computed) === "STORE")
          context.report({ node, messageId: "direct" });
      },
    };
  },
};
