// @ts-check
/**
 * Behaviour of the UI kit that screenshots cannot show (prompt 02 review): modal focus and Escape, a fresh reason on
 * every manager approval, keyboard focus at the stepper limits, the toast's 4 s restarting when shown again.
 * Runs once (French, tablet) on the café style guide.
 */
import { expect, test } from "@playwright/test";

test.beforeEach(({ baseURL: _baseURL }, info) => test.skip(info.project.name !== "fr-1280", "behaviour runs once"));

const URL = "http://localhost:5173/styleguide?lang=fr&theme=light";
const inDialog = () => document.activeElement?.closest('[role="dialog"][aria-modal="true"]') !== null;

test("approval dialog: focus stays inside, Escape closes and gives focus back", async ({ page }) => {
  await page.goto(URL);
  const trigger = page.getByRole("button", { name: "Validation gérant" }).last();
  await trigger.click();
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible();
  expect(await page.evaluate(inDialog)).toBe(true);
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(inDialog), `Tab ${i + 1} stays in the dialog`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("approval dialog: a reopened dialog never keeps the previous reason", async ({ page }) => {
  await page.goto(URL);
  const trigger = page.getByRole("button", { name: "Validation gérant" }).last();
  const modal = page.locator('[role="dialog"][aria-modal="true"]');
  await trigger.click();
  await modal.getByRole("radio", { name: "Casse" }).click();
  for (const d of "1234") await modal.getByRole("button", { name: d, exact: true }).click();
  await expect(modal).toHaveCount(0);
  await trigger.click();
  await expect(modal.locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "1", exact: true })).toBeDisabled();
});

test("sheet: focus stays inside and Escape closes", async ({ page }) => {
  await page.goto(URL);
  await page.getByRole("button", { name: "Café crème", exact: true }).click();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(inDialog)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
});

test("stepper keeps keyboard focus at its minimum", async ({ page }) => {
  await page.goto(URL);
  const minus = page.getByRole("group", { name: "Café noir" }).first().getByRole("button", { name: "Diminuer" });
  await minus.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Enter");
  await expect(minus).toBeFocused();
  await expect(minus).toHaveAttribute("aria-disabled", "true");
});

test("toast stays 4 s after being shown again", async ({ page }) => {
  await page.clock.install();
  await page.goto(URL);
  const again = page.getByRole("button", { name: "Réimprimer" }).last();
  const toast = page.locator('div[role="status"].fixed');
  await again.click();
  await page.clock.runFor(3000);
  await again.click();
  await page.clock.runFor(3000);
  await expect(toast).toBeVisible();
  await page.clock.runFor(1100);
  await expect(toast).toHaveCount(0);
});
