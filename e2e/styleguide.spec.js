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

      // D12 and docs/07 §5: product tiles ≥ 96 × 96, keypad keys ≥ 64 × 56 (exact in French; Arabic scales with the
      // 106.66 % root size of docs/07 §3), staff buttons 56, office buttons 40.
      const tiles = await page.locator("main button[aria-pressed]").all();
      expect(tiles.length, "tiles found").toBeGreaterThanOrEqual(8);
      for (const tile of tiles) {
        const box = await tile.boundingBox();
        expect(box && box.width >= 96 && box.height >= 96, "tile ≥ 96 × 96").toBe(true);
      }
      const keys = await page
        .getByRole("group", { name: /pavé|لوحة/i })
        .first()
        .locator("button")
        .all();
      expect(keys.length, "keypad keys found").toBe(12);
      const key = await keys[0].boundingBox();
      expect(key && Math.round(key.width) >= 64 && Math.round(key.height) >= 56, "key ≥ 64 × 56").toBe(true);
      if (lang === "fr") {
        expect([Math.round(key?.width ?? 0), Math.round(key?.height ?? 0)], "key 64 × 56").toEqual([64, 56]);
        const sizes = await page.evaluate(() =>
          [...document.querySelectorAll("main section:nth-of-type(3) button")].map((b) =>
            Math.round(b.getBoundingClientRect().height),
          ),
        );
        expect(sizes.filter((h) => h === 56).length, "staff buttons 56 px").toBeGreaterThanOrEqual(5);
        expect(sizes.filter((h) => h === 40).length, "office buttons 40 px").toBe(2);
      }

      // Selected tile (docs/07 §5): brand bar of 3 px on the start side only.
      const border = await page
        .locator('main button[aria-pressed="true"]')
        .first()
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return { start: cs.borderInlineStartWidth, startColour: cs.borderInlineStartColor, top: cs.borderTopColor };
        });
      expect(border.start).toBe("3px");
      expect(border.startColour).not.toBe(border.top);

      // No horizontal page scroll (tables scroll inside their own frame).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(0);

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
