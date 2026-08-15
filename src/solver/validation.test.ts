import { describe, expect, it } from "vitest";
import { VO2_REFERENCE_CONFIG } from "./defaults";
import type { OptothermalResult } from "./types";
import { assertValidResult, validateConfig, validateResult } from "./validation";

function validResult(): OptothermalResult {
  return {
    timeNs: [0, 1],
    centerTemperatureC: [25, 26],
    centerMetallicFraction: [0, 0.1],
    centerAbsorptance: [0.2, 0.21],
    radiusUm: [0, 1],
    finalSurfaceTemperatureC: [26, 25],
    peakSurfaceTemperatureC: [26, 25],
    depthUm: [-1, 0],
    finalTemperatureMapC: [[25, 25], [26, 25]],
    peakTemperatureMapC: [[25, 25], [26, 25]],
    metrics: {
      maximumTemperatureC: 26,
      timeAtMaximumNs: 1,
      maximumMetallicFraction: 0.1,
      peakAbsorptance: 0.21,
      absorbedEnergyJ: 1,
      maximumStoredEnergyJ: 0.5,
      averageLinearIterations: 4,
      maximumLinearIterations: 5,
      worstLinearUpdateK: 1e-8,
      worstLinearResidual: 1e-10,
      worstLinearStep: 1,
      linearUpdateToleranceK: 1e-7,
      linearResidualTolerance: 1e-9,
      linearConverged: true,
      storedToAbsorbedRatio: 0.5,
      baselineAbsorptance: 0.2,
      baselineReflectance: 0.3,
      baselineTransmittance: 0.5,
      baselineAbsorptanceRaw: 0.2,
      minimumAbsorptanceRaw: 0.2,
      maximumAbsorptanceRaw: 0.21,
      minimumStoredEnergyJ: 0,
      adiabaticTemperatureRiseK: 1,
      timeStepNs: 1,
      peakFluenceJM2: 1,
    },
    engine: "Rust/WASM",
  };
}

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

  it("blocks a mesh that cannot resolve the beam or substrate diffusion length", () => {
    const issues = validateConfig({
      ...VO2_REFERENCE_CONFIG,
      waistUm: 0.5,
      radiusUm: 5000,
      radialCells: 17,
      substrateDepthUm: 1000,
      substrateCells: 4,
    });
    expect(issues.some((issue) => issue.id === "radial-source-unresolved" && issue.severity === "error")).toBe(true);
    expect(issues.some((issue) => issue.id === "substrate-diffusion-unresolved" && issue.severity === "error")).toBe(true);
  });

  it("validates every result family and convergence evidence", () => {
    const result = validResult();
    expect(validateResult(result)).toEqual({
      schema: true,
      finite: true,
      physicalRanges: true,
      passive: true,
      energyBound: true,
      converged: true,
    });
    result.finalTemperatureMapC[1][1] = Number.NaN;
    expect(validateResult(result).finite).toBe(false);
  });

  it("rejects dimensions that differ from the requested mesh", () => {
    expect(() => assertValidResult(
      { ...VO2_REFERENCE_CONFIG, timeSteps: 3, radialCells: 2, substrateCells: 1 },
      validResult(),
    )).toThrow(/dimensions/i);
  });
});
