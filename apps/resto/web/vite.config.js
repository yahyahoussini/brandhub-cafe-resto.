// @ts-check
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Vite for the PWA. Prompt 02 only serves the dev-only style guide at /styleguide/ (`npm run styleguide`); prompt 11
 * adds the app's routes and the build. Everything is bundled, fonts included: no request leaves the device.
 */
/** Serves the style guide at /styleguide as well as /styleguide/. */
/** @type {import("vite").Plugin} */
const styleguideRoute = {
  name: "brandhub-styleguide-route",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/styleguide" || req.url?.startsWith("/styleguide?")) {
        res.statusCode = 302;
        res.setHeader("Location", req.url.replace("/styleguide", "/styleguide/"));
        return res.end();
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [preact(), tailwindcss(), styleguideRoute],
  server: { strictPort: true },
});
