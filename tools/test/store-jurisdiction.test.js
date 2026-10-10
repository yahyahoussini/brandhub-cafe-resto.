// @ts-check
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ESLint, RuleTester } from "eslint";
import { storeThroughJurisdiction } from "../eslint/store-jurisdiction.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2025, sourceType: "module" } });
const direct = [{ messageId: "direct" }];

tester.run("bh/store-through-jurisdiction", storeThroughJurisdiction, {
  valid: [
    {
      code: 'import { jurisdictionStore } from "@brandhub/kit-worker/jurisdiction"; jurisdictionStore(env, id).append(e, c);',
    },
    { code: "env.REGISTRY.prepare(q); env.FILES.get(k); env.ASSETS.fetch(r);" },
    { code: "const { REGISTRY, FILES } = env;" },
    { code: 'const STORE_NAME = "x"; env.STORES; env.store;' },
  ],
  invalid: [
    { code: "env.STORE.idFromName(tenantId);", errors: direct },
    { code: "env.STORE.get(env.STORE.idFromString(hex));", errors: [...direct, ...direct] },
    { code: "env.STORE.getByName(tenantId);", errors: direct },
    { code: "env.STORE.newUniqueId();", errors: direct },
    { code: 'env["STORE"].idFromName(tenantId);', errors: direct },
    { code: "env[`STORE`].idFromName(tenantId);", errors: direct },
    { code: "this.env.STORE.jurisdiction('eu');", errors: direct },
    { code: "const ns = env.STORE;", errors: direct },
    { code: "const { STORE } = env; STORE.idFromName(tenantId);", errors: direct },
    { code: "const { STORE: ns } = env;", errors: direct },
    {
      code: "export default { fetch(request, { STORE }) { return STORE.get(STORE.idFromName('x')); } };",
      errors: direct,
    },
  ],
});

describe("eslint.config.js", () => {
  const eslint = new ESLint();
  /** @param {string} filePath */
  const ruleIdsFor = async (filePath) => {
    const [result] = await eslint.lintText("export const id = (env, t) => env.STORE.idFromName(t);\n", { filePath });
    return result.messages.map((m) => m.ruleId);
  };

  it("applies the rule to the Workers' source and the kit-worker package, the helper itself excepted", async () => {
    for (const file of [
      "apps/cafe/worker/src/index.js",
      "apps/resto/worker/src/routes/sync.js",
      "packages/kit-worker/src/store.js",
    ])
      assert.deepEqual(await ruleIdsFor(file), ["bh/store-through-jurisdiction"], file);
    assert.deepEqual(await ruleIdsFor("packages/kit-worker/src/jurisdiction.js"), []);
  });

  it("leaves the specs free to reach the binding (they test the helper against it)", async () => {
    assert.deepEqual(await ruleIdsFor("apps/cafe/worker/test/store.spec.js"), []);
    assert.deepEqual(await ruleIdsFor("packages/kit-worker/test/workerd.js"), []);
  });
});
