import type { OptothermalConfig, OptothermalResult } from "./types";

export interface TemperaturePair {
  peakTemperatureC: number;
  finalTemperatureC: number;
}

export interface FilmTemperatureSummary {
  meanOfLocalMaximaUpperBoundC: number;
  finalTemperatureC: number;
}

export interface InterfaceTemperature {
  interfacePeakBoundC: number;
  finalTemperatureC: number;
  lowerDepthUm: number;
  upperDepthUm: number;
}

export interface DepthProfileSummary {
  surface: TemperaturePair;
  filmWeightedMean: FilmTemperatureSummary;
  interfaceApproximation: InterfaceTemperature;
}

export interface DepthProfile {
  radiusIndex: number;
  radiusUm: number;
  depthUm: number[];
  peakTemperatureC: number[];
  finalTemperatureC: number[];
  filmInterfaceRangeUm: [number, number];
  summary: DepthProfileSummary;
}

function clampIndex(index: number, length: number): number {
  if (length === 0 || !Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length - 1, Math.trunc(index)));
}

function validatedGeometry(result: OptothermalResult, config: OptothermalConfig): { widthsUm: number[]; filmStart: number } {
  const depthCount = result.depthUm.length;
  const radiusCount = result.radiusUm.length;
  const edges = result.depthEdgesUm;
  const invalid = (message: string): never => {
    throw new Error(`Cannot build depth profile: ${message}`);
  };
  if (depthCount < 2 || radiusCount < 1 || edges.length !== depthCount + 1) {
    return invalid("depth edges, centres, and radial samples must be complete.");
  }
  if (!edges.every((edge, index) => Number.isFinite(edge) && (index === 0 || edge > edges[index - 1]))) {
    return invalid("depth edges must be finite and strictly increasing.");
  }
  if (!result.depthUm.every((centre, index) => Number.isFinite(centre) && centre > edges[index] && centre < edges[index + 1])) {
    return invalid("cell centres must be finite and lie inside their depth cells.");
  }
  if (!result.radiusUm.every((radius, index) => Number.isFinite(radius) && (index === 0 || radius > result.radiusUm[index - 1]))) {
    return invalid("radial coordinates must be finite and strictly increasing.");
  }
  if (!result.peakTemperatureMapC.every((row) => row.length === radiusCount)
    || !result.finalTemperatureMapC.every((row) => row.length === radiusCount)
    || result.peakTemperatureMapC.length !== depthCount
    || result.finalTemperatureMapC.length !== depthCount) {
    return invalid("temperature maps must match the depth and radial coordinates.");
  }
  const filmStart = config.substrateCells;
  if (!Number.isInteger(filmStart) || filmStart < 1 || filmStart >= depthCount || config.filmCells !== depthCount - filmStart) {
    return invalid("the configured substrate/film cell boundary does not match the result.");
  }
  const boundary = edges[filmStart];
  const boundaryTolerance = 1e-9 * Math.max(1, Math.abs(edges[0]), Math.abs(edges.at(-1) ?? 0));
  if (!Number.isFinite(boundary) || Math.abs(boundary) > boundaryTolerance) {
    return invalid("the substrate/film boundary must be at z = 0.");
  }
  const filmThicknessUm = config.filmThicknessNm / 1000;
  const resultFilmThicknessUm = edges.at(-1)! - boundary;
  if (!Number.isFinite(filmThicknessUm) || filmThicknessUm <= 0
    || Math.abs(resultFilmThicknessUm - filmThicknessUm) > 1e-9 * Math.max(1, filmThicknessUm)) {
    return invalid("the configured film thickness does not match the depth coordinates.");
  }
  if (!Number.isFinite(config.substrateConductivityWMK) || config.substrateConductivityWMK <= 0
    || !Number.isFinite(config.filmConductivityWMK) || config.filmConductivityWMK <= 0) {
    return invalid("film and substrate conductivities must be positive.");
  }
  return { widthsUm: edges.slice(1).map((edge, index) => edge - edges[index]), filmStart };
}

function weightedMean(values: readonly number[], widths: readonly number[], start: number): number {
  let weightedSum = 0;
  let totalWidth = 0;
  for (let index = start; index < values.length; index += 1) {
    const width = widths[index];
    const value = values[index];
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(value)) continue;
    weightedSum += value * width;
    totalWidth += width;
  }
  return totalWidth > 0 ? weightedSum / totalWidth : Number.NaN;
}

function interfaceTemperature(
  values: readonly number[],
  widthsUm: readonly number[],
  filmStart: number,
  substrateConductivityWMK: number,
  filmConductivityWMK: number,
): number {
  const substrateResistance = (widthsUm[filmStart - 1] / 2) / substrateConductivityWMK;
  const filmResistance = (widthsUm[filmStart] / 2) / filmConductivityWMK;
  return (filmResistance * values[filmStart - 1] + substrateResistance * values[filmStart])
    / (substrateResistance + filmResistance);
}

/** Builds the selected-radial-cell profile from the peak and final result maps. */
export function buildDepthProfile(result: OptothermalResult, config: OptothermalConfig, radiusIndex: number): DepthProfile {
  const depthCount = result.depthUm.length;
  const { widthsUm, filmStart } = validatedGeometry(result, config);
  const selectedRadiusIndex = clampIndex(radiusIndex, result.radiusUm.length);
  const depthUm = result.depthUm.slice(0, depthCount);
  const peakTemperatureC = depthUm.map((_, index) => result.peakTemperatureMapC[index]?.[selectedRadiusIndex] ?? Number.NaN);
  const finalTemperatureC = depthUm.map((_, index) => result.finalTemperatureMapC[index]?.[selectedRadiusIndex] ?? Number.NaN);
  const lowerInterface = filmStart - 1;
  const upperInterface = filmStart;
  const surfaceIndex = Math.max(0, depthCount - 1);
  const filmThicknessUm = config.filmThicknessNm / 1000;
  const filmInterfaceRangeUm: [number, number] = [-Math.max(widthsUm[lowerInterface], filmThicknessUm) * 0.5, filmThicknessUm];

  return {
    radiusIndex: selectedRadiusIndex,
    radiusUm: result.radiusUm[selectedRadiusIndex] ?? Number.NaN,
    depthUm,
    peakTemperatureC,
    finalTemperatureC,
    filmInterfaceRangeUm,
    summary: {
      surface: {
        peakTemperatureC: peakTemperatureC[surfaceIndex] ?? Number.NaN,
        finalTemperatureC: finalTemperatureC[surfaceIndex] ?? Number.NaN,
      },
      filmWeightedMean: {
        meanOfLocalMaximaUpperBoundC: weightedMean(peakTemperatureC, widthsUm, filmStart),
        finalTemperatureC: weightedMean(finalTemperatureC, widthsUm, filmStart),
      },
      interfaceApproximation: {
        lowerDepthUm: depthUm[lowerInterface] ?? Number.NaN,
        upperDepthUm: depthUm[upperInterface] ?? Number.NaN,
        interfacePeakBoundC: interfaceTemperature(
          peakTemperatureC,
          widthsUm,
          filmStart,
          config.substrateConductivityWMK,
          config.filmConductivityWMK,
        ),
        finalTemperatureC: interfaceTemperature(
          finalTemperatureC,
          widthsUm,
          filmStart,
          config.substrateConductivityWMK,
          config.filmConductivityWMK,
        ),
      },
    },
  };
}
