import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { AMBIENT_CHECK_CONFIG, VO2_REFERENCE_CONFIG } from "./defaults";
import { serializeConfig } from "./protocol";

interface RawCoreExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  allocate_f64(length: number): number;
  deallocate_f64(pointer: number, capacity: number): void;
  output_length(timeSteps: number, radialCells: number, substrateCells: number): number;
  run_simulation(configPointer: number, configLength: number, outputPointer: number, outputCapacity: number): number;
}

async function execute(config: typeof VO2_REFERENCE_CONFIG) {
  const bytes = await readFile(new URL("../wasm/optothermal_core.wasm", import.meta.url));
  const instance = await WebAssembly.instantiate(bytes, {});
  const core = instance.instance.exports as RawCoreExports;
  const input = serializeConfig(config);
  const outputLength = core.output_length(config.timeSteps, config.radialCells, config.substrateCells);
  const inputPointer = core.allocate_f64(input.length);
  const outputPointer = core.allocate_f64(outputLength);
  try {
    new Float64Array(core.memory.buffer, inputPointer, input.length).set(input);
    expect(core.run_simulation(inputPointer, input.length, outputPointer, outputLength)).toBe(0);
    return new Float64Array(core.memory.buffer, outputPointer, outputLength).slice();
  } finally {
    core.deallocate_f64(inputPointer, input.length);
    core.deallocate_f64(outputPointer, outputLength);
  }
}

describe("Rust/WASM optothermal core", () => {
  test("returns a finite, passive and energy-bounded reference solution", async () => {
    const output = await execute(VO2_REFERENCE_CONFIG);
    expect(output[0]).toBe(1);
    expect(output[1]).toBe(VO2_REFERENCE_CONFIG.timeSteps);
    expect(output[2]).toBe(VO2_REFERENCE_CONFIG.radialCells);
    expect(output[3]).toBe(VO2_REFERENCE_CONFIG.substrateCells + 1);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(output[4]).toBeGreaterThan(VO2_REFERENCE_CONFIG.ambientC);
    expect(output[7]).toBeGreaterThanOrEqual(0);
    expect(output[7]).toBeLessThanOrEqual(1);
    expect(output[11]).toBeGreaterThanOrEqual(0);
    expect(output[11]).toBeLessThanOrEqual(1.02);
    expect(output[12]).toBeGreaterThanOrEqual(0);
    expect(output[12]).toBeLessThanOrEqual(1);
  });

  test("approaches ambient temperature at negligible optical power", async () => {
    const output = await execute(AMBIENT_CHECK_CONFIG);
    expect(output[4]).toBeCloseTo(AMBIENT_CHECK_CONFIG.ambientC, 5);
    expect(output[6]).toBeLessThan(1e-6);
  });
});
