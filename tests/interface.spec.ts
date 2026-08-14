import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 900 },
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
  await expect(page.getByRole("heading", { name: "Pulse response completed" })).toBeVisible();
  await expect(page.locator(".plot-surface")).toHaveCount(4);
  await expect(page.getByText(/Rust\/WASM/).last()).toBeVisible();
  await page.getByText("Final map", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Final r–z temperature" })).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/desktop-results.png", fullPage: true });

  await page.getByRole("button", { name: "Validation" }).click();
  await expect(page.getByRole("heading", { name: "Model and validation" })).toBeVisible();
  await expect(page.getByText("Core checks passed; convergence pending")).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/desktop-validation.png", fullPage: true });
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
