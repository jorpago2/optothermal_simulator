import { useRef } from "react";
import { ScientificPlotFrame } from "@jorpago2/scientific-ui";
import type { StudyCase } from "../solver/studies";
import { usePlot } from "./Plots";

export type ComparisonMetric = "temperature" | "phase" | "absorptance";
const colors = ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#b08900", "#56b4e9"];
const metricLabels = { temperature: "Surface temperature (°C)", phase: "Metallic fraction", absorptance: "Absorptance" };

export function StudyPlot({ cases, metric }: { cases: StudyCase[]; metric: ComparisonMetric }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlot(ref, cases.map((entry, index) => ({
    type: "scatter", mode: "lines", name: entry.name, x: entry.result.timeNs,
    y: metric === "temperature" ? entry.result.centerTemperatureC : metric === "phase" ? entry.result.centerMetallicFraction : entry.result.centerAbsorptance,
    line: { color: colors[index % colors.length], width: 2, dash: index % 2 ? "dash" : "solid" },
    hovertemplate: "t = %{x:.4g} ns<br>Value = %{y:.5g}<extra>%{fullData.name}</extra>",
  })), {
    margin: { l: 66, r: 24, t: 20, b: 56 }, showlegend: false,
    xaxis: { title: { text: "Time (ns)" } }, yaxis: { title: { text: metricLabels[metric] }, ...(metric !== "temperature" ? { range: [0, 1] } : {}) },
  }, [cases, metric]);
  return <ScientificPlotFrame title="Case comparison" description="Centre traces at each case’s own time samples. Pulse centres occur at three pulse FWHM."
    legend={cases.map((entry, index) => ({ id: entry.id, label: entry.name, color: colors[index % colors.length] }))}>
    <div ref={ref} className="plot-surface scientific-plot-surface" role="group" aria-label="Compared simulation curves" />
  </ScientificPlotFrame>;
}

export function SweepPlot({ cases, field, label }: { cases: StudyCase[]; field: keyof StudyCase["config"]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlot(ref, [{
    type: "scatter", mode: "lines+markers", x: cases.map((entry) => entry.config[field]),
    y: cases.map((entry) => entry.result.metrics.maximumTemperatureC),
    line: { color: colors[0], width: 2 }, name: "Peak surface temperature",
  }], { margin: { l: 66, r: 24, t: 20, b: 56 }, showlegend: false,
    xaxis: { title: { text: label } }, yaxis: { title: { text: "Peak temperature (°C)" } },
  }, [cases, field, label]);
  return <ScientificPlotFrame title="Parameter response" description="Completed sweep points; inspect the table for phase transition and energy.">
    <div ref={ref} className="plot-surface scientific-plot-surface" role="group" aria-label="Sweep peak temperature" />
  </ScientificPlotFrame>;
}
