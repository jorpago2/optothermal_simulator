import type { OptothermalConfig, OptothermalResult, ResultValidation, ValidationIssue } from "./types";

const OPTICAL_POWER_TOLERANCE = 1e-9;
const NEGATIVE_ENERGY_TOLERANCE_J = 1e-18;

export interface MeshDiagnostics {
  radialSpacingUm: number;
  pointsPerWaist: number;
  substrateSpacingUm: number;
  substrateMaximumSpacingUm: number;
  substrateDiffusionSpacingUm: number;
  substrateDiffusionLengthUm: number;
  cellsPerSubstrateDiffusionLength: number;
  filmDiffusionLengthNm: number;
  filmSpacingNm: number;
  cellsPerFilmDiffusionLength: number;
}

const finitePositiveFields: Array<keyof OptothermalConfig> = [
  "wavelengthUm", "waistUm", "peakIntensityGwCm2", "pulseFwhmNs", "durationNs",
  "filmThicknessNm", "substrateDepthUm", "radiusUm", "substrateIndex", "airIndex",
  "insulatingN", "insulatingK", "metallicN", "metallicK", "transitionWidthC",
  "phaseRelaxationNs", "filmDensityKgM3", "filmHeatCapacityJKgK", "filmConductivityWMK",
  "substrateDensityKgM3", "substrateHeatCapacityJKgK", "substrateConductivityWMK",
];

const finiteNonNegativeFields: Array<keyof OptothermalConfig> = ["convectionWM2K"];

const optothermalConfigFields: Array<keyof OptothermalConfig> = [
  "wavelengthUm", "waistUm", "peakIntensityGwCm2", "pulseFwhmNs", "durationNs", "ambientC",
  "filmThicknessNm", "substrateDepthUm", "radiusUm", "substrateIndex", "airIndex", "insulatingN", "insulatingK",
  "metallicN", "metallicK", "transitionHeatingC", "transitionCoolingC", "transitionWidthC", "phaseRelaxationNs",
  "filmDensityKgM3", "filmHeatCapacityJKgK", "filmConductivityWMK", "substrateDensityKgM3", "substrateHeatCapacityJKgK",
  "substrateConductivityWMK", "convectionWM2K", "timeSteps", "radialCells", "substrateCells", "filmCells", "substrateGrading",
];

export type SavedOptothermalConfig = Omit<OptothermalConfig, "filmCells" | "substrateGrading">
  & Partial<Pick<OptothermalConfig, "filmCells" | "substrateGrading">>;

/** Older drafts retain their original single film cell and uniform substrate. */
export function restoreMeshConfig(value: SavedOptothermalConfig): OptothermalConfig {
  return { ...value, filmCells: value.filmCells ?? 1, substrateGrading: value.substrateGrading ?? 0 };
}

export function isSavedOptothermalConfig(value: unknown): value is SavedOptothermalConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as SavedOptothermalConfig;
  if (("filmCells" in candidate) !== ("substrateGrading" in candidate)) return false;
  if ("filmCells" in candidate && (!Number.isFinite(candidate.filmCells) || !Number.isFinite(candidate.substrateGrading))) return false;
  return isOptothermalConfig(restoreMeshConfig(candidate));
}

/** Substrate cell edges in µm, measured from the film interface into the substrate. */
export function substrateDepthEdges(config: OptothermalConfig): number[] {
  const { substrateCells: count, substrateDepthUm: depth, substrateGrading: grading } = config;
  if (!Number.isInteger(count) || count < 4 || count > 128 || !Number.isFinite(grading) || grading < 0 || grading > 8 || !Number.isFinite(depth) || depth <= 0) return [];
  return Array.from({ length: count + 1 }, (_, index) => depth * (grading === 0
    ? index / count
    : Math.expm1(grading * index / count) / Math.expm1(grading)));
}

export function thermalDepthEdges(config: OptothermalConfig): number[] {
  if (!Number.isInteger(config.filmCells) || config.filmCells < 1 || config.filmCells > 64) return [];
  return [...substrateDepthEdges(config).reverse().map((depth) => -depth),
    ...Array.from({ length: config.filmCells }, (_, index) => config.filmThicknessNm / 1000 * (index + 1) / config.filmCells)];
}

export function isOptothermalConfig(value: unknown): value is OptothermalConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<OptothermalConfig>;
  if (!optothermalConfigFields.every((field) => Object.prototype.hasOwnProperty.call(candidate, field) && Number.isFinite(candidate[field]))) return false;
  try {
    return !validateConfig(candidate as OptothermalConfig).some((issue) => issue.severity === "error");
  } catch {
    return false;
  }
}

export function getMeshDiagnostics(config: OptothermalConfig): MeshDiagnostics {
  const radialSpacingUm = config.radiusUm / Math.max(1, config.radialCells - 1);
  const pointsPerWaist = config.waistUm / radialSpacingUm;
  const edges = substrateDepthEdges(config);
  const widths = edges.slice(1).map((edge, index) => edge - edges[index]);
  const substrateSpacingUm = widths[0] ?? Number.NaN;
  const substrateMaximumSpacingUm = widths.at(-1) ?? Number.NaN;
  const substrateDiffusivityM2S = config.substrateConductivityWMK
    / (config.substrateDensityKgM3 * config.substrateHeatCapacityJKgK);
  const substrateDiffusionLengthUm = Math.sqrt(substrateDiffusivityM2S * config.pulseFwhmNs * 1e-9) * 1e6;
  // The first cell alone can look well resolved even if its neighbours are too coarse.
  const diffusionWidths = widths.filter((_, index) => edges[index] < substrateDiffusionLengthUm);
  const substrateDiffusionSpacingUm = diffusionWidths.length ? Math.max(...diffusionWidths) : Number.NaN;
  const cellsPerSubstrateDiffusionLength = substrateDiffusionLengthUm / substrateDiffusionSpacingUm;
  const filmDiffusivityM2S = config.filmConductivityWMK / (config.filmDensityKgM3 * config.filmHeatCapacityJKgK);
  const filmDiffusionLengthNm = Math.sqrt(filmDiffusivityM2S * config.pulseFwhmNs * 1e-9) * 1e9;
  const filmSpacingNm = config.filmThicknessNm / config.filmCells;
  return {
    radialSpacingUm,
    pointsPerWaist,
    substrateSpacingUm,
    substrateMaximumSpacingUm,
    substrateDiffusionSpacingUm,
    substrateDiffusionLengthUm,
    cellsPerSubstrateDiffusionLength,
    filmDiffusionLengthNm,
    filmSpacingNm,
    cellsPerFilmDiffusionLength: filmDiffusionLengthNm / filmSpacingNm,
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
  if (!Number.isInteger(config.filmCells) || config.filmCells < 1 || config.filmCells > 64) {
    issues.push({ id: "film-cells", severity: "error", field: "filmCells", message: "Film cells must be an integer between 1 and 64." });
  }
  if (!Number.isFinite(config.substrateGrading) || config.substrateGrading < 0 || config.substrateGrading > 8) {
    issues.push({ id: "substrate-grading", severity: "error", field: "substrateGrading", message: "Substrate grading must be between 0 (uniform) and 8." });
  }
  if (config.radialCells * (config.substrateCells + config.filmCells) > 40_000) {
    issues.push({ id: "mesh-size", severity: "error", field: "radialCells", message: "The mesh exceeds the 40,000-cell browser limit." });
  }
  if (config.transitionCoolingC >= config.transitionHeatingC) {
    issues.push({ id: "hysteresis-order", severity: "error", field: "transitionCoolingC", message: "The cooling transition must be below the heating transition." });
  }
  const { pointsPerWaist, cellsPerSubstrateDiffusionLength, filmDiffusionLengthNm, filmSpacingNm, cellsPerFilmDiffusionLength } = getMeshDiagnostics(config);
  if (pointsPerWaist < 2) {
    issues.push({ id: "radial-source-unresolved", severity: "error", field: "radialCells", message: `The Gaussian waist spans only ${pointsPerWaist.toFixed(2)} radial intervals; use at least 2 to avoid source aliasing.` });
  } else if (pointsPerWaist < 8) {
    issues.push({ id: "radial-source-resolution", severity: "warning", field: "radialCells", message: `The Gaussian waist spans ${pointsPerWaist.toFixed(2)} radial intervals; use at least 8 for quantitative work.` });
  }
  if (cellsPerSubstrateDiffusionLength < 0.01) {
    issues.push({ id: "substrate-diffusion-unresolved", severity: "error", field: "substrateCells", message: `The substrate diffusion length spans only ${cellsPerSubstrateDiffusionLength.toExponential(2)} cells; this mesh cannot represent the near-interface gradient.` });
  } else if (cellsPerSubstrateDiffusionLength < 4) {
    issues.push({ id: "substrate-diffusion-resolution", severity: "warning", field: "substrateCells", message: `The substrate diffusion resolution is ${cellsPerSubstrateDiffusionLength.toFixed(2)} cells/Ld, using the largest cell intersecting the diffusion layer. Aim for at least 4, then verify convergence.` });
  }
  if (cellsPerFilmDiffusionLength < 4) {
    issues.push({ id: "film-diffusion-resolution", severity: "warning", field: "filmCells", message: `Film cells are ${filmSpacingNm.toPrecision(3)} nm thick; the pulse diffusion length is ${filmDiffusionLengthNm.toPrecision(3)} nm. Aim for at least 4 cells/Ld, then verify convergence.` });
  }
  const windowDiffusionUm = Math.sqrt(config.substrateConductivityWMK / (config.substrateDensityKgM3 * config.substrateHeatCapacityJKgK) * config.durationNs * 1e-9) * 1e6;
  if (config.substrateDepthUm < 4 * windowDiffusionUm) {
    issues.push({ id: "substrate-boundary", severity: "warning", field: "substrateDepthUm", message: "The substrate boundary is within four diffusion lengths over the full time window. Check domain-depth convergence before interpreting cooling." });
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
    && result.depthEdgesUm.length === nz + 1
    && strictlyIncreasing(result.depthEdgesUm)
    && result.depthUm.every((depth, index) => depth > result.depthEdgesUm[index] && depth < result.depthEdgesUm[index + 1])
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
    result.depthEdgesUm,
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
    && result.depthUm.length === config.substrateCells + config.filmCells;
  if (!dimensionsMatch) throw new Error("The solver result dimensions do not match the requested configuration.");
  const edges = thermalDepthEdges(config);
  if (result.depthUm.some((depth, index) => Math.abs(depth - (edges[index] + edges[index + 1]) / 2) > 1e-9 * Math.max(1, config.substrateDepthUm))) {
    throw new Error("The solver depth coordinates do not match the requested mesh.");
  }
  const checks = validateResult(result);
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) throw new Error(`The solver result failed validation: ${failures.join(", ")}.`);
}
