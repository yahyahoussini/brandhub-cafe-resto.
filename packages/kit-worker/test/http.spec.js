// @ts-check
import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  STATION_PORT,
  apiError,
  contentSecurityPolicy,
  handleFetch,
  health,
  json,
  notFound,
  securityHeaders,
  withSecurityHeaders,
} from "../src/http.js";

const PROD = { ENVIRONMENT: "production", APP_ORIGIN: "https://cafe.brandhub.ma" };
const LOCAL = { ENVIRONMENT: "local", APP_ORIGIN: "http://localhost:8787" };

/** docs/08 §7, with the product host of cafe.brandhub.ma. */
const PROD_CSP =
  "default-src 'self'; img-src 'self' data: blob:; connect-src 'self' wss://cafe.brandhub.ma http://*:17800; " +
  "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/** @param {Headers} h */
function expectDocs08Headers(h) {
  expect(h.get("X-Robots-Tag")).toBe("noindex");
  expect(h.get("Referrer-Policy")).toBe("no-referrer");
  expect(h.get("X-Content-Type-Options")).toBe("nosniff");
  expect(h.get("Permissions-Policy")).toBe(
    "camera=(self), usb=(self), serial=(self), bluetooth=(self), geolocation=()",
  );
}

describe("security headers (docs/08 §7)", () => {
  it("production and staging: the CSP of docs/08 §7 and one year of HSTS", () => {
    expect(contentSecurityPolicy(PROD)).toBe(PROD_CSP);
    const h = securityHeaders(PROD);
    expect(h["Strict-Transport-Security"]).toBe("max-age=31536000");
    expectDocs08Headers(new Headers(h));
    const staging = securityHeaders({
      ENVIRONMENT: "staging",
      APP_ORIGIN: "https://brandhub-cafe-staging.example.workers.dev",
    });
    expect(staging["Content-Security-Policy"]).toContain(
      "connect-src 'self' wss://brandhub-cafe-staging.example.workers.dev http://*:17800;",
    );
    expect(staging["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(STATION_PORT).toBe(17800);
  });

  it("is strict whenever ENVIRONMENT is not exactly local", () => {
    for (const ENVIRONMENT of [undefined, "", "Local", "dev", "staging"]) {
      const h = securityHeaders({ ENVIRONMENT, APP_ORIGIN: "https://cafe.brandhub.ma" });
      expect(h["Strict-Transport-Security"]).toBe("max-age=31536000");
      expect(h["Content-Security-Policy"]).toBe(PROD_CSP);
    }
  });

  it("names no WebSocket host when APP_ORIGIN is empty, malformed, not https or not a bare origin", () => {
    for (const APP_ORIGIN of [
      undefined,
      "",
      "cafe.brandhub.ma",
      "http://cafe.brandhub.ma",
      "https://cafe.brandhub.ma/app",
      "https://x@cafe.brandhub.ma",
      "javascript:alert(1)",
    ]) {
      const csp = contentSecurityPolicy({ ENVIRONMENT: "production", APP_ORIGIN });
      expect(csp).toContain("connect-src 'self' http://*:17800;");
      expect(csp).not.toMatch(/wss?:\/\//);
    }
  });

  it("local (wrangler dev): ws:// to the local origin, localhost ports, no HSTS; the rest unchanged", () => {
    const h = securityHeaders(LOCAL);
    expect(h["Strict-Transport-Security"]).toBeUndefined();
    expect(h["Content-Security-Policy"]).toBe(
      "default-src 'self'; img-src 'self' data: blob:; " +
        "connect-src 'self' ws://localhost:8787 http://*:17800 http://localhost:* ws://localhost:*; " +
        "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    expectDocs08Headers(new Headers(h));
    // An asset response with the HSTS of _headers loses it locally, keeps it elsewhere.
    const asset = () => new Response("", { headers: { "Strict-Transport-Security": "max-age=31536000" } });
    expect(withSecurityHeaders(asset(), LOCAL).headers.get("Strict-Transport-Security")).toBeNull();
    expect(withSecurityHeaders(asset(), PROD).headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
  });

  it("withSecurityHeaders keeps status, body and headers, and overrides immutable ones", async () => {
    const res = withSecurityHeaders(new Response("bonjour", { status: 200 }), PROD);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("bonjour");
    expectDocs08Headers(res.headers);

    // Response.redirect() has immutable headers, like the responses of fetch() and the assets binding.
    const redirect = Response.redirect("https://cafe.brandhub.ma/caisse", 302);
    expect(() => redirect.headers.set("X-Robots-Tag", "noindex")).toThrow();
    const moved = withSecurityHeaders(redirect, PROD);
    expect(moved.status).toBe(302);
    expect(moved.headers.get("Location")).toBe("https://cafe.brandhub.ma/caisse");
    expectDocs08Headers(moved.headers);

    const spoofed = new Response("x", { status: 418, headers: { "X-Robots-Tag": "all", "X-Custom": "kept" } });
    const out = withSecurityHeaders(spoofed, PROD);
    expect(out.status).toBe(418);
    expect(out.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(out.headers.get("X-Custom")).toBe("kept");
  });
});

describe("JSON answers", () => {
  it("json(): JSON body, UTF-8, not cached unless asked", async () => {
    const res = json({ a: "é" }, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ a: "é" });
    expect(json({}, { headers: { "Cache-Control": "max-age=60" } }).headers.get("Cache-Control")).toBe("max-age=60");
  });

  it("notFound() and apiError(): a code, no message", async () => {
    const res = notFound();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "E_NOT_FOUND" });
    const err = apiError(405, "E_METHOD", { Allow: "GET" });
    expect(err.headers.get("Allow")).toBe("GET");
    expect(await err.json()).toEqual({ code: "E_METHOD" });
  });
});

describe("handleFetch", () => {
  const assets = vi.fn(async (/** @type {Request} */ _request) => new Response("<!doctype html>", { status: 200 }));
  const env = {
    ...PROD,
    PRODUCT: "cafe",
    ASSETS: /** @type {Fetcher} */ (/** @type {unknown} */ ({ fetch: assets })),
  };
  /** @type {import("../src/http.js").Route<typeof env>[]} */
  const routes = [
    { method: "GET", path: "/api/health", handler: () => health(env, "1.2.3") },
    {
      method: "POST",
      path: "/api/boom",
      handler: () => Promise.reject(Object.assign(new TypeError("a@b.ma"), { code: "E_X" })),
    },
  ];
  /** @param {string} path @param {RequestInit} [init] */
  const call = (path, init) =>
    handleFetch(new Request(`https://cafe.brandhub.ma${path}`, init), env, createExecutionContext(), routes);

  it("answers an API route with the headers", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expectDocs08Headers(res.headers);
    const body = await res.json();
    expect(body).toMatchObject({ product: "cafe", version: "1.2.3", build: null });
    expect(new Date(body.time).toISOString()).toBe(body.time);
  });

  it("HEAD runs the GET route without a body", async () => {
    const res = await call("/api/health", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await res.text()).toBe("");
  });

  it("unknown /api paths are 404 JSON, never the app shell", async () => {
    for (const path of ["/api", "/api/", "/api/x", "/api/health/", "/api/health/x", "/API/health"]) {
      const res = await call(path);
      if (path === "/API/health") {
        expect(assets).toHaveBeenCalled();
        continue;
      }
      expect(res.status, path).toBe(404);
      expect(await res.json()).toEqual({ code: "E_NOT_FOUND" });
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    }
  });

  it("a known path with another method is 405 with Allow", async () => {
    const res = await call("/api/health", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
    expect(await res.json()).toEqual({ code: "E_METHOD" });
  });

  it("everything else goes to the static assets, with the headers", async () => {
    assets.mockClear();
    const res = await call("/caisse");
    expect(assets).toHaveBeenCalledTimes(1);
    expect(new URL(assets.mock.calls[0][0].url).pathname).toBe("/caisse");
    expect(await res.text()).toBe("<!doctype html>");
    expect(res.headers.get("Content-Security-Policy")).toBe(PROD_CSP);
    expectDocs08Headers(res.headers);
  });

  it("an error is 500 E_INTERNAL; the log has the route and the class, never the message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("/api/boom", { method: "POST" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: "E_INTERNAL" });
    expectDocs08Headers(res.headers);
    expect(log).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.mock.calls[0]);
    expect(logged).toContain("/api/boom");
    expect(logged).toContain("TypeError");
    expect(logged).toContain("E_X");
    expect(logged).not.toContain("a@b.ma");
    log.mockRestore();
  });
});
