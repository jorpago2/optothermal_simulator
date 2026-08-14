import type { OptothermalConfig } from "./types";

/** Ordered ABI payload shared by TypeScript and the Rust/WASM core. */
export function serializeConfig(config: OptothermalConfig): Float64Array {
  return new Float64Array([
    config.wavelengthUm,
    config.waistUm,
    config.peakIntensityGwCm2,
    config.pulseFwhmNs,
    config.durationNs,
    config.timeSteps,
    config.radialCells,
    config.substrateCells,
    config.radiusUm,
    config.filmThicknessNm,
    config.substrateDepthUm,
    config.ambientC,
    config.substrateIndex,
    config.airIndex,
    config.insulatingN,
    config.insulatingK,
    config.metallicN,
    config.metallicK,
    config.transitionHeatingC,
    config.transitionCoolingC,
    config.transitionWidthC,
    config.phaseRelaxationNs,
    config.filmDensityKgM3,
    config.filmHeatCapacityJKgK,
    config.filmConductivityWMK,
    config.substrateDensityKgM3,
    config.substrateHeatCapacityJKgK,
    config.substrateConductivityWMK,
    config.convectionWM2K,
    0,
  ]);
}
