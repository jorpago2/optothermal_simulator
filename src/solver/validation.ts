import type { OptothermalConfig, OptothermalResult, ResultValidation, ValidationIssue } from "./types";

const OPTICAL_POWER_TOLERANCE = 1e-9;
const NEGATIVE_ENERGY_TOLERANCE_J = 1e-18;

export interface MeshDiagnostics {
  radialSpacingUm: number;
  pointsPerWaist: number;
  substrateSpacingUm: number;
  substrateDiffusionLengthUm: number;
  cellsPerSubstrateDiffusionLength: number;
  filmDiffusionLengthNm: number;
}

const finitePositiveFields: Array<keyof OptothermalConfig> = [
  "wavelengthUm", "waistUm", "peakIntensityGwCm2", "pulseFwhmNs", "durationNs",
  "filmThicknessNm", "substrateDepthUm", "radiusUm", "substrateIndex", "airIndex",
  "insulatingN", "insulatingK", "metallicN", "metallicK", "transitionWidthC",
  "phaseRelaxationNs", "filmDensityKgM3", "filmHeatCapacityJKgK", "filmConductivityWMK",
  "substrateDensityKgM3", "substrateHeatCapacityJKgK", "substrateConductivityWMK",
];

const finiteNonNegativeFields: Array<keyof OptothermalConfig> = ["convectionWM2K"];

export function getMeshDiagnostics(config: OptothermalConfig): MeshDiagnostics {
  const radialSpacingUm = config.radiusUm / Math.max(1, config.radialCells - 1);
  const pointsPerWaist = config.waistUm / radialSpacingUm;
  const substrateSpacingUm = config.substrateDepthUm / config.substrateCells;
  const substrateDiffusivityM2S = config.substrateConductivityWMK
    / (config.substrateDensityKgM3 * config.substrateHeatCapacityJKgK);
  const substrateDiffusionLengthUm = Math.sqrt(substrateDiffusivityM2S * config.pulseFwhmNs * 1e-9) * 1e6;
  const cellsPerSubstrateDiffusionLength = substrateDiffusionLengthUm / substrateSpacingUm;
  const filmDiffusivityM2S = config.filmConductivityWMK / (config.filmDensityKgM3 * config.filmHeatCapacityJKgK);
  const filmDiffusionLengthNm = Math.sqrt(filmDiffusivityM2S * config.pulseFwhmNs * 1e-9) * 1e9;
  return {
    radialSpacingUm,
    pointsPerWaist,
    substrateSpacingUm,
    substrateDiffusionLengthUm,
    cellsPerSubstrateDiffusionLength,
    filmDiffusionLengthNm,
  };
}

export function validateConfig(config: OptothermalConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const field of finitePositiveFields) {
    const value = config[field];
    if (!Number.isFinite(value) || value <= 0) issues.push({ id: `positive-${field}`, severity: "error", field, message: "Enter a positive finite value." });
  }
  for (const field of finiteNonNegativeFields) {
    const value = config[field];
    if (!Number.isFinite(value) || value < 0) issues.push({ id: `non-negative-${field}`, severity: "error", field, message: "Enter a finite value greater than or equal to zero." });
  }
  if (!Number.isFinite(config.ambientC) || config.ambientC < -100 || config.ambientC > 500) {
    issues.push({ id: "ambient-range", severity: "error", field: "ambientC", message: "Ambient temperature must be between −100 and 500 °C." });
  }
  if (!Number.isFinite(config.transitionHeatingC) || config.transitionHeatingC <= -273.15) {
    issues.push({ id: "heating-transition-absolute-zero", severity: "error", field: "transitionHeatingC", message: "The heating transition must be above absolute zero (−273.15 °C)." });
  }
  if (!Number.isFinite(config.transitionCoolingC) || config.transitionCoolingC <= -273.15) {
    issues.push({ id: "cooling-transition-absolute-zero", severity: "error", field: "transitionCoolingC", message: "The cooling transition must be above absolute zero (−273.15 °C)." });
  }
  if (config.durationNs < 6 * config.pulseFwhmNs) {
    issues.push({ id: "duration-window", severity: "error", field: "durationNs", message: "Use at least six pulse FWHM so the Gaussian pulse is contained in the time window." });
  }
  const pointsPerFwhm = (config.timeSteps - 1) * config.pulseFwhmNs / config.durationNs;
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
  const { pointsPerWaist, cellsPerSubstrateDiffusionLength, filmDiffusionLengthNm } = getMeshDiagnostics(config);
  if (pointsPerWaist < 2) {
    issues.push({ id: "radial-source-unresolved", severity: "error", field: "radialCells", message: `The Gaussian waist spans only ${pointsPerWaist.toFixed(2)} radial intervals; use at least 2 to avoid source aliasing.` });
  } else if (pointsPerWaist < 8) {
    issues.push({ id: "radial-source-resolution", severity: "warning", field: "radialCells", message: `The Gaussian waist spans ${pointsPerWaist.toFixed(2)} radial intervals; use at least 8 for quantitative work.` });
  }
  if (cellsPerSubstrateDiffusionLength < 0.01) {
    issues.push({ id: "substrate-diffusion-unresolved", severity: "error", field: "substrateCells", message: `The substrate diffusion length spans only ${cellsPerSubstrateDiffusionLength.toExponential(2)} cells; this mesh cannot represent the near-interface gradient.` });
  } else if (cellsPerSubstrateDiffusionLength < 4) {
    issues.push({ id: "substrate-diffusion-resolution", severity: "warning", field: "substrateCells", message: `The substrate diffusion length spans ${cellsPerSubstrateDiffusionLength.toFixed(2)} cells; use at least 4 for quantitative work.` });
  }
  if (config.filmThicknessNm > filmDiffusionLengthNm) {
    issues.push({ id: "film-lumped-resolution", severity: "warning", field: "filmThicknessNm", message: `The film is represented by one control volume although its thickness is ${config.filmThicknessNm.toPrecision(3)} nm and its pulse diffusion length is ${filmDiffusionLengthNm.toPrecision(3)} nm.` });
  }
  return issues;
}

function everyFinite(values: number[]): boolean {
  return values.every(Number.isFinite);
}

function flattenMatrix(values: number[][]): number[] {
  return values.flatMap((row) => row);
}

export function validateResult(result: OptothermalResult): ResultValidation {
  const nt = result.timeNs.length;
  const nr = result.radiusUm.length;
  const nz = result.depthUm.length;
  const strictlyIncreasing = (values: number[]) => values.every((value, index) => index === 0 || value > values[index - 1]);
  const schema = nt >= 2 && nr >= 2 && nz >= 2
    && result.centerTemperatureC.length === nt
    && result.centerMetallicFraction.length === nt
    && result.centerAbsorptance.length === nt
    && result.finalSurfaceTemperatureC.length === nr
    && result.peakSurfaceTemperatureC.length === nr
    && result.finalTemperatureMapC.length === nz
    && result.peakTemperatureMapC.length === nz
    && result.finalTemperatureMapC.every((row) => row.length === nr)
    && result.peakTemperatureMapC.every((row) => row.length === nr)
    && strictlyIncreasing(result.timeNs)
    && strictlyIncreasing(result.radiusUm)
    && strictlyIncreasing(result.depthUm);
  const arrays = [
    result.timeNs,
    result.centerTemperatureC,
    result.centerMetallicFraction,
    result.centerAbsorptance,
    result.radiusUm,
    result.finalSurfaceTemperatureC,
    result.peakSurfaceTemperatureC,
    result.depthUm,
    flattenMatrix(result.finalTemperatureMapC),
    flattenMatrix(result.peakTemperatureMapC),
  ];
  const numericMetrics = Object.values(result.metrics).filter((value): value is number => typeof value === "number");
  const finite = arrays.every(everyFinite) && numericMetrics.every(Number.isFinite);
  const temperatureValues = [
    ...result.centerTemperatureC,
    ...result.finalSurfaceTemperatureC,
    ...result.peakSurfaceTemperatureC,
    ...flattenMatrix(result.finalTemperatureMapC),
    ...flattenMatrix(result.peakTemperatureMapC),
  ];
  const physicalRanges = temperatureValues.every((value) => value >= -273.15)
    && result.centerMetallicFraction.every((value) => value >= 0 && value <= 1)
    && result.centerAbsorptance.every((value) => value >= 0 && value <= 1)
    && result.metrics.maximumMetallicFraction >= 0 && result.metrics.maximumMetallicFraction <= 1
    && result.metrics.peakAbsorptance >= 0 && result.metrics.peakAbsorptance <= 1
    && result.metrics.baselineAbsorptance >= 0 && result.metrics.baselineAbsorptance <= 1;
  const opticalBalanceDefect = result.metrics.baselineReflectance
    + result.metrics.baselineTransmittance
    + result.metrics.baselineAbsorptanceRaw - 1;
  const passive = Math.abs(opticalBalanceDefect) <= OPTICAL_POWER_TOLERANCE
    && result.metrics.baselineReflectance >= -OPTICAL_POWER_TOLERANCE
    && result.metrics.baselineTransmittance >= -OPTICAL_POWER_TOLERANCE
    && result.metrics.minimumAbsorptanceRaw >= -OPTICAL_POWER_TOLERANCE
    && result.metrics.maximumAbsorptanceRaw <= 1 + OPTICAL_POWER_TOLERANCE;
  const energyBound = result.metrics.absorbedEnergyJ >= 0
    && result.metrics.maximumStoredEnergyJ >= result.metrics.minimumStoredEnergyJ
    && result.metrics.minimumStoredEnergyJ >= -NEGATIVE_ENERGY_TOLERANCE_J
    && result.metrics.storedToAbsorbedRatio >= 0
    && result.metrics.storedToAbsorbedRatio <= 1.02;
  const converged = result.metrics.linearConverged
    && result.metrics.averageLinearIterations > 0
    && result.metrics.maximumLinearIterations > 0
    && result.metrics.worstLinearStep >= 1
    && result.metrics.worstLinearStep < nt
    && result.metrics.worstLinearUpdateK <= result.metrics.linearUpdateToleranceK
    && result.metrics.worstLinearResidual <= result.metrics.linearResidualTolerance;
  return { schema, finite, physicalRanges, passive, energyBound, converged };
}

export function assertValidResult(config: OptothermalConfig, result: OptothermalResult): void {
  const dimensionsMatch = result.timeNs.length === config.timeSteps
    && result.radiusUm.length === config.radialCells
    && result.depthUm.length === config.substrateCells + 1;
  if (!dimensionsMatch) throw new Error("The solver result dimensions do not match the requested configuration.");
  const checks = validateResult(result);
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) throw new Error(`The solver result failed validation: ${failures.join(", ")}.`);
}
