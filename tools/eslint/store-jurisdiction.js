// @ts-check
/**
 * ESLint rule `bh/store-through-jurisdiction`: Worker code reaches a client's TenantStore only through
 * `jurisdictionStore(env, tenantId)` (@brandhub/kit-worker/jurisdiction), which always asks for the EU jurisdiction
 * (D19, docs/02 §4). Any other read of the `STORE` binding is reported: `env.STORE.idFromName(…)`,
 * `env.STORE.getByName(…)`, `env["STORE"]`, `const { STORE } = env`, `({ STORE }) => …`.
 * The Workers' loopback bindings reach the same Durable Object class without the jurisdiction, so they are reported
 * too: `import { exports } from "cloudflare:workers"`, `exports.CafeStore`, `ctx.exports.RestoStore`,
 * `this.ctx.exports…`, `const { exports } = ctx`, `const { CafeStore } = ctx.exports`, and a re-export that would carry
 * them to another module under any name: `export { exports as loopback } from "cloudflare:workers"`,
 * `export * from "cloudflare:workers"`. Only `….exports.default` (the Worker's own entry point, not a store) is
 * allowed.
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
      loopback:
        "Reach a client's store with jurisdictionStore(env, tenantId) from @brandhub/kit-worker/jurisdiction, never through the Worker's loopback exports (ctx.exports, exports from cloudflare:workers), which skip the EU jurisdiction (D19).",
    },
  },
  create(context) {
    return {
      /** @param {any} node */
      ImportDeclaration(node) {
        if (node.source.value !== "cloudflare:workers") return;
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" && keyName(spec.imported, false) === "exports")
            context.report({ node: spec, messageId: "loopback" });
        }
      },
      // a re-export would hand the loopback map to another module under a name the rule cannot follow
      /** @param {any} node */
      ExportNamedDeclaration(node) {
        if (node.source?.value !== "cloudflare:workers") return;
        for (const spec of node.specifiers) {
          if (keyName(spec.local, false) === "exports") context.report({ node: spec, messageId: "loopback" });
        }
      },
      /** @param {any} node */
      ExportAllDeclaration(node) {
        if (node.source.value === "cloudflare:workers") context.report({ node, messageId: "loopback" });
      },
      /** @param {any} node */
      MemberExpression(node) {
        const key = keyName(node.property, node.computed);
        if (key === "STORE") context.report({ node, messageId: "direct" });
        // `ctx.exports`, `this.ctx.exports`, `cf.exports`: allowed only as `….exports.default`
        if (key === "exports") {
          const parent = node.parent;
          const toDefault =
            parent.type === "MemberExpression" &&
            parent.object === node &&
            keyName(parent.property, parent.computed) === "default";
          if (!toDefault) context.report({ node, messageId: "loopback" });
        }
        // `exports.CafeStore` with `exports` imported from cloudflare:workers
        if (node.object.type === "Identifier" && node.object.name === "exports" && key !== "default")
          context.report({ node, messageId: "loopback" });
      },
      /** @param {any} node */
      Property(node) {
        if (node.parent.type !== "ObjectPattern") return;
        const key = keyName(node.key, node.computed);
        if (key === "STORE") context.report({ node, messageId: "direct" });
        if (key === "exports") context.report({ node, messageId: "loopback" });
      },
    };
  },
};
