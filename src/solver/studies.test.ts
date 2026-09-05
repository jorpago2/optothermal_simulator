import { describe, expect, it } from "vitest";
import { VO2_REFERENCE_CONFIG } from "./defaults";
import {
  DEFAULT_COMPARISON_TOLERANCES,
  buildConvergencePlan,
  buildSweepPlan,
  changedParameters,
  compareResults,
  thermalTransitionDuration,
  type StudyCase,
} from "./studies";
import type { OptothermalConfig, OptothermalResult } from "./types";

function result(overrides: Partial<OptothermalResult["metrics"]> = {}, phase = [0, 0]): OptothermalResult {
  return {
    timeNs: [0, 1],
    centerTemperatureC: [25, 25],
    centerMetallicFraction: phase,
    centerAbsorptance: [0.2, 0.2],
    radiusUm: [0, 1],
    finalSurfaceTemperatureC: [25, 25],
    peakSurfaceTemperatureC: [25, 25],
    depthUm: [-1, 0],
    depthEdgesUm: [-1.5, -0.5, 0.5],
    finalTemperatureMapC: [[25, 25], [25, 25]],
    peakTemperatureMapC: [[25, 25], [25, 25]],
    metrics: {
      maximumTemperatureC: 25,
      timeAtMaximumNs: 1,
      maximumMetallicFraction: phase.at(-1) ?? 0,
      peakAbsorptance: 0.2,
      absorbedEnergyJ: 1,
      maximumStoredEnergyJ: 0.2,
      averageLinearIterations: 1,
      maximumLinearIterations: 1,
      worstLinearUpdateK: 0,
      worstLinearResidual: 0,
      worstLinearStep: 1,
      linearUpdateToleranceK: 1,
      linearResidualTolerance: 1,
      linearConverged: true,
      storedToAbsorbedRatio: 0.2,
      baselineAbsorptance: 0.2,
      baselineReflectance: 0.4,
      baselineTransmittance: 0.4,
      baselineAbsorptanceRaw: 0.2,
      minimumAbsorptanceRaw: 0.2,
      maximumAbsorptanceRaw: 0.2,
      minimumStoredEnergyJ: 0,
      adiabaticTemperatureRiseK: 0,
      timeStepNs: 1,
      peakFluenceJM2: 1,
      ...overrides,
    },
    engine: "Rust/WASM",
  };
}

function study(config: OptothermalConfig = VO2_REFERENCE_CONFIG, resultValue = result()): StudyCase {
  return { id: "case", name: "Case", config, result: resultValue };
}

describe("study planning", () => {
  it("includes a baseline and independent factor-two convergence cases", () => {
    const plan = buildConvergencePlan(VO2_REFERENCE_CONFIG);
    expect(plan).toHaveLength(5);
    expect(plan[0]).toMatchObject({ id: "baseline", config: VO2_REFERENCE_CONFIG });
    expect(plan.slice(1).map((entry) => entry.field)).toEqual([
      "radialCells", "filmCells", "substrateCells", "timeSteps",
    ]);
    expect(plan.slice(1).every((entry) => entry.config !== plan[0].config)).toBe(true);
    expect(plan[1].config.radialCells).toBe(129);
    expect(plan[2].config.filmCells).toBe(48);
    expect(plan[3].config.substrateCells).toBe(128);
    expect(plan[4].config.timeSteps).toBe(481);
    expect(plan.slice(1).every((entry) => entry.name.includes("→"))).toBe(true);
  });

  it("caps refinements and marks field-limit and mesh-limit cases skipped", () => {
    const capped = buildConvergencePlan({ ...VO2_REFERENCE_CONFIG, radialCells: 200, filmCells: 64, substrateCells: 128, timeSteps: 1200 });
    expect(capped.find((entry) => entry.field === "filmCells")?.skippedReason).toMatch(/already at its limit/i);
    expect(capped.find((entry) => entry.field === "substrateCells")?.skippedReason).toMatch(/already at its limit/i);
    expect(capped.find((entry) => entry.field === "timeSteps")?.skippedReason).toMatch(/already at its limit/i);
    const radial = capped.find((entry) => entry.field === "radialCells");
    expect(radial?.config.radialCells).toBe(257);
    expect(radial?.skippedReason).toMatch(/40,000/);
    expect(radial?.name).toContain("200");
    expect(radial?.name).toContain("257");
  });

  it("builds an inclusive linear sweep without mutating unrelated parameters", () => {
    const config = { ...VO2_REFERENCE_CONFIG, durationNs: 24 };
    const plan = buildSweepPlan(config, "pulseFwhmNs", 1, 4, 4);
    expect(plan.map((entry) => entry.config.pulseFwhmNs)).toEqual([1, 2, 3, 4]);
    expect(plan.every((entry) => entry.field === "pulseFwhmNs")).toBe(true);
    expect(plan.every((entry) => entry.config.durationNs === 24)).toBe(true);
  });

  it("rejects invalid counts and every sweep case that truncates the pulse", () => {
    expect(() => buildSweepPlan(VO2_REFERENCE_CONFIG, "peakIntensityGwCm2", 0.01, 0.02, 1)).toThrow(/2 and 12/);
    expect(() => buildSweepPlan(VO2_REFERENCE_CONFIG, "pulseFwhmNs", 1, 3, 3)).toThrow(/invalid configurations|duration window/i);
    expect(() => buildSweepPlan(VO2_REFERENCE_CONFIG, "peakIntensityGwCm2", 0.01, 0.01, 3)).toThrow(/differ/);
  });
});

describe("result comparisons", () => {
  it("uses a one-kelvin floor for temperature rise and an energy floor", () => {
    const base = study(VO2_REFERENCE_CONFIG, result({ maximumTemperatureC: 25.5, absorbedEnergyJ: 0 }));
    const candidate = study(VO2_REFERENCE_CONFIG, result({ maximumTemperatureC: 25.6, absorbedEnergyJ: 1e-19 }));
    const comparison = compareResults(base, candidate, {
      ...DEFAULT_COMPARISON_TOLERANCES,
      temperatureRiseRelative: 0.11,
      energyRelative: 0.2,
    });
    expect(comparison.temperatureRiseBaseK).toBeCloseTo(0.5);
    expect(comparison.temperatureRiseRelative).toBeCloseTo(0.1);
    expect(comparison.energyRelative).toBeCloseTo(0.1);
    expect(comparison.withinTolerance.temperatureRise).toBe(true);
    expect(comparison.withinTolerance.energy).toBe(true);
  });

  it("reports pairwise metallic and tolerance status without claiming universal convergence", () => {
    const base = study(VO2_REFERENCE_CONFIG, result({ maximumTemperatureC: 100, maximumMetallicFraction: 0.2, absorbedEnergyJ: 1 }));
    const candidate = study(VO2_REFERENCE_CONFIG, result({ maximumTemperatureC: 110, maximumMetallicFraction: 0.25, absorbedEnergyJ: 1.2 }));
    const comparison = compareResults(base, candidate, { temperatureRiseRelative: 0.01, metallicFractionAbsolute: 0.01, energyRelative: 0.01 });
    expect(comparison.metallicFractionAbsoluteDelta).toBeCloseTo(0.05);
    expect(comparison.status).toBe("outside-tolerance");
    expect("converged" in comparison).toBe(false);
  });

  it("returns readable changed parameters for configs or study cases", () => {
    const changed = changedParameters(VO2_REFERENCE_CONFIG, { ...VO2_REFERENCE_CONFIG, filmThicknessNm: 200, timeSteps: 482 });
    expect(changed).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "filmThicknessNm", label: "Film thickness", unit: "nm", before: 150, after: 200 }),
      expect.objectContaining({ field: "timeSteps", label: "Time samples", unit: "samples", before: 241, after: 482 }),
    ]));
    expect(changedParameters(study(), study({ ...VO2_REFERENCE_CONFIG, radialCells: 129 }))).toEqual([
      expect.objectContaining({ field: "radialCells", before: 65, after: 129 }),
    ]);
  });
});

describe("thermal transition duration", () => {
  it("interpolates entry and exit crossings and bounds them to the time window", () => {
    const transition = thermalTransitionDuration({ ...result(), timeNs: [0, 2, 5, 8], centerMetallicFraction: [0, 0.25, 0.75, 0.25] });
    expect(transition.startsMetallic).toBe(false);
    expect(transition.endsMetallic).toBe(false);
    expect(transition.startNs).toBeCloseTo(3.5);
    expect(transition.endNs).toBeCloseTo(6.5);
    expect(transition.durationNs).toBeCloseTo(3);
  });

  it("uses the end of the window when the signal remains metallic", () => {
    const transition = thermalTransitionDuration({ ...result(), timeNs: [2, 4, 6], centerMetallicFraction: [0, 0.8, 0.9] });
    expect(transition.startsMetallic).toBe(false);
    expect(transition.endsMetallic).toBe(true);
    expect(transition.startNs).toBeCloseTo(3.25);
    expect(transition.endNs).toBe(6);
    expect(transition.durationNs).toBeCloseTo(2.75);
  });

  it("sums separate metallic episodes while retaining the outer crossing times", () => {
    const transition = thermalTransitionDuration({ ...result(), timeNs: [0, 2, 4, 6, 8], centerMetallicFraction: [0, 1, 0, 1, 0] });
    expect(transition.startsMetallic).toBe(false);
    expect(transition.endsMetallic).toBe(false);
    expect(transition.startNs).toBeCloseTo(1);
    expect(transition.endNs).toBeCloseTo(7);
    expect(transition.durationNs).toBeCloseTo(4);
  });

  it("returns no duration when the center never becomes metallic", () => {
    expect(thermalTransitionDuration(result({}, [0.1, 0.49]))).toEqual({
      durationNs: null,
      startsMetallic: false,
      endsMetallic: false,
      startNs: null,
      endNs: null,
    });
  });
});
