import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const viewports = [
  { name: "small-mobile", width: 320, height: 720 },
  { name: "mobile", width: 375, height: 812 },
  { name: "large-mobile", width: 414, height: 896 },
  { name: "tablet", width: 768, height: 900 },
  { name: "small-desktop", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
];

test.beforeAll(async () => {
  await mkdir("tests/artifacts", { recursive: true });
});

test("configuration shell remains usable across Carbon breakpoints", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("./");
    await expect(page.getByRole("link", { name: "Optothermal Simulator" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Single-position model" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run simulation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Optical and phase model" })).toHaveAttribute("aria-expanded", "false");
    if (viewport.width === 320) {
      const panel = page.locator(".scientific-workbench__panel");
      const panelBody = page.locator(".scientific-task-panel__body");
      await panelBody.hover();
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(100);
      expect(await panelBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
    }
    const fit = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(fit.content).toBeLessThanOrEqual(fit.viewport);
    await page.screenshot({ path: `tests/artifacts/${viewport.name}-configuration.png` });
  }
});

test("reference simulation produces plots, validation evidence and export", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("heading", { name: "Optothermal pulse completed" })).toBeVisible();
  await expect(page.locator(".plot-surface")).toHaveCount(4);
  await expect(page.getByText(/Rust\/WASM/).last()).toBeVisible();
  await page.getByText("Final map", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Final near-surface temperature" })).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/desktop-results.png", fullPage: true });

  await page.getByRole("button", { name: "Validation" }).click();
  await expect(page.getByRole("heading", { name: "Model and validation" })).toBeVisible();
  await expect(page.getByText("Core checks passed; convergence pending")).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/desktop-validation.png", fullPage: true });
});

test("all result panels remain reachable on a narrow mobile stage", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("heading", { name: "Optothermal pulse completed" })).toBeVisible();
  await expect(page.locator(".plot-surface")).toHaveCount(4);

  const stage = page.locator(".scientific-workbench__stage");
  const stageBounds = await stage.boundingBox();
  const titleBounds = await page.getByRole("heading", { name: "Fixed-position response" }).boundingBox();
  expect(titleBounds?.y ?? 0).toBeGreaterThanOrEqual(stageBounds?.y ?? 0);
  await page.screenshot({ path: "tests/artifacts/small-mobile-results.png" });
  expect(await stage.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await stage.evaluate((element) => element.clientHeight));
  await stage.hover();
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(100);
  await expect(page.getByRole("heading", { name: "Peak near-surface temperature" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("help, theme and invalid-input states remain keyboard-accessible", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  await page.getByRole("button", { name: "Help" }).click();
  await expect(page.getByText("Quick workflow")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Quick workflow")).toBeHidden();

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/mobile-dark.png" });

  const duration = page.getByLabel("Simulated window in ns");
  await duration.fill("2");
  await duration.press("Enter");
  await expect(page.getByText("Use at least six pulse FWHM so the Gaussian pulse is contained in the time window.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeDisabled();
});
