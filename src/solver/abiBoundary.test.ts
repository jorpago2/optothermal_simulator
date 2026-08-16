import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { VO2_REFERENCE_CONFIG } from "./defaults";
import { isWorkerResponse, serializeConfig } from "./protocol";
import { validateConfig } from "./validation";

interface RawCoreExports extends WebAssembly.Exports {
  allocate_f64(length: number): number;
  deallocate_f64(pointer: number, capacity: number): void;
  output_length(timeSteps: number, radialCells: number, substrateCells: number): number;
  run_simulation(configPointer: number, configLength: number, outputPointer: number, outputCapacity: number): number;
  memory: WebAssembly.Memory;
}

async function loadCore(): Promise<RawCoreExports> {
  const bytes = await readFile(new URL("../wasm/optothermal_core.wasm", import.meta.url));
  const instance = await WebAssembly.instantiate(bytes, {});
  return instance.instance.exports as RawCoreExports;
}

async function runRaw(config: typeof VO2_REFERENCE_CONFIG): Promise<number> {
  const core = await loadCore();
  const input = serializeConfig(config);
  const outputLength = core.output_length(
    VO2_REFERENCE_CONFIG.timeSteps,
    VO2_REFERENCE_CONFIG.radialCells,
    VO2_REFERENCE_CONFIG.substrateCells,
  );
  const inputPointer = core.allocate_f64(input.length);
  const outputPointer = core.allocate_f64(outputLength);
  try {
    new Float64Array(core.memory.buffer, inputPointer, input.length).set(input);
    return core.run_simulation(inputPointer, input.length, outputPointer, outputLength);
  } finally {
    core.deallocate_f64(inputPointer, input.length);
    core.deallocate_f64(outputPointer, outputLength);
  }
}

describe("solver ABI boundaries", () => {
  test("rejects fractional mesh dimensions instead of rounding them", async () => {
    await expect(runRaw({ ...VO2_REFERENCE_CONFIG, timeSteps: 24.5 })).resolves.toBe(3);
  });

  test("rejects negative convection and sub-absolute ambient temperatures", async () => {
    await expect(runRaw({ ...VO2_REFERENCE_CONFIG, convectionWM2K: -1 })).resolves.toBe(4);
    await expect(runRaw({ ...VO2_REFERENCE_CONFIG, ambientC: -300 })).resolves.toBe(4);
  });

  test("rejects transition temperatures at or below absolute zero", async () => {
    await expect(runRaw({
      ...VO2_REFERENCE_CONFIG,
      transitionHeatingC: -200,
      transitionCoolingC: -300,
    })).resolves.toBe(4);
    const issues = validateConfig({
      ...VO2_REFERENCE_CONFIG,
      transitionHeatingC: -300,
      transitionCoolingC: -301,
    });
    expect(issues.some((issue) => issue.id === "heating-transition-absolute-zero")).toBe(true);
    expect(issues.some((issue) => issue.id === "cooling-transition-absolute-zero")).toBe(true);
  });

  test("does not overstate pulse resolution by counting intervals as samples", () => {
    const issues = validateConfig({ ...VO2_REFERENCE_CONFIG, durationNs: 15.05 });
    expect(issues.some((issue) => issue.id === "temporal-resolution" && issue.severity === "warning")).toBe(true);
  });

  test("rejects unsafe output dimensions at the WASM boundary", async () => {
    const core = await loadCore();
    expect(core.output_length(1, 1, 1)).toBe(0);
    expect(core.output_length(1201, 257, 128)).toBe(0);
  });

  test("rejects an empty successful worker response envelope", () => {
    expect(isWorkerResponse({ requestId: "run-1", ok: true, result: {} })).toBe(false);
    expect(isWorkerResponse({ requestId: "run-1", ok: true, result: { engine: "Rust/WASM" } })).toBe(true);
  });
});
