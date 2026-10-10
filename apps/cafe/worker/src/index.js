// @ts-check
/**
 * BrandHub Café Worker (cafe.brandhub.ma, docs/02 §4): the `/api/*` routes, the built PWA for every other path, the
 * headers of docs/08 §7 on every response, and the crons declared in wrangler.jsonc.
 */
import { handleFetch, health } from "@brandhub/kit-worker/http";
import pkg from "../package.json" with { type: "json" };

export { CafeStore } from "./cafe-store.js";

/** @typedef {import("@brandhub/kit-worker/env").ProductEnv} Env */

/** @type {readonly import("@brandhub/kit-worker/http").Route<Env>[]} */
const routes = [{ method: "GET", path: "/api/health", handler: (_request, env) => health(env, pkg.version) }];

export default /** @satisfies {ExportedHandler<Env>} */ ({
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  fetch(request, env, ctx) {
    return handleFetch(request, env, ctx, routes);
  },

  /**
   * The crons of docs/02 §4: `*\/15 * * * *` for the evening reports (prompt 18) and `30 2 * * *` for the nightly
   * export (docs/12 §8). Declared now so the deployed schedule matches the spec; nothing runs yet.
   * @param {ScheduledController} _controller
   * @param {Env} _env
   * @param {ExecutionContext} _ctx
   */
  async scheduled(_controller, _env, _ctx) {},
});
