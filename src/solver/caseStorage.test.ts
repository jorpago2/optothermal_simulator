import { describe, expect, it, vi } from "vitest";
import { VO2_REFERENCE_CONFIG } from "./defaults";
import type { StudyCase } from "./studies";
import type { OptothermalConfig, OptothermalResult } from "./types";
import {
  CASES_MODEL,
  CASES_SCHEMA,
  CASE_STORAGE_KEY,
  MAX_CASES,
  MAX_JSON_CHARS,
  loadCases,
  saveCases,
} from "./caseStorage";
import { thermalDepthEdges } from "./validation";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  value: string | null = null;

  getItem(key: string): string | null {
    return key === CASE_STORAGE_KEY ? this.value : null;
  }

  setItem(key: string, value: string): void {
    if (key === CASE_STORAGE_KEY) this.value = value;
  }
}

function minimalConfig(): OptothermalConfig {
  return {
    ...VO2_REFERENCE_CONFIG,
    timeSteps: 24,
    radialCells: 17,
    substrateCells: 4,
    filmCells: 1,
  };
}

function minimalResult(config: OptothermalConfig): OptothermalResult {
  const depthEdgesUm = thermalDepthEdges(config).map((edge) => Object.is(edge, -0) ? 0 : edge);
  const depthUm = depthEdgesUm.slice(0, -1).map((edge, index) => (edge + depthEdgesUm[index + 1]) / 2);
  const timeNs = Array.from({ length: config.timeSteps }, (_, index) => index);
  const radiusUm = Array.from({ length: config.radialCells }, (_, index) => index * config.radiusUm / (config.radialCells - 1));
  const finalTemperatureMapC = depthUm.map((_, depthIndex) => radiusUm.map((_, radiusIndex) => 25 + depthIndex * 0.01 + radiusIndex * 0.001));
  const peakTemperatureMapC = depthUm.map((_, depthIndex) => radiusUm.map((_, radiusIndex) => 25.2 + depthIndex * 0.01 + radiusIndex * 0.001));
  return {
    timeNs,
    centerTemperatureC: timeNs.map((_, index) => 25 + index * 0.1),
    centerMetallicFraction: timeNs.map((_, index) => index / (timeNs.length * 10)),
    centerAbsorptance: timeNs.map((_, index) => 0.2 + index / 10_000),
    radiusUm,
    finalSurfaceTemperatureC: finalTemperatureMapC.at(-1)!,
    peakSurfaceTemperatureC: peakTemperatureMapC.at(-1)!,
    depthUm,
    depthEdgesUm,
    finalTemperatureMapC,
    peakTemperatureMapC,
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

function minimalCase(id = "case-1", name = "Reference case"): StudyCase {
  const config = minimalConfig();
  return { id, name, config, result: minimalResult(config) };
}

describe("study-case local storage", () => {
  it("round-trips a minimal valid study case with the versioned envelope", () => {
    const storage = new MemoryStorage();
    const studyCase = minimalCase();

    saveCases([studyCase], storage);

    expect(JSON.parse(storage.value!)).toMatchObject({
      schema: CASES_SCHEMA,
      model: CASES_MODEL,
      cases: [studyCase],
    });
    expect(loadCases(storage)).toEqual({ cases: [studyCase], warning: "" });
  });

  it("rejects invalid boundaries before writing", () => {
    const storage = new MemoryStorage();
    const studyCase = minimalCase();

    expect(() => saveCases([{ ...studyCase, id: "   " }], storage)).toThrow(/id.*non-empty/i);
    expect(() => saveCases([{ ...studyCase, config: { ...studyCase.config, substrateGrading: 9 } }], storage)).toThrow(/configuration/i);
    const invalidResult: StudyCase = {
      ...studyCase,
      result: {
        ...studyCase.result,
        finalTemperatureMapC: studyCase.result.finalTemperatureMapC.map((row, index) => index === 0 ? [...row.slice(0, -1)] : row),
      },
    };
    expect(() => saveCases([invalidResult], storage)).toThrow(/invalid result/i);
    expect(() => saveCases([{ ...studyCase, result: { ...studyCase.result, engine: "Other" } } as unknown as StudyCase], storage)).toThrow(/result engine/i);
    expect(() => saveCases(Array.from({ length: MAX_CASES + 1 }, (_, index) => minimalCase(`case-${index}`, `Case ${index}`)), storage)).toThrow(/maximum.*8/i);
  });

  it("returns a warning for corrupt or oversized storage and leaves it untouched", () => {
    const storage = new MemoryStorage();
    storage.value = "{not-json";
    const corruptValue = storage.value;
    expect(loadCases(storage)).toMatchObject({ cases: [], warning: expect.stringMatching(/invalid|parsing/i) });
    expect(storage.value).toBe(corruptValue);

    storage.value = "x".repeat(MAX_JSON_CHARS + 1);
    const oversizedValue = storage.value;
    expect(loadCases(storage)).toMatchObject({ cases: [], warning: expect.stringMatching(/limit/i) });
    expect(storage.value).toBe(oversizedValue);
  });

  it("rejects duplicate ids on save and on load", () => {
    const storage = new MemoryStorage();
    const first = minimalCase();
    const second = minimalCase(first.id, "Second case");
    expect(() => saveCases([first, second], storage)).toThrow(/duplicated/i);

    storage.value = JSON.stringify({ schema: CASES_SCHEMA, model: CASES_MODEL, cases: [first, second] });
    expect(loadCases(storage)).toMatchObject({ cases: [], warning: expect.stringMatching(/duplicated/i) });
  });

  it("propagates storage quota failures instead of reporting a false save", () => {
    const quotaStorage: Pick<Storage, "setItem"> = {
      setItem: () => { throw new Error("QuotaExceededError"); },
    };
    expect(() => saveCases([minimalCase()], quotaStorage)).toThrow(/storage|quota/i);
  });

  it("reports a warning when the default storage getter is unavailable", () => {
    const unavailableStorage = {};
    Object.defineProperty(unavailableStorage, "localStorage", {
      configurable: true,
      get: () => { throw new Error("SecurityError"); },
    });
    vi.stubGlobal("window", unavailableStorage);
    try {
      expect(loadCases()).toMatchObject({ cases: [], warning: expect.stringMatching(/SecurityError|could not be read/i) });
      expect(() => saveCases([minimalCase()])).toThrow(/SecurityError|storage/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
