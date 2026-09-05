import { Select, SelectItem } from "@carbon/react";
import { useMemo, useRef, useState } from "react";
import {
  SCIENTIFIC_PLOT_LINE_WIDTHS,
  ScientificPlotFrame,
} from "@jorpago2/scientific-ui";
import { usePlot } from "./Plots";
import { buildDepthProfile, type DepthProfile } from "../solver/depthProfiles";
import type { OptothermalConfig, OptothermalResult } from "../solver/types";

function formatValue(value: number, unit = ""): string {
  return Number.isFinite(value) ? `${Number(value.toPrecision(5)).toString()}${unit ? ` ${unit}` : ""}` : "—";
}

function ProfileSummary({ profile }: { profile: DepthProfile }) {
  const entries: Array<[string, string]> = [
    ["Selected radius", formatValue(profile.radiusUm, "µm")],
    ["Surface cell · local peak / final", `${formatValue(profile.summary.surface.peakTemperatureC, "°C")} / ${formatValue(profile.summary.surface.finalTemperatureC, "°C")}`],
    ["Film weighted mean · mean of local maxima (upper bound) / final", `${formatValue(profile.summary.filmWeightedMean.meanOfLocalMaximaUpperBoundC, "°C")} / ${formatValue(profile.summary.filmWeightedMean.finalTemperatureC, "°C")}`],
    ["Interface estimate · interface peak bound / final", `${formatValue(profile.summary.interfaceApproximation.interfacePeakBoundC, "°C")} / ${formatValue(profile.summary.interfaceApproximation.finalTemperatureC, "°C")}`],
  ];
  return <details className="plot-data-summary" open>
    <summary>Depth profile summary</summary>
    <dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </details>;
}

export function DepthProfiles({ result, config }: { result: OptothermalResult; config: OptothermalConfig }) {
  const [radiusIndex, setRadiusIndex] = useState(0);
  const [extent, setExtent] = useState<"film-interface" | "full">("film-interface");
  const ref = useRef<HTMLDivElement>(null);
  const profile = useMemo(() => buildDepthProfile(result, config, radiusIndex), [config, radiusIndex, result]);
  const selectedRadiusIndex = profile.radiusIndex;
  const radiusOptions = result.radiusUm.map((radius, index) => ({ radius, index }));
  const depthRange = extent === "film-interface"
    ? profile.filmInterfaceRangeUm
    : [profile.depthUm[0], profile.depthUm.at(-1)] as [number, number];

  usePlot(ref, [
    {
      type: "scatter",
      mode: "lines+markers",
      x: profile.depthUm,
      y: profile.peakTemperatureC,
      name: "Local peak per cell",
      line: { color: "#d55e00", width: SCIENTIFIC_PLOT_LINE_WIDTHS.primary },
      marker: { color: "#d55e00", size: 5 },
      hovertemplate: "z = %{x:.4f} µm<br>Local peak = %{y:.3f} °C<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines+markers",
      x: profile.depthUm,
      y: profile.finalTemperatureC,
      name: "Final snapshot",
      line: { color: "#0072b2", width: SCIENTIFIC_PLOT_LINE_WIDTHS.secondary, dash: "dash" },
      marker: { color: "#0072b2", size: 5 },
      hovertemplate: "z = %{x:.4f} µm<br>Final = %{y:.3f} °C<extra></extra>",
    },
  ], {
    margin: { l: 72, r: 24, t: 20, b: 56 },
    xaxis: {
      title: { text: "Depth z (µm)" },
      range: depthRange,
      zeroline: true,
      zerolinecolor: "#6f6f6f",
      zerolinewidth: 1,
    },
    yaxis: { title: { text: "Temperature (°C)" } },
    showlegend: false,
  }, [profile, extent]);

  return <ScientificPlotFrame
    title="Thermal depth profile"
    description="Temperature through the substrate and film at the selected radius."
    legend={[{ id: "peak", label: "Local peak per cell (envelope)", color: "#d55e00" }, { id: "final", label: "Final snapshot", color: "#0072b2", style: "dash" }]}
    status={<><ProfileSummary profile={profile} /><p>Local maxima can occur at different times. Their film mean and reconstructed interface value are upper bounds, not simultaneous peaks. Final values share the last sampled instant; the interface estimate uses the two half-cell thermal resistances.</p></>}
  >
    <div className="depth-profile-controls">
      <Select
        id="depth-profile-radius"
        labelText="Radius"
        helperText="Choose the radial cell used for the depth profile."
        value={String(selectedRadiusIndex)}
        onChange={(event) => setRadiusIndex(Number(event.target.value))}
        size="sm"
      >
        {radiusOptions.map(({ radius, index }) => <SelectItem key={index} value={index} text={`r = ${formatValue(radius, "µm")}`} />)}
      </Select>
      <Select
        id="depth-profile-extent"
        labelText="View extent"
        helperText="Start with the film and its interface neighbourhood, or show the full substrate."
        value={extent}
        onChange={(event) => setExtent(event.target.value as "film-interface" | "full")}
        size="sm"
      >
        <SelectItem value="film-interface" text="Film + interface" />
        <SelectItem value="full" text="Full depth" />
      </Select>
    </div>
    <div ref={ref} className="plot-surface scientific-plot-surface" role="group" aria-label={`Thermal depth profile at radius ${formatValue(profile.radiusUm, "µm")}`} />
  </ScientificPlotFrame>;
}
