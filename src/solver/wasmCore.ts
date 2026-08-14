import wasmUrl from "../wasm/optothermal_core.wasm?url";
import type { OptothermalConfig, OptothermalResult } from "./types";
import { serializeConfig } from "./protocol";

interface CoreExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  allocate_f64(length: number): number;
  deallocate_f64(pointer: number, capacity: number): void;
  output_length(timeSteps: number, radialCells: number, substrateCells: number): number;
  run_simulation(configPointer: number, configLength: number, outputPointer: number, outputCapacity: number): number;
}

let exportsPromise: Promise<CoreExports> | undefined;

async function loadCore(): Promise<CoreExports> {
  if (!exportsPromise) {
    exportsPromise = fetch(wasmUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load the WASM solver (${response.status}).`);
        const bytes = await response.arrayBuffer();
        const instance = await WebAssembly.instantiate(bytes, {});
        return instance.instance.exports as CoreExports;
      });
  }
  return exportsPromise;
}

function take(values: Float64Array, cursor: { value: number }, length: number): number[] {
  const output = Array.from(values.subarray(cursor.value, cursor.value + length));
  cursor.value += length;
  return output;
}

function matrix(values: Float64Array, cursor: { value: number }, rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => take(values, cursor, columns));
}

export async function runWasmSimulation(config: OptothermalConfig): Promise<OptothermalResult> {
  const core = await loadCore();
  const serialized = serializeConfig(config);
  const outputLength = core.output_length(config.timeSteps, config.radialCells, config.substrateCells);
  const configPointer = core.allocate_f64(serialized.length);
  const outputPointer = core.allocate_f64(outputLength);
  try {
    new Float64Array(core.memory.buffer, configPointer, serialized.length).set(serialized);
    const status = core.run_simulation(configPointer, serialized.length, outputPointer, outputLength);
    if (status !== 0) throw new Error(`The WASM solver rejected the simulation (code ${status}).`);
    const values = new Float64Array(core.memory.buffer, outputPointer, outputLength).slice();
    if (values[0] !== 1) throw new Error("The WASM solver returned an incomplete result.");
    const nt = values[1];
    const nr = values[2];
    const nz = values[3];
    if (![nt, nr, nz].every(Number.isInteger)) throw new Error("The WASM solver returned invalid array dimensions.");
    const cursor = { value: 16 };
    return {
      timeNs: take(values, cursor, nt),
      centerTemperatureC: take(values, cursor, nt),
      centerMetallicFraction: take(values, cursor, nt),
      centerAbsorptance: take(values, cursor, nt),
      radiusUm: take(values, cursor, nr),
      finalSurfaceTemperatureC: take(values, cursor, nr),
      peakSurfaceTemperatureC: take(values, cursor, nr),
      depthUm: take(values, cursor, nz),
      finalTemperatureMapC: matrix(values, cursor, nz, nr),
      peakTemperatureMapC: matrix(values, cursor, nz, nr),
      metrics: {
        maximumTemperatureC: values[4],
        timeAtMaximumNs: values[5],
        maximumMetallicFraction: values[6],
        peakAbsorptance: values[7],
        absorbedEnergyJ: values[8],
        maximumStoredEnergyJ: values[9],
        averageLinearIterations: values[10],
        storedToAbsorbedRatio: values[11],
        baselineAbsorptance: values[12],
        adiabaticTemperatureRiseK: values[13],
        timeStepNs: values[14],
        peakFluenceJM2: values[15],
      },
      engine: "Rust/WASM",
    };
  } finally {
    core.deallocate_f64(configPointer, serialized.length);
    core.deallocate_f64(outputPointer, outputLength);
  }
}
