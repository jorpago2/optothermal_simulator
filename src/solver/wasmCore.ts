import wasmUrl from "../wasm/optothermal_core.wasm?url";
import type { OptothermalConfig, OptothermalResult } from "./types";
import { serializeConfig } from "./protocol";
import { assertValidResult, validateConfig } from "./validation";

const RESULT_SCHEMA_VERSION = 2;
const RESULT_HEADER_LENGTH = 29;

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
        const core = instance.instance.exports as Partial<CoreExports>;
        if (!core.memory || typeof core.allocate_f64 !== "function"
          || typeof core.deallocate_f64 !== "function"
          || typeof core.output_length !== "function"
          || typeof core.run_simulation !== "function") {
          throw new Error("The WASM solver is missing a required export.");
        }
        return core as CoreExports;
      })
      .catch((error) => {
        exportsPromise = undefined;
        throw error;
      });
  }
  return exportsPromise;
}

function take(values: Float64Array, cursor: { value: number }, length: number, label: string): number[] {
  if (!Number.isSafeInteger(length) || length < 0 || cursor.value + length > values.length) {
    throw new Error(`The WASM solver returned an invalid ${label} length.`);
  }
  const output = Array.from(values.subarray(cursor.value, cursor.value + length));
  if (!output.every(Number.isFinite)) throw new Error(`The WASM solver returned a non-finite ${label} value.`);
  cursor.value += length;
  return output;
}

function matrix(values: Float64Array, cursor: { value: number }, rows: number, columns: number, label: string): number[][] {
  return Array.from({ length: rows }, (_, row) => take(values, cursor, columns, `${label} row ${row}`));
}

function solverError(status: number, diagnostics: Float64Array): Error {
  if (status === 6 && diagnostics.length >= RESULT_HEADER_LENGTH) {
    const step = diagnostics[20];
    const update = diagnostics[18];
    const residual = diagnostics[19];
    return new Error(
      `The linear solver did not converge at step ${step}: `
      + `maximum update ${update.toExponential(3)} K, residual ${residual.toExponential(3)}.`,
    );
  }
  if (status === 7) return new Error("The optical TMM returned a non-passive or non-finite R/T/A balance.");
  if (status === 8) return new Error("The thermal solver returned non-finite or negative stored energy.");
  return new Error(`The WASM solver rejected the simulation (code ${status}).`);
}

export async function runWasmSimulation(config: OptothermalConfig): Promise<OptothermalResult> {
  const blockingIssues = validateConfig(config).filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    throw new Error(`The solver configuration is invalid: ${blockingIssues.map((issue) => issue.message).join(" ")}`);
  }
  const core = await loadCore();
  const serialized = serializeConfig(config);
  const outputLength = core.output_length(config.timeSteps, config.radialCells, config.substrateCells);
  if (!Number.isSafeInteger(outputLength) || outputLength < RESULT_HEADER_LENGTH) {
    throw new Error("The WASM solver rejected the requested output dimensions.");
  }
  let configPointer = 0;
  let outputPointer = 0;
  try {
    configPointer = core.allocate_f64(serialized.length);
    if (!Number.isSafeInteger(configPointer) || configPointer <= 0) {
      throw new Error("The WASM solver could not allocate its configuration buffer.");
    }
    outputPointer = core.allocate_f64(outputLength);
    if (!Number.isSafeInteger(outputPointer) || outputPointer <= 0) {
      throw new Error("The WASM solver could not allocate its output buffer.");
    }
    new Float64Array(core.memory.buffer, configPointer, serialized.length).set(serialized);
    const status = core.run_simulation(configPointer, serialized.length, outputPointer, outputLength);
    if (status !== 0) {
      const diagnosticsLength = Math.min(outputLength, RESULT_HEADER_LENGTH);
      const diagnostics = new Float64Array(core.memory.buffer, outputPointer, diagnosticsLength).slice();
      throw solverError(status, diagnostics);
    }
    const values = new Float64Array(core.memory.buffer, outputPointer, outputLength).slice();
    if (values.length < RESULT_HEADER_LENGTH || values[0] !== RESULT_SCHEMA_VERSION) {
      throw new Error("The WASM solver returned an unsupported or incomplete result.");
    }
    if (!values.every(Number.isFinite)) throw new Error("The WASM solver returned non-finite output data.");
    const nt = values[1];
    const nr = values[2];
    const nz = values[3];
    if (![nt, nr, nz].every(Number.isSafeInteger)
      || nt !== config.timeSteps
      || nr !== config.radialCells
      || nz !== config.substrateCells + 1) {
      throw new Error("The WASM solver returned dimensions that do not match the requested mesh.");
    }
    const cursor = { value: RESULT_HEADER_LENGTH };
    const result: OptothermalResult = {
      timeNs: take(values, cursor, nt, "time"),
      centerTemperatureC: take(values, cursor, nt, "center temperature"),
      centerMetallicFraction: take(values, cursor, nt, "metallic fraction"),
      centerAbsorptance: take(values, cursor, nt, "center absorptance"),
      radiusUm: take(values, cursor, nr, "radius"),
      finalSurfaceTemperatureC: take(values, cursor, nr, "final surface temperature"),
      peakSurfaceTemperatureC: take(values, cursor, nr, "peak surface temperature"),
      depthUm: take(values, cursor, nz, "depth"),
      finalTemperatureMapC: matrix(values, cursor, nz, nr, "final temperature map"),
      peakTemperatureMapC: matrix(values, cursor, nz, nr, "peak temperature map"),
      metrics: {
        maximumTemperatureC: values[4],
        timeAtMaximumNs: values[5],
        maximumMetallicFraction: values[6],
        peakAbsorptance: values[7],
        absorbedEnergyJ: values[8],
        maximumStoredEnergyJ: values[9],
        averageLinearIterations: values[10],
        maximumLinearIterations: values[17],
        worstLinearUpdateK: values[18],
        worstLinearResidual: values[19],
        worstLinearStep: values[20],
        linearUpdateToleranceK: values[21],
        linearResidualTolerance: values[22],
        linearConverged: values[16] === 1,
        storedToAbsorbedRatio: values[11],
        baselineAbsorptance: values[12],
        baselineReflectance: values[23],
        baselineTransmittance: values[24],
        baselineAbsorptanceRaw: values[25],
        minimumAbsorptanceRaw: values[26],
        maximumAbsorptanceRaw: values[27],
        minimumStoredEnergyJ: values[28],
        adiabaticTemperatureRiseK: values[13],
        timeStepNs: values[14],
        peakFluenceJM2: values[15],
      },
      engine: "Rust/WASM",
    };
    if (cursor.value !== values.length) throw new Error("The WASM solver returned trailing or missing output data.");
    assertValidResult(config, result);
    return result;
  } finally {
    if (configPointer > 0) core.deallocate_f64(configPointer, serialized.length);
    if (outputPointer > 0) core.deallocate_f64(outputPointer, outputLength);
  }
}
