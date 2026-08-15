import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4355/optothermal_simulator/",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 4355",
    url: "http://127.0.0.1:4355/optothermal_simulator/",
    reuseExistingServer: true,
  },
});
