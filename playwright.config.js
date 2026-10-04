// @ts-check
import { defineConfig } from "@playwright/test";

/** French and Arabic, at phone (360 × 800) and tablet (1280 × 800) sizes (D44). */
const languages = /** @type {const} */ ([
  { name: "fr", locale: "fr-MA" },
  { name: "ar", locale: "ar-MA" },
]);
const viewports = /** @type {const} */ ([
  { name: "360", width: 360, height: 800 },
  { name: "1280", width: 1280, height: 800 },
]);

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: languages.flatMap((lang) =>
    viewports.map((vp) => ({
      name: `${lang.name}-${vp.name}`,
      metadata: { lang: lang.name },
      use: { browserName: "chromium", locale: lang.locale, viewport: { width: vp.width, height: vp.height } },
    })),
  ),
});
