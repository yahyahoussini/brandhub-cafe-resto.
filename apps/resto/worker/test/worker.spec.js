// @ts-check
import { securityHeaders } from "@brandhub/kit-worker/http";
import {
  applyD1Migrations,
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import worker from "../src/index.js";

const PRODUCT = "resto";
const HOST = "https://resto.brandhub.ma";

/** @typedef {import("@brandhub/kit-worker/env").ProductEnv & { TEST_MIGRATIONS: import("cloudflare:test").D1Migration[] }} TestEnv */
const testEnv = /** @type {TestEnv} */ (/** @type {unknown} */ (env));
/** The Worker's default export, called as Cloudflare calls it for `/api/*` and `/r/*` (run_worker_first). */
const self = /** @type {{ default: Fetcher }} */ (/** @type {unknown} */ (exports)).default;

/** @param {Headers} headers @param {Record<string, string>} expected */
function expectHeaders(headers, expected) {
  for (const [name, value] of Object.entries(expected)) expect(headers.get(name), name).toBe(value);
}

describe("GET /api/health", () => {
  it("answers product, version, build and time as JSON, with the headers of docs/08 §7", async () => {
    const before = Date.now();
    const res = await self.fetch(`${testEnv.APP_ORIGIN}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expectHeaders(res.headers, securityHeaders(testEnv));

    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["build", "product", "time", "version"]);
    expect(body.product).toBe(PRODUCT);
    expect(body.version).toBe(pkg.version);
    expect(body.build).toBe(testEnv.VERSION.id);
    expect(body.build).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const time = Date.parse(body.time);
    expect(new Date(time).toISOString()).toBe(body.time);
    expect(time).toBeGreaterThanOrEqual(before - 1000);
    expect(time).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("answers HEAD (curl -I, docs/12 §5) with the headers and no body", async () => {
    const res = await self.fetch(`${testEnv.APP_ORIGIN}/api/health`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await res.text()).toBe("");
  });

  it("runs with the local environment of wrangler.jsonc", () => {
    expect(testEnv.PRODUCT).toBe(PRODUCT);
    expect(testEnv.ENVIRONMENT).toBe("local");
    // Local headers: no HSTS, the rest of docs/08 §7.
    expect(securityHeaders(testEnv)["Strict-Transport-Security"]).toBeUndefined();
  });
});

describe("unknown API paths", () => {
  it("answer 404 JSON with a code, never the app shell, with X-Robots-Tag", async () => {
    for (const path of ["/api/x", "/api", "/api/", "/api/health/x", "/api/sync/push"]) {
      const res = await self.fetch(`${testEnv.APP_ORIGIN}${path}`);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ code: "E_NOT_FOUND" });
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
      expectHeaders(res.headers, securityHeaders(testEnv));
    }
  });

  it("a known path with another method answers 405 with Allow", async () => {
    const res = await self.fetch(`${testEnv.APP_ORIGIN}/api/health`, { method: "POST", body: "{}" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
    expect(await res.json()).toEqual({ code: "E_METHOD" });
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});

describe("static routes", () => {
  /** What web/public/_headers must give: the Worker's production headers for this product's host. */
  const production = securityHeaders({ ENVIRONMENT: "production", APP_ORIGIN: HOST });

  it("the asset server sends the headers of docs/08 §7 from _headers on every static route and the app shell", async () => {
    for (const path of [
      "/",
      "/index.html",
      "/caisse",
      "/serveur",
      "/gestion",
      "/menu/demo",
      "/commande/demo",
      "/reserver/demo",
    ]) {
      const res = await testEnv.ASSETS.fetch(
        new Request(`${HOST}${path}`, { headers: { "Sec-Fetch-Mode": "navigate" } }),
      );
      expect(res.status, path).toBe(200);
      expect(res.headers.get("X-Robots-Tag"), path).toBe("noindex");
      expectHeaders(res.headers, production);
    }
  });

  it("never serves the _headers file itself", async () => {
    const res = await testEnv.ASSETS.fetch(`${HOST}/_headers`);
    expect(await res.text()).not.toContain("Content-Security-Policy");
  });

  it("paths the Worker runs first for but does not handle (/r/*) go to the assets, with the Worker's headers", async () => {
    const res = await self.fetch(`${testEnv.APP_ORIGIN}/r/7F3K-2Q`, { headers: { "Sec-Fetch-Mode": "navigate" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    expectHeaders(res.headers, securityHeaders(testEnv));
    // The assets' HSTS (from _headers) is removed in the local environment, like every Worker response there.
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
  });
});

describe("registry (D1)", () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.REGISTRY, testEnv.TEST_MIGRATIONS);
  });

  it("the migrations named by wrangler.jsonc create the five tables", async () => {
    const { results } = await testEnv.REGISTRY.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    ).all();
    expect(results.map((r) => r.name)).toEqual([
      "control_requests",
      "message_counts",
      "owner_logins",
      "report_schedule",
      "tenants",
    ]);
  });

  it("keeps no email, phone or person's name in clear", async () => {
    /** @type {string[]} */
    const columns = [];
    for (const table of ["tenants", "owner_logins", "control_requests", "report_schedule", "message_counts"]) {
      const { results } = await testEnv.REGISTRY.prepare(`PRAGMA table_info(${table})`).all();
      columns.push(...results.map((r) => `${table}.${r.name}`));
    }
    expect(columns).toContain("owner_logins.email_hmac");
    expect(columns.filter((c) => /\.(email|phone|whatsapp|owner_name|owner)$/.test(c))).toEqual([]);
  });

  it("refuses malformed rows and removes a tenant's rows with it", async () => {
    const db = testEnv.REGISTRY;
    const tenant = "tnt_0196f4c1-2b3c-7d4e-8f50-6a7b8c9d0e1f";
    const insertTenant = "INSERT INTO tenants (id, name, status, created_at, updated_at) VALUES (?, ?, ?, 1, 1)";
    await expect(db.prepare(insertTenant).bind("x", "Café Démo", "active").run()).rejects.toThrow(/CHECK/);
    await expect(db.prepare(insertTenant).bind(tenant, "Café Démo", "deleted").run()).rejects.toThrow(/CHECK/);
    await expect(db.prepare(insertTenant).bind(tenant, "Café Démo", 1).run()).rejects.toThrow();
    await db.prepare(insertTenant).bind(tenant, "Café Démo", "active").run();
    await db
      .prepare("INSERT INTO owner_logins (email_hmac, tenant_id, account_id, created_at) VALUES (?, ?, ?, 1)")
      .bind("hmac-1", tenant, "own_0196f4c1-2b3c-7d4e-8f50-6a7b8c9d0e1f")
      .run();
    await db.prepare("INSERT INTO report_schedule (tenant_id, updated_at) VALUES (?, 1)").bind(tenant).run();
    await db
      .prepare(
        "INSERT INTO message_counts (tenant_id, day, channel, kind, count) VALUES (?, '2026-11-30', 'whatsapp', 'report', 1)",
      )
      .bind(tenant)
      .run();
    const schedule = await db.prepare("SELECT evening_time, next_at FROM report_schedule").first();
    expect(schedule).toEqual({ evening_time: "23:30", next_at: null });

    await db.prepare("DELETE FROM tenants WHERE id = ?").bind(tenant).run();
    for (const table of ["owner_logins", "report_schedule", "message_counts"]) {
      expect(await db.prepare(`SELECT count(*) AS n FROM ${table}`).first("n"), table).toBe(0);
    }
  });
});

describe("crons", () => {
  it("the two crons of wrangler.jsonc run without error", async () => {
    const ctx = createExecutionContext();
    for (const cron of ["*/15 * * * *", "30 2 * * *"]) {
      await worker.scheduled(createScheduledController({ cron, scheduledTime: Date.now() }), testEnv, ctx);
    }
    await waitOnExecutionContext(ctx);
  });
});
