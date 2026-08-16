import { useEffect, useRef } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import {
  SCIENTIFIC_PLOT_LINE_WIDTHS,
  ScientificPlotFrame,
  createScientificPlotlyConfig,
  createScientificPlotlyLayout,
  prepareScientificPlotlyToolbar,
  useScientificPlotTheme,
} from "@jorpago2/scientific-ui";
import type { OptothermalResult } from "../solver/types";

const plotConfig = createScientificPlotlyConfig({
  filename: "optothermal-result",
  scrollZoom: false,
  removeButtons: ["zoomIn2d", "zoomOut2d", "autoScale2d"],
}) as Partial<Plotly.Config>;

function usePlot(
  ref: React.RefObject<HTMLDivElement | null>,
  data: Plotly.Data[],
  layout: Partial<Plotly.Layout>,
  dependencies: readonly unknown[],
) {
  const theme = useScientificPlotTheme();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let disposed = false;
    const themedLayout = createScientificPlotlyLayout({
      theme,
      hovermode: "closest",
      overrides: layout as Record<string, unknown>,
    }) as Partial<Plotly.Layout>;
    const resize = () => {
      if (!disposed && element.clientWidth > 0) void Plotly.Plots.resize(element);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(element);
    void Plotly.react(element, data, { ...themedLayout, autosize: true }, plotConfig).then((plot) => {
      if (disposed) return;
      prepareScientificPlotlyToolbar(plot);
      requestAnimationFrame(resize);
    });
    return () => {
      disposed = true;
      resizeObserver.disconnect();
      Plotly.purge(element);
    };
    // The caller supplies the scientific data dependencies; theme is tracked here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ...dependencies]);
}

export function TemperatureTransientPlot({ result }: { result: OptothermalResult }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlot(ref, [{
    type: "scatter",
    mode: "lines",
    x: result.timeNs,
    y: result.centerTemperatureC,
    name: "Center temperature",
    line: { color: "#d55e00", width: SCIENTIFIC_PLOT_LINE_WIDTHS.primary },
    hovertemplate: "t = %{x:.3f} ns<br>T = %{y:.3f} °C<extra></extra>",
  }], {
    margin: { l: 64, r: 24, t: 20, b: 56 },
    xaxis: { title: { text: "Time (ns)" } },
    yaxis: { title: { text: "Center temperature (°C)" } },
    showlegend: false,
  }, [result]);
  return <ScientificPlotFrame title="Center temperature" description="Film temperature at r = 0." status={`${result.timeNs.length} temporal samples`}><div ref={ref} className="plot-surface scientific-plot-surface" role="group" aria-label="Center film temperature versus time" /></ScientificPlotFrame>;
}

export function PhaseTransientPlot({ result }: { result: OptothermalResult }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlot(ref, [
    {
      type: "scatter", mode: "lines", x: result.timeNs, y: result.centerMetallicFraction,
      name: "Metallic fraction", line: { color: "#0072b2", width: SCIENTIFIC_PLOT_LINE_WIDTHS.primary },
      hovertemplate: "t = %{x:.3f} ns<br>fₘ = %{y:.4f}<extra></extra>",
    },
    {
      type: "scatter", mode: "lines", x: result.timeNs, y: result.centerAbsorptance,
      name: "Absorptance", yaxis: "y2", line: { color: "#009e73", width: SCIENTIFIC_PLOT_LINE_WIDTHS.secondary, dash: "dash" },
      hovertemplate: "t = %{x:.3f} ns<br>A = %{y:.4f}<extra></extra>",
    },
  ], {
    margin: { l: 64, r: 64, t: 20, b: 56 },
    legend: { orientation: "h", x: 0, y: 1.16 },
    xaxis: { title: { text: "Time (ns)" } },
    yaxis: { title: { text: "Metallic fraction" }, range: [0, 1] },
    yaxis2: { title: { text: "Absorptance" }, overlaying: "y", side: "right", range: [0, 1] },
    showlegend: false,
  }, [result]);
  return <ScientificPlotFrame title="Material response" description="Thermal VO₂ state and corresponding thin-film absorptance." legend={[{ id: "phase", label: "Metallic fraction", color: "#0072b2" }, { id: "absorption", label: "Absorptance", color: "#009e73" }]}><div ref={ref} className="plot-surface scientific-plot-surface" role="group" aria-label="VO2 metallic fraction and absorptance versus time" /></ScientificPlotFrame>;
}

export function RadialTemperaturePlot({ result }: { result: OptothermalResult }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlot(ref, [
    {
      type: "scatter", mode: "lines", x: result.radiusUm, y: result.peakSurfaceTemperatureC,
      name: "Peak", line: { color: "#d55e00", width: SCIENTIFIC_PLOT_LINE_WIDTHS.primary },
      hovertemplate: "r = %{x:.3f} µm<br>Peak T = %{y:.3f} °C<extra></extra>",
    },
    {
      type: "scatter", mode: "lines", x: result.radiusUm, y: result.finalSurfaceTemperatureC,
      name: "Final", line: { color: "#0072b2", width: SCIENTIFIC_PLOT_LINE_WIDTHS.secondary, dash: "dash" },
      hovertemplate: "r = %{x:.3f} µm<br>Final T = %{y:.3f} °C<extra></extra>",
    },
  ], {
    margin: { l: 64, r: 24, t: 20, b: 56 },
    legend: { orientation: "h", x: 0, y: 1.16 },
    xaxis: { title: { text: "Radius (µm)" } },
    yaxis: { title: { text: "Film temperature (°C)" } },
    showlegend: false,
  }, [result]);
  return <ScientificPlotFrame title="Radial film profile" description="Peak and final surface temperature across the axisymmetric domain." legend={[{ id: "peak", label: "Peak", color: "#d55e00" }, { id: "final", label: "Final", color: "#0072b2" }]}><div ref={ref} className="plot-surface scientific-plot-surface" role="group" aria-label="Radial peak and final VO2 film temperature" /></ScientificPlotFrame>;
}

export function TemperatureMapPlot({ result, view }: { result: OptothermalResult; view: "peak" | "final" }) {
  const ref = useRef<HTMLDivElement>(null);
  const values = view === "peak" ? result.peakTemperatureMapC : result.finalTemperatureMapC;
  const visibleDepthUm = Math.min(4, Math.abs(result.depthUm[0] ?? 0));
  const surfaceUm = result.depthUm.at(-1) ?? 0;
  usePlot(ref, [{
    type: "heatmap",
    x: result.radiusUm,
    y: result.depthUm,
    z: values,
    colorscale: "Inferno",
    colorbar: { title: { text: "T (°C)", side: "right" }, thickness: 12 },
    hovertemplate: "r = %{x:.3f} µm<br>z = %{y:.3f} µm<br>T = %{z:.3f} °C<extra></extra>",
  }], {
    margin: { l: 72, r: 68, t: 20, b: 56 },
    xaxis: { title: { text: "Radius (µm)" } },
    yaxis: { title: { text: "Depth z (µm)" }, range: [-visibleDepthUm, surfaceUm] },
    showlegend: false,
  }, [result, view]);
  return <ScientificPlotFrame title={`${view === "peak" ? "Peak" : "Final"} near-surface temperature`} description="Axisymmetric field near the film–substrate interface at z = 0." status={`Top ${visibleDepthUm.toPrecision(2)} µm of the substrate`}><div ref={ref} className="plot-surface plot-surface--map scientific-plot-surface" role="group" aria-label={`${view} near-surface axisymmetric temperature map`} /></ScientificPlotFrame>;
}
