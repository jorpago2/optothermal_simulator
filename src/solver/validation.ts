import type { OptothermalConfig, OptothermalResult, ValidationIssue } from "./types";

const finitePositiveFields: Array<keyof OptothermalConfig> = [
  "wavelengthUm", "waistUm", "peakIntensityGwCm2", "pulseFwhmNs", "durationNs",
  "filmThicknessNm", "substrateDepthUm", "radiusUm", "substrateIndex", "airIndex",
  "insulatingN", "insulatingK", "metallicN", "metallicK", "transitionWidthC",
  "phaseRelaxationNs", "filmDensityKgM3", "filmHeatCapacityJKgK", "filmConductivityWMK",
  "substrateDensityKgM3", "substrateHeatCapacityJKgK", "substrateConductivityWMK",
];

export function validateConfig(config: OptothermalConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const field of finitePositiveFields) {
    const value = config[field];
    if (!Number.isFinite(value) || value <= 0) issues.push({ id: `positive-${field}`, severity: "error", field, message: "Enter a positive finite value." });
  }
  if (!Number.isFinite(config.ambientC) || config.ambientC < -100 || config.ambientC > 500) {
    issues.push({ id: "ambient-range", severity: "error", field: "ambientC", message: "Ambient temperature must be between −100 and 500 °C." });
  }
  if (config.durationNs < 6 * config.pulseFwhmNs) {
    issues.push({ id: "duration-window", severity: "error", field: "durationNs", message: "Use at least six pulse FWHM so the Gaussian pulse is contained in the time window." });
  }
  const pointsPerFwhm = config.timeSteps * config.pulseFwhmNs / config.durationNs;
  if (pointsPerFwhm < 16) {
    issues.push({ id: "temporal-resolution", severity: "warning", field: "timeSteps", message: `Only ${pointsPerFwhm.toFixed(1)} points resolve the pulse FWHM; use at least 16.` });
  }
  if (config.radiusUm < 4 * config.waistUm) {
    issues.push({ id: "radial-domain", severity: "warning", field: "radiusUm", message: "The radial boundary is closer than four beam waists and may affect cooling." });
  }
  if (!Number.isInteger(config.timeSteps) || config.timeSteps < 24 || config.timeSteps > 1200) {
    issues.push({ id: "time-cells", severity: "error", field: "timeSteps", message: "Time steps must be an integer between 24 and 1200." });
  }
  if (!Number.isInteger(config.radialCells) || config.radialCells < 17 || config.radialCells > 257) {
    issues.push({ id: "radial-cells", severity: "error", field: "radialCells", message: "Radial cells must be an integer between 17 and 257." });
  }
  if (!Number.isInteger(config.substrateCells) || config.substrateCells < 4 || config.substrateCells > 128) {
    issues.push({ id: "substrate-cells", severity: "error", field: "substrateCells", message: "Substrate cells must be an integer between 4 and 128." });
  }
  if (config.radialCells * (config.substrateCells + 1) > 40_000) {
    issues.push({ id: "mesh-size", severity: "error", field: "radialCells", message: "The mesh exceeds the 40,000-cell browser limit." });
  }
  if (config.transitionCoolingC >= config.transitionHeatingC) {
    issues.push({ id: "hysteresis-order", severity: "error", field: "transitionCoolingC", message: "The cooling transition must be below the heating transition." });
  }
  return issues;
}

export function validateResult(result: OptothermalResult) {
  const finite = result.centerTemperatureC.every(Number.isFinite)
    && result.peakTemperatureMapC.every((row) => row.every(Number.isFinite));
  const passive = result.metrics.baselineAbsorptance >= 0 && result.metrics.peakAbsorptance <= 1;
  const energyBound = result.metrics.storedToAbsorbedRatio >= 0 && result.metrics.storedToAbsorbedRatio <= 1.02;
  return { finite, passive, energyBound };
}
