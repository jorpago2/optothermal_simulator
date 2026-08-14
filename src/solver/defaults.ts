import type { OptothermalConfig } from "./types";

/** Reference defaults migrated from simulations/configs/materials/vo2_1064_reference.json. */
export const VO2_REFERENCE_CONFIG: OptothermalConfig = {
  wavelengthUm: 1.064,
  waistUm: 12,
  peakIntensityGwCm2: 0.01,
  pulseFwhmNs: 1,
  durationNs: 12,
  ambientC: 25,
  filmThicknessNm: 150,
  substrateDepthUm: 20,
  radiusUm: 60,
  substrateIndex: 1.46,
  airIndex: 1,
  insulatingN: 2.79,
  insulatingK: 0.45,
  metallicN: 1.45,
  metallicK: 1.41,
  transitionHeatingC: 68.85,
  transitionCoolingC: 62.85,
  transitionWidthC: 2,
  phaseRelaxationNs: 1,
  filmDensityKgM3: 4570,
  filmHeatCapacityJKgK: 690,
  filmConductivityWMK: 3.6,
  substrateDensityKgM3: 2230,
  substrateHeatCapacityJKgK: 830,
  substrateConductivityWMK: 1.2,
  convectionWM2K: 5,
  timeSteps: 241,
  radialCells: 65,
  substrateCells: 32,
};

export const AMBIENT_CHECK_CONFIG: OptothermalConfig = {
  ...VO2_REFERENCE_CONFIG,
  peakIntensityGwCm2: 1e-12,
  timeSteps: 81,
  radialCells: 33,
  substrateCells: 16,
};
