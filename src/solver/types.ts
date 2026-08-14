export interface OptothermalConfig {
  wavelengthUm: number;
  waistUm: number;
  peakIntensityGwCm2: number;
  pulseFwhmNs: number;
  durationNs: number;
  ambientC: number;
  filmThicknessNm: number;
  substrateDepthUm: number;
  radiusUm: number;
  substrateIndex: number;
  airIndex: number;
  insulatingN: number;
  insulatingK: number;
  metallicN: number;
  metallicK: number;
  transitionHeatingC: number;
  transitionCoolingC: number;
  transitionWidthC: number;
  phaseRelaxationNs: number;
  filmDensityKgM3: number;
  filmHeatCapacityJKgK: number;
  filmConductivityWMK: number;
  substrateDensityKgM3: number;
  substrateHeatCapacityJKgK: number;
  substrateConductivityWMK: number;
  convectionWM2K: number;
  timeSteps: number;
  radialCells: number;
  substrateCells: number;
}

export interface OptothermalResult {
  timeNs: number[];
  centerTemperatureC: number[];
  centerMetallicFraction: number[];
  centerAbsorptance: number[];
  radiusUm: number[];
  finalSurfaceTemperatureC: number[];
  peakSurfaceTemperatureC: number[];
  depthUm: number[];
  finalTemperatureMapC: number[][];
  peakTemperatureMapC: number[][];
  metrics: {
    maximumTemperatureC: number;
    timeAtMaximumNs: number;
    maximumMetallicFraction: number;
    peakAbsorptance: number;
    absorbedEnergyJ: number;
    maximumStoredEnergyJ: number;
    averageLinearIterations: number;
    storedToAbsorbedRatio: number;
    baselineAbsorptance: number;
    adiabaticTemperatureRiseK: number;
    timeStepNs: number;
    peakFluenceJM2: number;
  };
  engine: "Rust/WASM";
}

export interface ValidationIssue {
  id: string;
  severity: "warning" | "error";
  field: keyof OptothermalConfig;
  message: string;
}
