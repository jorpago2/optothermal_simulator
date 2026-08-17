import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const viewports = [
  { name: "small-mobile", width: 320, height: 720 },
  { name: "mobile", width: 375, height: 812 },
  { name: "large-mobile", width: 414, height: 896 },
  { name: "tablet", width: 768, height: 900 },
  { name: "small-desktop", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
];

const expectAccessible = async (page: Page) => {
  const results = await new AxeBuilder({ page }).exclude(".js-plotly-plot").analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
};

test.beforeAll(async () => {
  await mkdir("tests/artifacts", { recursive: true });
});

test("configuration shell remains usable across Carbon breakpoints", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("./");
    await expect(page.getByRole("link", { name: "Optothermal Simulator" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Single-position model" })).toBeVisible();
    if (viewport.width >= 1056) {
      await expect(page.getByRole("img", { name: /Optical stack and beam/ })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Optical and phase model" })).toHaveAttribute("aria-expanded", "false");
    if (viewport.width === 320) {
      const panel = page.locator(".scientific-workbench__panel");
      const panelBody = page.locator(".scientific-task-panel__body");
      await panelBody.hover();
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(100);
      expect(await panelBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
      await page.getByRole("button", { name: "Close configuration" }).click();
      await expect(page.getByRole("heading", { name: "Optical stack and beam" })).toBeVisible();
      await expect(page.locator('.scientific-tool-rail__item[aria-current="page"]')).toContainText("Configure");
    }
    const fit = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(fit.content).toBeLessThanOrEqual(fit.viewport);
    await page.screenshot({ path: `tests/artifacts/${viewport.name}-configuration.png` });
  }
});

test("run overview presents the experiment visually and updates with the configuration", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "Optical stack and beam" })).toBeVisible();
  await expect(page.getByText("Substrate-side incidence · axisymmetric r–z · not to scale")).toBeVisible();
  await expect(page.getByText("Radial domain", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Model scope", { exact: true })).toBeHidden();

  const waist = page.getByLabel("Beam waist w₀ in µm");
  await waist.fill("15");
  await waist.press("Enter");
  await expect(page.locator(".experiment-diagram__annotation--waist")).toContainText("15µm");

  const [diagramBounds, overviewBounds] = await Promise.all([
    page.locator(".experiment-diagram").boundingBox(),
    page.locator(".experiment-overview").boundingBox(),
  ]);
  expect(Math.abs((diagramBounds?.width ?? 0) - (overviewBounds?.width ?? 0))).toBeLessThanOrEqual(1);

  const cards = page.locator("#configure-view .scientific-evidence-summary__checks > li");
  await expect(cards).toHaveCount(7);
  await expect(cards).toContainText([
    "Parameter ranges",
    "Pulse resolution",
    "Radial boundary",
    "Gaussian source resolution",
    "Substrate diffusion resolution",
    "Film control volume",
    "Browser mesh",
  ]);
  const rows = await cards.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBeLessThanOrEqual(2);
  await expect(page.locator("#configure-view").getByText("All required values are finite and within solver limits.")).toHaveCount(0);
  const checksBounds = await page.locator("#configure-view .scientific-evidence-summary").boundingBox();
  expect(checksBounds?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(diagramBounds?.height ?? 0);
  await expect(page.locator(".experiment-overview")).toHaveScreenshot("reference-overview.png", { animations: "disabled", maxDiffPixelRatio: 0.01 });
  await expectAccessible(page);
});

test("configuration closure restores focus to the React navigation trigger", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");

  const configure = page.getByRole("button", { name: "Configure", exact: true });
  const close = page.getByRole("button", { name: "Close configuration" });
  const controlledRegions = await page.locator(".scientific-tool-rail__item").evaluateAll((items) => items.map((item) => item.getAttribute("aria-controls")));
  for (const id of controlledRegions) {
    expect(id).not.toBeNull();
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }

  await close.click();
  await expect(page.locator(".scientific-workbench__panel")).toBeHidden();
  await expect(configure).toBeFocused();

  await configure.click();
  await page.getByLabel("Wavelength in µm").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".scientific-workbench__panel")).toBeHidden();
  await expect(configure).toBeFocused();
});

test("skip link moves keyboard focus to the simulation workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");

  const skipLink = page.getByRole("link", { name: "Skip to simulation workspace" });
  await expect(skipLink).toHaveJSProperty("tabIndex", 0);
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.locator("#optothermal-workspace")).toBeFocused();
});

test("reference simulation produces plots, validation evidence and export", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Optothermal pulse completed" })).toBeVisible();
  await expect(page.locator(".plot-surface")).toHaveCount(4);
  await expect(page.locator(".plot-data-summary")).toHaveCount(4);
  await page.locator(".plot-data-summary summary").first().click();
  await expect(page.locator(".plot-data-summary").first()).toContainText("Temperature range");
  await expect(page.locator(".plot-column")).toHaveCount(2);
  await expect(page.locator(".plot-column").first().locator(".scientific-plot-frame")).toHaveCount(2);
  await expect(page.locator(".plot-column").last().locator(".scientific-plot-frame")).toHaveCount(2);
  await expect(page.getByText(/Rust\/WASM/).last()).toBeVisible();
  await page.getByText("Final map", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Final near-surface temperature" })).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/desktop-results.png", fullPage: true });
  await expectAccessible(page);

  await page.getByRole("button", { name: "Validation" }).click();
  await expect(page.getByRole("heading", { name: "Model and validation" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Core checks passed; convergence pending/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Linear convergence: Passed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Optical passivity: Passed" })).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/desktop-validation.png", fullPage: true });
});

test("React owns result freshness, export feedback and stable plot mounting", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Optothermal pulse completed" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export result" }).click();
  await download;
  await expect(page.getByText("optothermal-vo2-result.json")).toBeVisible();
  await expect(page.getByText("Browser downloads")).toBeVisible();

  await page.getByRole("button", { name: "Configure", exact: true }).click();
  const waist = page.getByLabel("Beam waist w₀ in µm");
  await waist.fill("13");
  await waist.press("Enter");
  await expect(page.getByText("Inputs modified", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.getByText("Result is stale", { exact: true })).toBeVisible();
  await expect(page.locator(".js-plotly-plot")).toHaveCount(4);

  await page.getByRole("button", { name: "Validation", exact: true }).click();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.locator(".js-plotly-plot")).toHaveCount(4);

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  await expectAccessible(page);
});

test("a worker failure is represented by React without leaving a stale running state", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: class FailingWorker {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: { message: string }) => void) | null = null;
        postMessage() {
          queueMicrotask(() => this.onerror?.({ message: "Injected worker failure" }));
        }
        terminate() {}
      },
    });
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();

  await expect(page.getByText("Injected worker failure").first()).toBeVisible();
  await expect(page.getByText("Simulation failed", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "No result yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
});

test("all result panels remain reachable on a narrow mobile stage", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();
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
  await expect(page.locator("dt").filter({ hasText: "Ctrl/⌘Enter" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Quick workflow")).toBeHidden();

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/mobile-dark.png" });
  await expect(page.locator("header").first()).toHaveScreenshot("mobile-dark-header.png", { animations: "disabled", maxDiffPixelRatio: 0.01 });
  await expectAccessible(page);

  const duration = page.getByLabel("Simulated window in ns");
  await duration.fill("2");
  await duration.press("Enter");
  await expect(page.getByText("Use at least six pulse FWHM so the Gaussian pulse is contained in the time window.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
});

test("an invalid visible draft cannot run a stale committed value", async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await page.goto("./");

  const wavelength = page.getByLabel("Wavelength in µm");
  await wavelength.fill("-1");
  await wavelength.blur();

  await expect(wavelength).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Reset preset" }).click();
  await expect(wavelength).toHaveValue("1.064");
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
});

test("plot controls stay outside the scientific data region", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Optothermal pulse completed" })).toBeVisible();

  const firstFrame = page.locator(".scientific-plot-frame").first();
  const toolbarHost = firstFrame.locator(".scientific-plot-frame__toolbar");
  const toolbar = firstFrame.getByRole("toolbar", { name: "Plot controls" });
  const plot = firstFrame.locator(".scientific-plot-surface");
  await expect(page.locator(".scientific-plot-surface[role=img]")).toHaveCount(0);
  await expect(page.locator(".scientific-plot-surface[role=group]")).toHaveCount(4);
  await expect(toolbarHost).toBeVisible();
  await expect(toolbar).toBeVisible();

  const [toolbarBounds, plotBounds] = await Promise.all([toolbarHost.boundingBox(), plot.boundingBox()]);
  expect(toolbarBounds?.width).toBeLessThanOrEqual(plotBounds?.width ?? 0);
  expect(toolbarBounds?.y ?? 0).toBeLessThan(plotBounds?.y ?? 0);
  expect((toolbarBounds?.y ?? 0) + (toolbarBounds?.height ?? 0)).toBeLessThanOrEqual(plotBounds?.y ?? 0);

  for (const label of ["Peak map", "Final map"]) {
    const bounds = await page.getByRole("tab", { name: label, exact: true }).boundingBox();
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("narrow configuration keeps the scientific stage out of the panel flow", async ({ page }) => {
  for (const width of [375, 768, 1024]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("./");

    await expect(page.locator(".scientific-workbench__panel")).toBeVisible();
    await expect(page.locator(".scientific-workbench__stage")).toBeHidden();
    await expect(page.locator(".scientific-app-shell")).not.toHaveAttribute("data-stage-preview");
  }
});

test("mobile export confirms the downloaded file inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Optothermal pulse completed" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export/ }).first().click();
  await download;

  const receipt = page.getByRole("status").filter({ hasText: "optothermal-vo2-result.json" }).last();
  await expect(receipt).toBeVisible();
  const [receiptBounds, viewport] = await Promise.all([
    receipt.boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);
  expect(receiptBounds).not.toBeNull();
  expect(receiptBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((receiptBounds?.x ?? 0) + (receiptBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
  expect(receiptBounds?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((receiptBounds?.y ?? 0) + (receiptBounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height + 1);
});

test("validation provenance wraps technical paths without clipping", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  await page.getByRole("button", { name: "Validation", exact: true }).click();

  const reference = page.getByText(/paper_zscan\/simulations\/configs\/materials\/vo2_1064_reference\.json/).last();
  await expect(reference).toBeVisible();
  const dimensions = await reference.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowWrap: getComputedStyle(element).overflowWrap,
    wordBreak: getComputedStyle(element).wordBreak,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(["anywhere", "break-word", "break-all"].includes(dimensions.overflowWrap) || dimensions.wordBreak === "break-all").toBeTruthy();
  const checkHeading = page.locator(".scientific-evidence-summary__check-heading").first();
  const headingLayout = await checkHeading.evaluate((element) => ({
    direction: getComputedStyle(element).flexDirection,
    childTops: Array.from(element.children, (child) => Math.round(child.getBoundingClientRect().top)),
  }));
  expect(headingLayout.direction).toBe("row");
  expect(new Set(headingLayout.childTops).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("plots fit the viewport after reopening Results at a narrower size", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".js-plotly-plot")).toHaveCount(4);

  await page.getByRole("button", { name: "Configure", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.locator(".plot-surface")).toHaveCount(4);
  await page.waitForTimeout(200);

  const dimensions = await page.locator(".plot-surface").evaluateAll((surfaces) => surfaces.map((surface) => {
    const svg = surface.querySelector("svg.main-svg");
    return {
      clientWidth: surface.clientWidth,
      scrollWidth: surface.scrollWidth,
      svgWidth: svg?.getBoundingClientRect().width ?? 0,
    };
  }));
  for (const dimension of dimensions) {
    expect(dimension.clientWidth).toBeGreaterThan(0);
    expect(dimension.scrollWidth).toBeLessThanOrEqual(dimension.clientWidth + 1);
    expect(dimension.svgWidth).toBeLessThanOrEqual(dimension.clientWidth + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("mobile result metrics form a readable two-by-two summary", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Optothermal pulse completed" })).toBeVisible();

  const metrics = page.locator(".scientific-outcome-summary .scientific-metric");
  await expect(metrics).toHaveCount(4);
  const boxes = await metrics.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: Math.round(box.left), top: Math.round(box.top), width: box.width, height: box.height };
  }));
  expect(new Set(boxes.map((box) => box.top)).size).toBe(2);
  expect(new Set(boxes.map((box) => box.left)).size).toBe(2);
  expect(Math.min(...boxes.map((box) => box.width))).toBeGreaterThanOrEqual(120);
  expect(Math.max(...boxes.map((box) => box.height))).toBeLessThanOrEqual(160);
});

test("scientific plot toolbar commands remain visible and actionable in dark theme", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".scientific-plot-frame__toolbar .modebar-btn").first()).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();

  const buttons = page.locator(".scientific-plot-frame__toolbar .modebar-btn");
  const details = await buttons.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    const icon = element.querySelector("svg path");
    return {
      opacity: Number.parseFloat(style.opacity),
      color: style.color,
      iconFill: icon ? getComputedStyle(icon).fill : null,
      pointerEvents: style.pointerEvents,
      disabled: (element as HTMLButtonElement).disabled,
      ariaDisabled: element.getAttribute("aria-disabled"),
      label: element.getAttribute("data-title") ?? element.getAttribute("title"),
    };
  }));
  expect(details.length).toBeGreaterThan(0);
  for (const detail of details) {
    expect(detail.opacity).toBeGreaterThanOrEqual(0.8);
    expect(detail.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(detail.iconFill).toBe(detail.color);
    expect(detail.pointerEvents).not.toBe("none");
    expect(detail.disabled).toBe(false);
    expect(detail.ariaDisabled).not.toBe("true");
    expect(detail.label).toBeTruthy();
  }
});

test("desktop numerical checks do not leave a blank filler cell", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");

  const grid = page.locator("#configure-view .scientific-evidence-summary[data-density=\"compact\"] .scientific-evidence-summary__checks");
  const cells = grid.locator(":scope > li");
  await expect(cells).toHaveCount(7);
  const [gridBounds, lastCellBounds] = await Promise.all([grid.boundingBox(), cells.last().boundingBox()]);
  expect(gridBounds).not.toBeNull();
  expect(lastCellBounds).not.toBeNull();
  expect(Math.abs((lastCellBounds?.x ?? 0) + (lastCellBounds?.width ?? 0) - ((gridBounds?.x ?? 0) + (gridBounds?.width ?? 0)))).toBeLessThanOrEqual(1);
});
