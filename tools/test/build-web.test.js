// @ts-check
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { appOriginOf, headersFor } from "../scripts/build-web.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/build-web.mjs", import.meta.url));

/** @param {string} text */
const csp = (text) => text.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:")) ?? "";

describe("tools/scripts/build-web.mjs: the pages' headers per environment (docs/08 §7)", () => {
  for (const product of /** @type {const} */ (["cafe", "resto"])) {
    const text = readFileSync(new URL(`../../apps/${product}/web/public/_headers`, import.meta.url), "utf8");
    const production = `https://${product}.brandhub.ma`;

    it(`${product}: web/public/_headers is production's, and production's build keeps it`, () => {
      assert.equal(appOriginOf(product, "production"), production);
      assert.match(csp(text), new RegExp(` connect-src 'self' wss://${product}\\.brandhub\\.ma http://\\*:17800;`));
      assert.equal(headersFor(text, appOriginOf(product, "production")), text);
    });

    it(`${product}: a staging page may open staging's socket, never production's`, () => {
      const host = `brandhub-${product}-staging.example.workers.dev`;
      const staging = headersFor(text, `https://${host}`);
      assert.ok(csp(staging).includes(` connect-src 'self' wss://${host} http://*:17800;`), csp(staging));
      assert.ok(!staging.includes(`wss://${product}.brandhub.ma`));
      assert.equal(staging.replace(`wss://${host}`, `wss://${product}.brandhub.ma`), text, "nothing else changes");
      // before the first deploy prints its address, env.staging's APP_ORIGIN is empty: the page's own host only
      const unknown = headersFor(text, "");
      assert.ok(csp(unknown).includes(" connect-src 'self' http://*:17800;"), csp(unknown));
      assert.ok(!unknown.includes("wss://"));
    });
  }

  it("refuses an environment wrangler.jsonc does not have", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "cafe", "prod"], { encoding: "utf8" });
    assert.equal(run.status, 2);
  });
});
