import { describe, expect, it } from "vitest";
import { VO2_REFERENCE_CONFIG } from "./defaults";
import { validateConfig } from "./validation";

describe("optothermal configuration validation", () => {
  it("accepts the migrated VO2 reference preset", () => {
    expect(validateConfig(VO2_REFERENCE_CONFIG).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("rejects a time window that truncates the pulse", () => {
    const issues = validateConfig({ ...VO2_REFERENCE_CONFIG, durationNs: 2 });
    expect(issues.some((issue) => issue.id === "duration-window" && issue.severity === "error")).toBe(true);
  });

  it("warns when the radial boundary is too close", () => {
    const issues = validateConfig({ ...VO2_REFERENCE_CONFIG, radiusUm: 20 });
    expect(issues.some((issue) => issue.id === "radial-domain" && issue.severity === "warning")).toBe(true);
  });
});
