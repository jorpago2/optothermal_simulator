import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

async function openApp(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "I understand — Continue", exact: true }).click();
}
async function run(page: Page) {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Optothermal pulse completed" })).toBeVisible();
}
async function downloadPayload(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

for (const width of [375, 1440]) {
  test(`named cases compare, export and survive reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await run(page);
    await page.getByRole("button", { name: "Compare and save", exact: true }).click();
    await page.getByLabel("Case name", { exact: true }).fill("Reference");
    await page.getByRole("button", { name: "Save current case" }).click();
    await page.getByRole("button", { name: "Configure", exact: true }).click();
    await page.getByLabel("Peak intensity in GW/cm²").fill("0.001");
    await page.getByLabel("Peak intensity in GW/cm²").press("Tab");
    await run(page);
    await page.getByRole("button", { name: "Studies", exact: true }).click();
    await page.getByLabel("Case name", { exact: true }).fill("Low power");
    await page.getByRole("button", { name: "Save current case" }).click();
    await expect(page.getByRole("checkbox", { name: "Reference", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Low power", exact: true })).toBeChecked();
    await expect(page.getByRole("group", { name: "Compared simulation curves" })).toBeVisible();
    await expect(page.locator(".case-differences")).toContainText("Peak intensity: 0.01 → 0.001 GW/cm²");
    await page.getByLabel("Compare curves", { exact: true }).selectOption("phase");
    const payload = await downloadPayload(page, "Export cases");
    expect(payload.cases.map((entry: { name: string }) => entry.name)).toEqual(["Reference", "Low power"]);
    expect(payload.cases[0].result.metrics.maximumTemperatureC).toBeGreaterThan(payload.cases[1].result.metrics.maximumTemperatureC);
    await page.getByRole("button", { name: "Use dark theme" }).click();
    const accessibility = await new AxeBuilder({ page }).exclude(".js-plotly-plot").analyze();
    expect(accessibility.violations.filter((entry) => ["serious", "critical"].includes(entry.impact ?? ""))).toEqual([]);
    await page.screenshot({ path: `tests/artifacts/studies-comparison-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await openApp(page);
    await page.getByRole("button", { name: "Studies", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Reference", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Low power", exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Load configuration Low power", exact: true }).click();
    await expect(page.getByLabel("Peak intensity in GW/cm²")).toHaveValue("0.001");
  });
}

test("independent refinements export numerical evidence tied to the original configuration", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await page.getByRole("tab", { name: "Refine", exact: true }).click();
  await page.getByLabel("Difference tolerance (%)").fill("");
  await expect(page.getByRole("button", { name: "Run convergence study" })).toBeDisabled();
  await page.getByLabel("Difference tolerance (%)").fill("1");
  await page.getByRole("button", { name: "Run convergence study" }).click();
  await expect(page.getByText("Completed · 5 / 5 runs", { exact: true })).toBeVisible({ timeout: 30000 });
  const payload = await downloadPayload(page, "Export study");
  expect(payload.state).toBe("completed");
  expect(payload.cases).toHaveLength(5);
  const baseline = payload.cases[0].config;
  for (const entry of payload.cases.slice(1)) {
    const differences = Object.keys(baseline).filter((key) => entry.config[key] !== baseline[key]);
    expect(differences).toHaveLength(1);
    expect(["radialCells", "filmCells", "substrateCells", "timeSteps"]).toContain(differences[0]);
  }
  await run(page);
  await expect(page.getByText(/A refinement comparison is available in Studies/)).toBeVisible();
  const result = await downloadPayload(page, "Export result");
  expect(result.convergence.comparisons).toHaveLength(4);
  expect(result.convergence.complete).toBe(true);
});

test("sweep validates the whole plan and reports completed points on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("tab", { name: "Sweep", exact: true }).click();
  const studyBounds = await page.locator(".studies-workspace").boundingBox();
  expect(studyBounds!.x).toBeGreaterThanOrEqual(0);
  for (const box of await page.locator(".study-card").evaluateAll((elements) => elements.map((element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })))) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(375);
  }
  await page.getByLabel("Sweep parameter", { exact: true }).selectOption("pulseFwhmNs");
  await page.getByLabel("End value", { exact: true }).fill("10");
  await expect(page.getByRole("button", { name: "Run parameter sweep" })).toBeDisabled();
  await expect(page.locator(".study-error")).toContainText("six pulse FWHM");
  await page.getByLabel("Sweep parameter", { exact: true }).selectOption("peakIntensityGwCm2");
  await page.getByLabel("Sweep points (2–12)", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Run parameter sweep" }).click();
  await expect(page.getByText("Completed · 3 / 3 runs", { exact: true })).toBeVisible();
  const payload = await downloadPayload(page, "Export study");
  expect(payload.cases).toHaveLength(3);
  expect(payload.cases[0].config.peakIntensityGwCm2).toBeCloseTo(0.005);
  expect(payload.cases[2].config.peakIntensityGwCm2).toBeCloseTo(0.015);
  await expect(page.getByRole("group", { name: "Sweep peak temperature" })).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/studies-sweep-mobile.png" });
});

test("cancelling a study terminates its worker and launches no further cases", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { studyWorkers: number }).studyWorkers = 0;
    Object.defineProperty(window, "Worker", { configurable: true, value: class PendingWorker {
      constructor() { (window as unknown as { studyWorkers: number }).studyWorkers += 1; }
      postMessage() {}
      terminate() {}
    } });
  });
  await openApp(page);
  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await page.getByRole("tab", { name: "Sweep", exact: true }).click();
  await page.getByRole("button", { name: "Run parameter sweep" }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  await expect(page.getByLabel("Peak intensity in GW/cm²")).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await expect(page.getByText("Cancelled — partial results retained · 0 / 5 runs", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run parameter sweep" })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { studyWorkers: number }).studyWorkers)).toBe(1);
});

test("depth profiles select radius and distinguish the local-maxima bound from the final snapshot", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openApp(page);
  await run(page);
  await expect(page.getByRole("heading", { name: "Thermal depth profile" })).toBeVisible();
  await page.getByLabel("Radius", { exact: true }).selectOption("1");
  const depthFrame = page.getByRole("region", { name: "Thermal depth profile", exact: true });
  const filmTicks = await depthFrame.locator(".xtick text").allTextContents();
  await page.getByLabel("View extent", { exact: true }).selectOption({ label: "Full depth" });
  await expect.poll(() => depthFrame.locator(".xtick text").allTextContents()).not.toEqual(filmTicks);
  await expect(page.getByText(/upper bound/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  const accessibility = await new AxeBuilder({ page }).exclude(".js-plotly-plot").analyze();
  expect(accessibility.violations.filter((entry) => ["serious", "critical"].includes(entry.impact ?? ""))).toEqual([]);
  await page.screenshot({ path: "tests/artifacts/depth-profile-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("failed study retains completed points and exports partial evidence", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let workers = 0;
    Object.defineProperty(window, "Worker", { configurable: true, value: class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: { message: string }) => void) | null = null;
      inner?: Worker;
      constructor(url: string | URL, options?: WorkerOptions) {
        if (++workers !== 2) {
          this.inner = new NativeWorker(url, options);
          this.inner.onmessage = (event) => this.onmessage?.(event);
          this.inner.onerror = (event) => this.onerror?.(event);
        }
      }
      postMessage(value: unknown) { if (this.inner) this.inner.postMessage(value); else queueMicrotask(() => this.onerror?.({ message: "Injected second-point failure" })); }
      terminate() { this.inner?.terminate(); }
    } });
  });
  await openApp(page);
  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await page.getByRole("tab", { name: "Refine", exact: true }).click();
  await page.getByRole("button", { name: "Run convergence study" }).click();
  await expect(page.getByText("Failed — partial results retained · 1 / 5 runs", { exact: true })).toBeVisible();
  const study = await downloadPayload(page, "Export study");
  expect(study.state).toBe("failed");
  expect(study.cases).toHaveLength(1);
  await run(page);
  const result = await downloadPayload(page, "Export result");
  expect(result.convergence.complete).toBe(false);
  expect(result.convergence.comparisons).toHaveLength(0);
  await expect(page.getByText(/partial; 0 directions checked/)).toBeVisible();
});

test("storage quota failure keeps a case exportable without claiming it was saved", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "optothermal-simulator:cases") throw new DOMException("Storage full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await openApp(page);
  await run(page);
  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await page.getByLabel("Case name", { exact: true }).fill("Unsaved case");
  await page.getByRole("button", { name: "Save current case" }).click();
  await expect(page.getByText("Added “Unsaved case” to this tab only. Export to retain it.", { exact: true })).toBeVisible();
  const payload = await downloadPayload(page, "Export cases");
  expect(payload.cases).toHaveLength(1);
});
