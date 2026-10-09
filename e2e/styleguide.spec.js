// @ts-check
/**
 * Prompt 02: the dev-only style guide of both apps in French and Arabic, light and dark, at 360 × 800 and
 * 1280 × 800 (the four Playwright projects × two themes). Checks that nothing is requested outside the dev server
 * (fonts bundled, no CDN), that Arabic is right to left in IBM Plex Sans Arabic, and the sizes of D12.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const APPS = /** @type {const} */ ([
  ["cafe", 5173],
  ["resto", 5174],
]);
const OUT = "test-results/styleguide";

for (const [app, port] of APPS) {
  for (const theme of /** @type {const} */ (["light", "dark"])) {
    test(`${app} style guide, ${theme}`, async ({ page }, info) => {
      const lang = /** @type {"fr" | "ar"} */ (info.project.metadata.lang);
      const width = page.viewportSize()?.width;
      /** @type {string[]} */
      const requests = [];
      page.on("request", (r) => requests.push(r.url()));

      await page.goto(`http://localhost:${port}/styleguide?lang=${lang}&theme=${theme}`);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);

      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const fonts = await page.evaluate(() =>
        [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`),
      );
      expect(fonts.some((f) => f.includes(lang === "ar" ? "IBM Plex Sans Arabic" : "DM Sans"))).toBe(true);
      expect(fonts.some((f) => f.includes("DM Serif Display"))).toBe(true);

      // D12 and docs/07 §5: product tiles ≥ 96 × 96, keypad keys ≥ 64 × 56.
      for (const tile of await page.locator("main button[aria-pressed]").all()) {
        const box = await tile.boundingBox();
        expect(box && box.width >= 96 && box.height >= 96, "tile ≥ 96 × 96").toBe(true);
      }
      const key = await page
        .getByRole("group", { name: /pavé|لوحة/i })
        .first()
        .locator("button")
        .first()
        .boundingBox();
      expect(key && Math.round(key.width) >= 64 && Math.round(key.height) >= 56, "key ≥ 64 × 56").toBe(true);

      mkdirSync(OUT, { recursive: true });
      const base = `${OUT}/${app}-${lang}-${theme}-${width}`;
      await page.screenshot({ path: `${base}.png`, fullPage: true });

      const hosts = [...new Set(requests.map((u) => new URL(u).host))];
      writeFileSync(
        `${base}.network.json`,
        JSON.stringify({ hosts, count: requests.length, fonts, requests }, null, 2),
      );
      expect(hosts, "no request leaves the dev server").toEqual([`localhost:${port}`]);
      await info.attach("screenshot", { path: `${base}.png`, contentType: "image/png" });
    });
  }
}
