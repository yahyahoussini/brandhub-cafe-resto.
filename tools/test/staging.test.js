// @ts-check
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";
import { PRODUCTS, SECRETS, readStagingConfig, stagingPlan } from "../scripts/staging.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/staging.mjs", import.meta.url));

describe("tools/scripts/staging.mjs", () => {
  const plan = stagingPlan(PRODUCTS.map((product) => ({ product, config: readStagingConfig(product) })));
  const commands = plan
    .split("\n")
    .filter((l) => l.startsWith("npx ") || l.startsWith("curl ") || l.startsWith("node "));

  it("prints the docs/12 §2 commands for both products, Café first, every resource in the EU jurisdiction", () => {
    for (const p of PRODUCTS) {
      const cfg = `-c apps/${p}/worker/wrangler.jsonc --env staging`;
      for (const expected of [
        `npx wrangler d1 create brandhub-${p}-registry --jurisdiction eu`,
        `npx wrangler r2 bucket create brandhub-${p}-files --jurisdiction eu`,
        `npx wrangler d1 migrations apply brandhub-${p}-registry --remote ${cfg}`,
        `node tools/scripts/build-web.mjs ${p}`,
        `npx wrangler deploy ${cfg} --no-x-provision`,
        `curl -s https://brandhub-${p}-staging.<account>.workers.dev/api/health`,
        `curl -sI https://brandhub-${p}-staging.<account>.workers.dev/api/health`,
      ])
        assert.ok(commands.includes(expected), expected);
    }
    assert.ok(plan.indexOf("brandhub-cafe-staging") < plan.indexOf("brandhub-resto-staging"));
    // the resources are created before the deploy, and the PWA is built before it
    for (const p of PRODUCTS) {
      const at = (/** @type {string} */ prefix) => commands.findIndex((c) => c.startsWith(prefix) && c.includes(p));
      assert.ok(at("npx wrangler d1 create") < at("npx wrangler deploy"));
      assert.ok(at("npx wrangler r2 bucket create") < at("npx wrangler deploy"));
      assert.ok(at("npx wrangler d1 migrations apply") < at("npx wrangler deploy"));
      assert.ok(at("node tools/scripts/build-web.mjs") < at("npx wrangler deploy"));
    }
  });

  it("never targets anything but staging, and creates nothing outside the EU", () => {
    for (const c of commands.filter((c) => / -c /.test(c))) assert.match(c, / --env staging\b/, c);
    for (const c of commands.filter((c) => / (d1|bucket) create /.test(c))) assert.match(c, / --jurisdiction eu$/, c);
    assert.equal(commands.filter((c) => c.includes("wrangler deploy")).length, PRODUCTS.length);
    const config = readStagingConfig("cafe");
    assert.throws(
      () => stagingPlan([{ product: "cafe", config: { ...config, bucketJurisdiction: "" } }]),
      /jurisdiction/,
    );
  });

  it("names the secrets without values, and runs nothing", () => {
    for (const name of SECRETS) {
      const lines = plan.split("\n").filter((l) => l.includes(name));
      assert.equal(lines.length, PRODUCTS.length, name);
      for (const l of lines)
        assert.match(
          l,
          new RegExp(`^npx wrangler secret put ${name} -c apps/(cafe|resto)/worker/wrangler.jsonc --env staging$`),
        );
    }
    assert.doesNotMatch(readFileSync(SCRIPT, "utf8"), /child_process|execSync|spawn\(|fetch\(/);
  });

  it("prints the same as a command, and nothing from the environment's secrets", () => {
    const sentinel = "sentinel-not-a-real-value-7f3k2q";
    const run = spawnSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, DATA_KEY: sentinel, CLOUDFLARE_API_TOKEN: sentinel, RESEND_API_KEY: sentinel },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trimEnd(), plan);
    assert.ok(!run.stdout.includes(sentinel) && !run.stderr.includes(sentinel));
    const bad = spawnSync(process.execPath, [SCRIPT, "staging"], { encoding: "utf8" });
    assert.equal(bad.status, 2);
  });
});

describe("apps/<product>/worker/wrangler.jsonc", () => {
  it("keeps its top level local: a deploy without --env reaches neither the production name nor a real registry", () => {
    for (const p of PRODUCTS) {
      const config = fileURLToPath(new URL(`../../apps/${p}/worker/wrangler.jsonc`, import.meta.url));
      /** @type {{ name?: string, workers_dev?: boolean, vars: Record<string, unknown>, d1_databases: { binding: string, database_id?: string }[] }} */
      const top = unstable_readConfig({ config });
      const production = unstable_readConfig({ config, env: "production" });
      const staging = unstable_readConfig({ config, env: "staging" });
      assert.equal(production.name, `brandhub-${p}`, p);
      assert.equal(staging.name, `brandhub-${p}-staging`, p);
      assert.equal(top.name, `brandhub-${p}-local`, p);
      assert.equal(top.workers_dev, false, p);
      assert.equal(top.vars.ENVIRONMENT, "local", p);
      // a database_id that names no Cloudflare database: Wrangler neither binds the staging registry by its name nor
      // creates one outside the EU jurisdiction (docs/12 §2)
      assert.equal(top.d1_databases.find((d) => d.binding === "REGISTRY")?.database_id, "local-only", p);
    }
  });
});
