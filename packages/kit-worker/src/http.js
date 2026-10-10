// @ts-check
/**
 * HTTP for the product Workers: the headers of docs/08 §7 on every response, JSON answers with an error code
 * (docs/03 §9), the `/api/*` router and `GET /api/health` (docs/02 §5).
 *
 * The Worker runs first only for `/api/*` and `/r/*` (wrangler.jsonc `assets.run_worker_first`); every other static
 * route gets the same headers from `apps/<product>/web/public/_headers`, which Vite copies into the build.
 */

/** Port of the Station's LAN API (docs/04 §7). */
export const STATION_PORT = 17800;

/** One year (docs/08 §7). */
const HSTS = "max-age=31536000";

/** docs/08 §7, word for word. */
const PERMISSIONS_POLICY = "camera=(self), usb=(self), serial=(self), bluetooth=(self), geolocation=()";

/** @typedef {{ ENVIRONMENT?: string, APP_ORIGIN?: string }} HeaderEnv */

/**
 * Only `wrangler dev` and the tests run with ENVIRONMENT "local"; anything else, a missing value included, gets the
 * production headers.
 * @param {HeaderEnv} env
 */
const isLocal = (env) => env.ENVIRONMENT === "local";

/**
 * The product origin from APP_ORIGIN (`https://cafe.brandhub.ma`), or null when it is empty or malformed: the CSP then
 * names no WebSocket host beyond 'self', which is stricter, never looser. Plain `http:` is accepted only locally.
 * @param {HeaderEnv} env
 * @returns {URL | null}
 */
function productOrigin(env) {
  if (!env.APP_ORIGIN) return null;
  /** @type {URL} */
  let url;
  try {
    url = new URL(env.APP_ORIGIN);
  } catch {
    return null;
  }
  const schemeOk = url.protocol === "https:" || (url.protocol === "http:" && isLocal(env));
  const bare = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  return schemeOk && bare ? url : null;
}

/**
 * Content-Security-Policy of docs/08 §7: `connect-src 'self' wss://<product host> http://*:17800`.
 * Locally (`wrangler dev`, http://localhost:8787) the product host is reached with `ws://`, and a Station or the other
 * product running on another localhost port may be called.
 * @param {HeaderEnv} env
 */
export function contentSecurityPolicy(env) {
  const origin = productOrigin(env);
  const connect = ["'self'"];
  if (origin) connect.push(`${origin.protocol === "https:" ? "wss" : "ws"}://${origin.host}`);
  connect.push(`http://*:${STATION_PORT}`);
  if (isLocal(env)) connect.push("http://localhost:*", "ws://localhost:*");
  return [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src ${connect.join(" ")}`,
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * The headers every response carries (docs/08 §7, docs/02 §4). Locally the Worker sends no HSTS: `wrangler dev` serves
 * plain HTTP, and a local HTTPS session must not pin localhost to HTTPS for a year. (Static routes served without the
 * Worker carry the `_headers` HSTS everywhere; browsers ignore it over plain HTTP.)
 * @param {HeaderEnv} env
 * @returns {Record<string, string>}
 */
export function securityHeaders(env) {
  /** @type {Record<string, string>} */
  const headers = {
    "Content-Security-Policy": contentSecurityPolicy(env),
    "X-Robots-Tag": "noindex",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": PERMISSIONS_POLICY,
  };
  if (!isLocal(env)) headers["Strict-Transport-Security"] = HSTS;
  return headers;
}

/**
 * A copy of `response` with the security headers set (responses from `fetch` and the assets binding have immutable
 * headers). A WebSocket handshake (101) is returned as it is: it carries no page.
 * @param {Response} response
 * @param {HeaderEnv} env
 */
export function withSecurityHeaders(response, env) {
  if (response.status === 101) return response;
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders(env))) out.headers.set(name, value);
  // An asset response carries the HSTS of _headers; locally the Worker removes it as it never adds it.
  if (isLocal(env)) out.headers.delete("Strict-Transport-Security");
  return out;
}

/**
 * A JSON response, never cached.
 * @param {unknown} body
 * @param {ResponseInit} [init]
 */
export function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/**
 * An error answer: `{ "code": "E_…" }` (docs/03 §9). Apps translate the code, never a message, so none is sent.
 * @param {number} status
 * @param {string} code
 * @param {HeadersInit} [headers]
 */
export function apiError(status, code, headers) {
  return json({ code }, { status, headers });
}

/** 404 for an unknown `/api/*` path. */
export function notFound() {
  return apiError(404, "E_NOT_FOUND");
}

/**
 * @template E
 * @callback Handler
 * @param {Request} request
 * @param {E} env
 * @param {ExecutionContext} ctx
 * @returns {Response | Promise<Response>}
 */

/**
 * @template E
 * @typedef {object} Route
 * @property {"GET" | "POST" | "PUT" | "DELETE"} method
 * @property {string} path exact path, such as "/api/health"
 * @property {Handler<E>} handler
 */

/** @param {string} pathname */
const isApiPath = (pathname) => pathname === "/api" || pathname.startsWith("/api/");

/**
 * Finds the API route of a request: 404 for an unknown path, 405 for a known path with another method. HEAD is
 * answered by the GET route without a body (`curl -I …/api/health`, docs/12 §5).
 * @template E
 * @param {Request} request
 * @param {E} env
 * @param {ExecutionContext} ctx
 * @param {readonly Route<E>[]} routes
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
async function routeApi(request, env, ctx, routes, pathname) {
  const onPath = routes.filter((r) => r.path === pathname);
  if (onPath.length === 0) return notFound();
  const head = request.method === "HEAD";
  const route = onPath.find((r) => r.method === (head ? "GET" : request.method));
  if (!route) {
    const allow = [...new Set(onPath.flatMap((r) => (r.method === "GET" ? ["GET", "HEAD"] : [r.method])))];
    return apiError(405, "E_METHOD", { Allow: allow.join(", ") });
  }
  const response = await route.handler(request, env, ctx);
  return head ? new Response(null, response) : response;
}

/**
 * The product Worker's `fetch`: `/api/*` from `routes`, every other path from the static assets, and the security
 * headers on every response. An unexpected error answers 500 `E_INTERNAL`; the log names the route, the error's
 * class and code, never its message, which could quote a request (no personal data in logs, docs/08 §6).
 * @template {HeaderEnv & { ASSETS: Fetcher }} E
 * @param {Request} request
 * @param {E} env
 * @param {ExecutionContext} ctx
 * @param {readonly Route<E>[]} routes
 * @returns {Promise<Response>}
 */
export async function handleFetch(request, env, ctx, routes) {
  const { pathname } = new URL(request.url);
  /** @type {Response} */
  let response;
  try {
    response = isApiPath(pathname)
      ? await routeApi(request, env, ctx, routes, pathname)
      : await env.ASSETS.fetch(request);
  } catch (err) {
    const name = err instanceof Error ? err.name : typeof err;
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
    console.error("request failed", {
      method: request.method,
      path: isApiPath(pathname) ? pathname : "(asset)",
      name,
      code,
    });
    response = apiError(500, "E_INTERNAL");
  }
  return withSecurityHeaders(response, env);
}

/**
 * `GET /api/health` (docs/02 §5): product, version (the Worker's package.json), build (the Worker Version id from the
 * `version_metadata` binding, the id `wrangler rollback` takes) and server time.
 * @param {{ PRODUCT: string, VERSION?: WorkerVersionMetadata }} env
 * @param {string} version
 */
export function health(env, version) {
  return json({ product: env.PRODUCT, version, build: env.VERSION?.id ?? null, time: new Date().toISOString() });
}
