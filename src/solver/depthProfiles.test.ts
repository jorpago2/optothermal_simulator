import { describe, expect, it } from "vitest";
import { VO2_REFERENCE_CONFIG } from "./defaults";
import { buildDepthProfile } from "./depthProfiles";
import type { OptothermalResult } from "./types";

function resultFixture(): OptothermalResult {
  return {
    timeNs: [0, 1],
    centerTemperatureC: [25, 30],
    centerMetallicFraction: [0, 0],
    centerAbsorptance: [0.2, 0.2],
    radiusUm: [0, 10],
    finalSurfaceTemperatureC: [0, 0],
    peakSurfaceTemperatureC: [0, 0],
    depthUm: [-1.5, -0.5, 0.0375, 0.1125],
    depthEdgesUm: [-2, -1, 0, 0.075, 0.15],
    finalTemperatureMapC: [[10, 11], [20, 21], [30, 31], [40, 41]],
    peakTemperatureMapC: [[12, 13], [24, 25], [36, 37], [48, 49]],
    metrics: {
      maximumTemperatureC: 30,
      timeAtMaximumNs: 1,
      maximumMetallicFraction: 0,
      peakAbsorptance: 0.2,
      absorbedEnergyJ: 1,
      maximumStoredEnergyJ: 1,
      averageLinearIterations: 1,
      maximumLinearIterations: 1,
      worstLinearUpdateK: 0,
      worstLinearResidual: 0,
      worstLinearStep: 1,
      linearUpdateToleranceK: 1,
      linearResidualTolerance: 1,
      linearConverged: true,
      storedToAbsorbedRatio: 1,
      baselineAbsorptance: 0.2,
      baselineReflectance: 0.3,
      baselineTransmittance: 0.5,
      baselineAbsorptanceRaw: 0.2,
      minimumAbsorptanceRaw: 0.2,
      maximumAbsorptanceRaw: 0.2,
      minimumStoredEnergyJ: 0,
      adiabaticTemperatureRiseK: 1,
      timeStepNs: 1,
      peakFluenceJM2: 1,
    },
    engine: "Rust/WASM",
  };
}

describe("depth profiles", () => {
  it("keeps local peak and final snapshot as separate cell-wise series", () => {
    const profile = buildDepthProfile(resultFixture(), { ...VO2_REFERENCE_CONFIG, substrateCells: 2, filmCells: 2 }, 1);

    expect(profile.radiusUm).toBe(10);
    expect(profile.peakTemperatureC).toEqual([13, 25, 37, 49]);
    expect(profile.finalTemperatureC).toEqual([11, 21, 31, 41]);
  });

  it("uses physical cell widths for the film mean and half-cell conductances at the interface", () => {
    const profile = buildDepthProfile(resultFixture(), {
      ...VO2_REFERENCE_CONFIG,
      substrateCells: 2,
      filmCells: 2,
      substrateConductivityWMK: 1,
      filmConductivityWMK: 10,
    }, 0);

    expect(profile.summary.filmWeightedMean.meanOfLocalMaximaUpperBoundC).toBeCloseTo(42, 12);
    expect(profile.summary.filmWeightedMean.finalTemperatureC).toBeCloseTo(35, 12);
    expect(profile.summary.surface.peakTemperatureC).toBe(48);
    expect(profile.summary.surface.finalTemperatureC).toBe(40);
    expect(profile.summary.interfaceApproximation.interfacePeakBoundC).toBeCloseTo((0.00375 * 24 + 0.5 * 36) / 0.50375, 12);
    expect(profile.summary.interfaceApproximation.finalTemperatureC).toBeCloseTo((0.00375 * 20 + 0.5 * 30) / 0.50375, 12);
    expect(profile.summary.interfaceApproximation.lowerDepthUm).toBe(-0.5);
    expect(profile.summary.interfaceApproximation.upperDepthUm).toBe(0.0375);
    expect(profile.filmInterfaceRangeUm).toEqual([-0.5, 0.15]);
  });

  it("clamps an out-of-range radius index", () => {
    const result = resultFixture();
    expect(buildDepthProfile(result, { ...VO2_REFERENCE_CONFIG, substrateCells: 2, filmCells: 2 }, 99).radiusIndex).toBe(1);
  });

  it("rejects invalid depth coordinates instead of inventing equal cell weights", () => {
    const result = resultFixture();
    result.depthEdgesUm[2] = result.depthEdgesUm[1];
    expect(() => buildDepthProfile(result, { ...VO2_REFERENCE_CONFIG, substrateCells: 2, filmCells: 2 }, 0)).toThrow(/depth edges.*strictly increasing/i);
  });
});
