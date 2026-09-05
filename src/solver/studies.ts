import type { OptothermalConfig, OptothermalResult } from "./types";
import { validateConfig } from "./validation";

const MAX_MESH_CELLS = 40_000;
const CONVERGENCE_LIMITS = {
  radialCells: 257,
  filmCells: 64,
  substrateCells: 128,
  timeSteps: 1200,
} as const;

const CONVERGENCE_FIELDS = ["radialCells", "filmCells", "substrateCells", "timeSteps"] as const;
const SWEEP_FIELDS = ["peakIntensityGwCm2", "pulseFwhmNs", "filmThicknessNm"] as const;
const CONFIG_FIELDS = [
  "wavelengthUm", "waistUm", "peakIntensityGwCm2", "pulseFwhmNs", "durationNs", "ambientC",
  "filmThicknessNm", "substrateDepthUm", "radiusUm", "substrateIndex", "airIndex", "insulatingN", "insulatingK",
  "metallicN", "metallicK", "transitionHeatingC", "transitionCoolingC", "transitionWidthC", "phaseRelaxationNs",
  "filmDensityKgM3", "filmHeatCapacityJKgK", "filmConductivityWMK", "substrateDensityKgM3", "substrateHeatCapacityJKgK",
  "substrateConductivityWMK", "convectionWM2K", "timeSteps", "radialCells", "substrateCells", "filmCells", "substrateGrading",
] as const satisfies ReadonlyArray<keyof OptothermalConfig>;

type ParameterMetadata = { readonly label: string; readonly unit?: string };

/** Labels and units shared by convergence, sweeps and changed-parameter summaries. */
export const STUDY_PARAMETER_METADATA: Record<keyof OptothermalConfig, ParameterMetadata> = {
  wavelengthUm: { label: "Wavelength", unit: "µm" },
  waistUm: { label: "Beam waist", unit: "µm" },
  peakIntensityGwCm2: { label: "Peak intensity", unit: "GW/cm²" },
  pulseFwhmNs: { label: "Pulse FWHM", unit: "ns" },
  durationNs: { label: "Simulation duration", unit: "ns" },
  ambientC: { label: "Ambient temperature", unit: "°C" },
  filmThicknessNm: { label: "Film thickness", unit: "nm" },
  substrateDepthUm: { label: "Substrate depth", unit: "µm" },
  radiusUm: { label: "Radial domain", unit: "µm" },
  substrateIndex: { label: "Substrate refractive index" },
  airIndex: { label: "Air refractive index" },
  insulatingN: { label: "Insulating refractive index" },
  insulatingK: { label: "Insulating extinction coefficient" },
  metallicN: { label: "Metallic refractive index" },
  metallicK: { label: "Metallic extinction coefficient" },
  transitionHeatingC: { label: "Heating transition", unit: "°C" },
  transitionCoolingC: { label: "Cooling transition", unit: "°C" },
  transitionWidthC: { label: "Transition width", unit: "°C" },
  phaseRelaxationNs: { label: "Phase relaxation", unit: "ns" },
  filmDensityKgM3: { label: "Film density", unit: "kg/m³" },
  filmHeatCapacityJKgK: { label: "Film heat capacity", unit: "J/(kg·K)" },
  filmConductivityWMK: { label: "Film conductivity", unit: "W/(m·K)" },
  substrateDensityKgM3: { label: "Substrate density", unit: "kg/m³" },
  substrateHeatCapacityJKgK: { label: "Substrate heat capacity", unit: "J/(kg·K)" },
  substrateConductivityWMK: { label: "Substrate conductivity", unit: "W/(m·K)" },
  convectionWM2K: { label: "Convection coefficient", unit: "W/(m²·K)" },
  timeSteps: { label: "Time samples", unit: "samples" },
  radialCells: { label: "Radial cells", unit: "cells" },
  substrateCells: { label: "Substrate cells", unit: "cells" },
  filmCells: { label: "Film cells", unit: "cells" },
  substrateGrading: { label: "Substrate grading" },
};

export type ConvergenceField = typeof CONVERGENCE_FIELDS[number];
export type SweepField = typeof SWEEP_FIELDS[number];

export interface StudyCase {
  id: string;
  name: string;
  config: OptothermalConfig;
  result: OptothermalResult;
}

export interface StudyPlanCase {
  id: string;
  name: string;
  config: OptothermalConfig;
  field?: keyof OptothermalConfig;
  skippedReason?: string;
}

export interface ComparisonTolerances {
  /** Relative temperature-rise tolerance, expressed as a fraction. */
  temperatureRiseRelative: number;
  /** Absolute metallic-fraction tolerance, expressed as a fraction of [0, 1]. */
  metallicFractionAbsolute: number;
  /** Relative absorbed-energy tolerance, expressed as a fraction. */
  energyRelative: number;
}

export const DEFAULT_COMPARISON_TOLERANCES: ComparisonTolerances = {
  temperatureRiseRelative: 0.01,
  metallicFractionAbsolute: 0.01,
  energyRelative: 0.01,
};

export interface ResultComparison {
  temperatureRiseBaseK: number;
  temperatureRiseCandidateK: number;
  temperatureRiseDeltaK: number;
  temperatureRiseRelative: number;
  metallicFractionBase: number;
  metallicFractionCandidate: number;
  metallicFractionDelta: number;
  metallicFractionAbsoluteDelta: number;
  energyBaseJ: number;
  energyCandidateJ: number;
  energyDeltaJ: number;
  energyRelative: number;
  tolerances: ComparisonTolerances;
  withinTolerance: {
    temperatureRise: boolean;
    metallicFraction: boolean;
    energy: boolean;
  };
  /** Pairwise status only; it is not a universal convergence claim. */
  status: "within-tolerance" | "outside-tolerance";
}

export interface ThermalTransitionDuration {
  durationNs: number | null;
  startsMetallic: boolean;
  endsMetallic: boolean;
  startNs: number | null;
  endNs: number | null;
}

export interface ChangedParameter {
  field: keyof OptothermalConfig;
  label: string;
  unit?: string;
  before: number;
  after: number;
}

function meshCells(config: OptothermalConfig): number {
  return config.radialCells * (config.substrateCells + config.filmCells);
}

function validationError(config: OptothermalConfig): string | undefined {
  const errors = validateConfig(config).filter((issue) => issue.severity === "error");
  return errors.length ? errors.map((issue) => issue.message).join(" ") : undefined;
}

function assertValidStudyConfig(config: OptothermalConfig, context: string): void {
  const error = validationError(config);
  if (error) throw new Error(`${context}: ${error}`);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number.isFinite(value) ? String(Number(value.toPrecision(6))) : String(value);
}

function formatParameterValue(field: keyof OptothermalConfig, value: number): string {
  const { unit } = STUDY_PARAMETER_METADATA[field];
  return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
}

function refinementName(field: ConvergenceField, current: number, target: number): string {
  return `${STUDY_PARAMETER_METADATA[field].label}: ${formatParameterValue(field, current)} → ${formatParameterValue(field, target)}`;
}

function refinedValue(field: ConvergenceField, current: number): number {
  return Math.min(
    field === "radialCells" || field === "timeSteps" ? 2 * (current - 1) + 1 : 2 * current,
    CONVERGENCE_LIMITS[field],
  );
}

function sweepName(field: SweepField, value: number): string {
  return `${STUDY_PARAMETER_METADATA[field].label}: ${formatParameterValue(field, value)}`;
}

function skippedMeshReason(config: OptothermalConfig): string | undefined {
  const cells = meshCells(config);
  return cells > MAX_MESH_CELLS
    ? `Skipped: mesh would contain ${cells.toLocaleString("en-US")} cells, above the ${MAX_MESH_CELLS.toLocaleString("en-US")}-cell limit.`
    : undefined;
}

export function buildConvergencePlan(config: OptothermalConfig): StudyPlanCase[] {
  assertValidStudyConfig(config, "Cannot build a convergence plan from an invalid configuration");
  const baseline = { ...config };
  const plan: StudyPlanCase[] = [{ id: "baseline", name: "Baseline", config: baseline }];

  for (const field of CONVERGENCE_FIELDS) {
    const current = config[field];
    const target = refinedValue(field, current);
    const candidate = { ...baseline, [field]: target } as OptothermalConfig;
    let skippedReason: string | undefined;
    if (target === current) {
      skippedReason = `Skipped: ${STUDY_PARAMETER_METADATA[field].label.toLowerCase()} is already at its limit (${formatParameterValue(field, current)}).`;
    } else {
      skippedReason = skippedMeshReason(candidate);
      if (!skippedReason) {
        const error = validationError(candidate);
        if (error) skippedReason = `Skipped: ${error}`;
      }
    }
    plan.push({
      id: `refine-${field}`,
      name: refinementName(field, current, target),
      config: candidate,
      field,
      ...(skippedReason ? { skippedReason } : {}),
    });
  }
  return plan;
}

export function buildSweepPlan(
  config: OptothermalConfig,
  field: SweepField,
  start: number,
  end: number,
  count: number,
): StudyPlanCase[] {
  if (!(SWEEP_FIELDS as readonly string[]).includes(field)) {
    throw new Error(`Unsupported sweep field: ${String(field)}.`);
  }
  if (!Number.isInteger(count) || count < 2 || count > 12) {
    throw new Error("Sweep count must be an integer between 2 and 12.");
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error("Sweep start and end must be finite numbers.");
  }
  if (start === end) {
    throw new Error("Sweep start and end must differ to produce distinct points.");
  }
  assertValidStudyConfig(config, "Cannot build a sweep plan from an invalid configuration");

  const plan = Array.from({ length: count }, (_, index): StudyPlanCase => {
    const value = start + (end - start) * index / (count - 1);
    const candidate = { ...config, [field]: value } as OptothermalConfig;
    return {
      id: `sweep-${field}-${index + 1}`,
      name: sweepName(field, value),
      config: candidate,
      field,
    };
  });
  const invalid = plan
    .map((studyCase, index) => ({ studyCase, index, error: validationError(studyCase.config) }))
    .filter((entry): entry is { studyCase: StudyPlanCase; index: number; error: string } => Boolean(entry.error));
  if (invalid.length) {
    const details = invalid.map(({ index, error }) => `case ${index + 1}: ${error}`).join(" ");
    throw new Error(`Sweep contains invalid configurations; no cases were returned. ${details}`);
  }
  return plan;
}

function configOf(value: OptothermalConfig | StudyCase): OptothermalConfig {
  return "config" in value ? value.config : value;
}

export function changedParameters(
  base: OptothermalConfig | StudyCase,
  candidate: OptothermalConfig | StudyCase,
): ChangedParameter[] {
  const baseConfig = configOf(base);
  const candidateConfig = configOf(candidate);
  return CONFIG_FIELDS
    .filter((field) => baseConfig[field] !== candidateConfig[field])
    .map((field) => ({
      field,
      ...STUDY_PARAMETER_METADATA[field],
      before: baseConfig[field],
      after: candidateConfig[field],
    }));
}

function checkedTolerance(value: number, field: keyof ComparisonTolerances): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Comparison tolerance ${field} must be a finite non-negative number.`);
  return value;
}

function resolvedTolerances(tolerances?: Partial<ComparisonTolerances>): ComparisonTolerances {
  const resolved = {
    temperatureRiseRelative: tolerances?.temperatureRiseRelative ?? DEFAULT_COMPARISON_TOLERANCES.temperatureRiseRelative,
    metallicFractionAbsolute: tolerances?.metallicFractionAbsolute ?? DEFAULT_COMPARISON_TOLERANCES.metallicFractionAbsolute,
    energyRelative: tolerances?.energyRelative ?? DEFAULT_COMPARISON_TOLERANCES.energyRelative,
  };
  return {
    temperatureRiseRelative: checkedTolerance(resolved.temperatureRiseRelative, "temperatureRiseRelative"),
    metallicFractionAbsolute: checkedTolerance(resolved.metallicFractionAbsolute, "metallicFractionAbsolute"),
    energyRelative: checkedTolerance(resolved.energyRelative, "energyRelative"),
  };
}

function checkedMetric(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Cannot compare results with a non-finite ${label}.`);
  return value;
}

export function compareResults(
  base: StudyCase,
  candidate: StudyCase,
  tolerances?: Partial<ComparisonTolerances>,
): ResultComparison {
  const baseMaximumTemperature = checkedMetric(base.result.metrics.maximumTemperatureC, "base maximum temperature");
  const candidateMaximumTemperature = checkedMetric(candidate.result.metrics.maximumTemperatureC, "candidate maximum temperature");
  const baseAmbient = checkedMetric(base.config.ambientC, "base ambient temperature");
  const candidateAmbient = checkedMetric(candidate.config.ambientC, "candidate ambient temperature");
  const temperatureRiseBaseK = Math.max(0, baseMaximumTemperature - baseAmbient);
  const temperatureRiseCandidateK = Math.max(0, candidateMaximumTemperature - candidateAmbient);
  const temperatureRiseDeltaK = temperatureRiseCandidateK - temperatureRiseBaseK;
  const temperatureRiseRelative = Math.abs(temperatureRiseDeltaK) / Math.max(temperatureRiseBaseK, 1);

  const metallicFractionBase = checkedMetric(base.result.metrics.maximumMetallicFraction, "base maximum metallic fraction");
  const metallicFractionCandidate = checkedMetric(candidate.result.metrics.maximumMetallicFraction, "candidate maximum metallic fraction");
  const metallicFractionDelta = metallicFractionCandidate - metallicFractionBase;
  const metallicFractionAbsoluteDelta = Math.abs(metallicFractionDelta);

  const energyBaseJ = checkedMetric(base.result.metrics.absorbedEnergyJ, "base absorbed energy");
  const energyCandidateJ = checkedMetric(candidate.result.metrics.absorbedEnergyJ, "candidate absorbed energy");
  const energyDeltaJ = energyCandidateJ - energyBaseJ;
  const energyRelative = Math.abs(energyDeltaJ) / Math.max(Math.abs(energyBaseJ), 1e-18);

  const resolved = resolvedTolerances(tolerances);
  const withinTolerance = {
    temperatureRise: temperatureRiseRelative <= resolved.temperatureRiseRelative,
    metallicFraction: metallicFractionAbsoluteDelta <= resolved.metallicFractionAbsolute,
    energy: energyRelative <= resolved.energyRelative,
  };
  return {
    temperatureRiseBaseK,
    temperatureRiseCandidateK,
    temperatureRiseDeltaK,
    temperatureRiseRelative,
    metallicFractionBase,
    metallicFractionCandidate,
    metallicFractionDelta,
    metallicFractionAbsoluteDelta,
    energyBaseJ,
    energyCandidateJ,
    energyDeltaJ,
    energyRelative,
    tolerances: resolved,
    withinTolerance,
    status: Object.values(withinTolerance).every(Boolean) ? "within-tolerance" : "outside-tolerance",
  };
}

function crossingTime(timeBefore: number, timeAfter: number, phaseBefore: number, phaseAfter: number): number {
  if (phaseAfter === phaseBefore) return timeAfter;
  const fraction = Math.min(1, Math.max(0, (0.5 - phaseBefore) / (phaseAfter - phaseBefore)));
  return timeBefore + fraction * (timeAfter - timeBefore);
}

export function thermalTransitionDuration(result: OptothermalResult): ThermalTransitionDuration {
  const { timeNs, centerMetallicFraction: phase } = result;
  if (timeNs.length !== phase.length || timeNs.length < 2) {
    throw new Error("A thermal transition requires matching time and center-phase arrays with at least two samples.");
  }
  if (!timeNs.every(Number.isFinite) || !phase.every(Number.isFinite)) {
    throw new Error("A thermal transition requires finite time and center-phase samples.");
  }
  if (!timeNs.every((time, index) => index === 0 || time > timeNs[index - 1])) {
    throw new Error("Thermal transition times must be strictly increasing.");
  }
  const windowStart = timeNs[0];
  const windowEnd = timeNs[timeNs.length - 1];
  const startsMetallic = phase[0] >= 0.5;
  const endsMetallic = phase[phase.length - 1] >= 0.5;

  let inMetallic = startsMetallic;
  let episodeStart = startsMetallic ? windowStart : null;
  let startNs: number | null = startsMetallic ? windowStart : null;
  let endNs: number | null = null;
  let durationNs = 0;
  for (let index = 1; index < phase.length; index += 1) {
    const nextMetallic = phase[index] >= 0.5;
    if (!inMetallic && nextMetallic) {
      episodeStart = crossingTime(timeNs[index - 1], timeNs[index], phase[index - 1], phase[index]);
      startNs ??= episodeStart;
      inMetallic = true;
    } else if (inMetallic && !nextMetallic) {
      const episodeEnd = crossingTime(timeNs[index - 1], timeNs[index], phase[index - 1], phase[index]);
      const boundedStart = Math.min(windowEnd, Math.max(windowStart, episodeStart ?? windowStart));
      const boundedEnd = Math.min(windowEnd, Math.max(windowStart, episodeEnd));
      durationNs += Math.max(0, boundedEnd - boundedStart);
      endNs = boundedEnd;
      episodeStart = null;
      inMetallic = false;
    }
  }
  if (inMetallic && episodeStart !== null) {
    const boundedStart = Math.min(windowEnd, Math.max(windowStart, episodeStart));
    durationNs += Math.max(0, windowEnd - boundedStart);
    endNs = windowEnd;
  }
  if (startNs === null || endNs === null) {
    return { durationNs: null, startsMetallic, endsMetallic, startNs: null, endNs: null };
  }
  return {
    durationNs,
    startsMetallic,
    endsMetallic,
    startNs,
    endNs,
  };
}
