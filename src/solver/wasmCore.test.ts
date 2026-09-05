import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { AMBIENT_CHECK_CONFIG, VO2_REFERENCE_CONFIG } from "./defaults";
import { serializeConfig } from "./protocol";
import { thermalDepthEdges } from "./validation";

interface RawCoreExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  allocate_f64(length: number): number;
  deallocate_f64(pointer: number, capacity: number): void;
  output_length(timeSteps: number, radialCells: number, substrateCells: number, filmCells: number): number;
  run_simulation(configPointer: number, configLength: number, outputPointer: number, outputCapacity: number): number;
}

async function execute(config: typeof VO2_REFERENCE_CONFIG) {
  const bytes = await readFile(new URL("../wasm/optothermal_core.wasm", import.meta.url));
  const instance = await WebAssembly.instantiate(bytes, {});
  const core = instance.instance.exports as RawCoreExports;
  const input = serializeConfig(config);
  const outputLength = core.output_length(config.timeSteps, config.radialCells, config.substrateCells, config.filmCells);
  const inputPointer = core.allocate_f64(input.length);
  const outputPointer = core.allocate_f64(outputLength);
  try {
    new Float64Array(core.memory.buffer, inputPointer, input.length).set(input);
    const status = core.run_simulation(inputPointer, input.length, outputPointer, outputLength);
    return { status, output: new Float64Array(core.memory.buffer, outputPointer, outputLength).slice() };
  } finally {
    core.deallocate_f64(inputPointer, input.length);
    core.deallocate_f64(outputPointer, outputLength);
  }
}

describe("Rust/WASM optothermal core", () => {
  test("returns a finite, passive and energy-bounded reference solution", async () => {
    const { status, output } = await execute(VO2_REFERENCE_CONFIG);
    expect(status).toBe(0);
    expect(output[0]).toBe(3);
    expect(output[1]).toBe(VO2_REFERENCE_CONFIG.timeSteps);
    expect(output[2]).toBe(VO2_REFERENCE_CONFIG.radialCells);
    expect(output[3]).toBe(VO2_REFERENCE_CONFIG.substrateCells + VO2_REFERENCE_CONFIG.filmCells);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(output[4]).toBeGreaterThan(VO2_REFERENCE_CONFIG.ambientC);
    expect(output[7]).toBeGreaterThanOrEqual(0);
    expect(output[7]).toBeLessThanOrEqual(1);
    expect(output[11]).toBeGreaterThanOrEqual(0);
    expect(output[11]).toBeLessThanOrEqual(1.02);
    expect(output[12]).toBeGreaterThanOrEqual(0);
    expect(output[12]).toBeLessThanOrEqual(1);
    expect(output[16]).toBe(1);
    expect(output[17]).toBeLessThanOrEqual(80);
    expect(output[18]).toBeLessThanOrEqual(output[21]);
    expect(output[19]).toBeLessThanOrEqual(output[22]);
    expect(output[23] + output[24] + output[25]).toBeCloseTo(1, 12);
    expect(output[26]).toBeGreaterThanOrEqual(-1e-9);
    expect(output[27]).toBeLessThanOrEqual(1 + 1e-9);
    expect(output[28]).toBeGreaterThanOrEqual(-1e-18);
    const nt = VO2_REFERENCE_CONFIG.timeSteps;
    const nr = VO2_REFERENCE_CONFIG.radialCells;
    const nz = VO2_REFERENCE_CONFIG.substrateCells + VO2_REFERENCE_CONFIG.filmCells;
    const finalMapOffset = 29 + 4 * nt + 3 * nr + nz;
    const depthOffset = 29 + 4 * nt + 3 * nr;
    const edges = thermalDepthEdges(VO2_REFERENCE_CONFIG);
    for (let layer = 0; layer < nz; layer += 1) {
      expect(output[depthOffset + layer]).toBeCloseTo((edges[layer] + edges[layer + 1]) / 2, 10);
    }
    for (let layer = 0; layer < nz; layer += 1) {
      expect(output[finalMapOffset + layer * nr + nr - 1]).toBeCloseTo(VO2_REFERENCE_CONFIG.ambientC, 12);
    }
    const radialFinalOffset = 29 + 4 * nt + nr;
    const radialPeakOffset = radialFinalOffset + nr;
    const peakMapOffset = finalMapOffset + nr * nz;
    for (let i = 0; i < nr; i += 1) {
      expect(output[radialFinalOffset + i]).toBeCloseTo(output[finalMapOffset + (nz - 1) * nr + i], 10);
      expect(output[radialPeakOffset + i]).toBeCloseTo(output[peakMapOffset + (nz - 1) * nr + i], 10);
    }
  });

  test("approaches ambient temperature at negligible optical power", async () => {
    const { status, output } = await execute(AMBIENT_CHECK_CONFIG);
    expect(status).toBe(0);
    expect(output[4]).toBeCloseTo(AMBIENT_CHECK_CONFIG.ambientC, 5);
    expect(output[6]).toBeLessThan(1e-6);
  });

  test("conserves deposited energy in the negligible-conduction insulated limit", async () => {
    const { status, output } = await execute({
      ...VO2_REFERENCE_CONFIG, radialCells: 33, substrateCells: 32,
      filmConductivityWMK: 1e-12, substrateConductivityWMK: 1e-12, convectionWM2K: 0,
    });
    expect(status).toBe(0);
    expect(output[11]).toBeCloseTo(1, 9);
  });

  test("approaches the analytical Gaussian absorbed energy under radial refinement", async () => {
    const errors: number[] = [];
    for (const radialCells of [65, 129]) {
      const config = { ...VO2_REFERENCE_CONFIG, peakIntensityGwCm2: 1e-12, radialCells };
      const { status, output } = await execute(config);
      expect(status).toBe(0);
      const waistM = config.waistUm * 1e-6;
      const analyticalEnergy = output[12] * output[15] * Math.PI * waistM ** 2 / 2;
      errors.push(Math.abs(output[8] / analyticalEnergy - 1));
    }
    expect(errors[0]).toBeLessThan(0.002);
    expect(errors[1]).toBeLessThan(errors[0] / 3);
  });

  test.each([
    { field: "filmCells", values: [6, 12, 24] },
    { field: "substrateCells", values: [32, 64, 96] },
    { field: "timeSteps", values: [121, 241, 481] },
  ] as const)("reduces thermal discretization changes when refining $field independently", async ({ field, values }) => {
    // Stay below the phase transition to isolate thermal discretization from nonlinear kinetics.
    const temperatures: number[] = [];
    for (const value of values) {
      const config = { ...VO2_REFERENCE_CONFIG, peakIntensityGwCm2: 0.001, radialCells: 33, [field]: value };
      const { status, output } = await execute(config);
      expect(status).toBe(0);
      expect(output[11]).toBeLessThanOrEqual(1.02);
      expect(output[16]).toBe(1);
      temperatures.push(output[4]);
    }
    const coarseChange = Math.abs(temperatures[1] - temperatures[0]);
    const fineChange = Math.abs(temperatures[2] - temperatures[1]);
    expect(fineChange).toBeLessThan(coarseChange);
    expect(fineChange / (temperatures[2] - VO2_REFERENCE_CONFIG.ambientC)).toBeLessThan(0.01);
    console.info("Mesh refinement evidence", JSON.stringify({ field, values, temperaturesC: temperatures, fineChangeK: fineChange }));
  });

  test("rejects a step that reaches the iteration limit without satisfying both tolerances", async () => {
    const stressConfig = {
      ...VO2_REFERENCE_CONFIG,
      waistUm: 0.5,
      peakIntensityGwCm2: 10,
      pulseFwhmNs: 1000,
      durationNs: 6000,
      timeSteps: 24,
      radialCells: 129,
      substrateCells: 64,
      radiusUm: 2,
      filmThicknessNm: 5,
      substrateDepthUm: 0.1,
      filmDensityKgM3: 1,
      filmHeatCapacityJKgK: 1,
      filmConductivityWMK: 0.001,
      substrateDensityKgM3: 1,
      substrateHeatCapacityJKgK: 1,
      substrateConductivityWMK: 0.001,
      convectionWM2K: 0,
    };
    const { status, output } = await execute(stressConfig);
    expect(status).toBe(6);
    expect(output[16]).toBe(0);
    expect(output[17]).toBe(80);
    expect(output[20]).toBeGreaterThan(0);
    expect(output[18] > output[21] || output[19] > output[22]).toBe(true);
  });
});
