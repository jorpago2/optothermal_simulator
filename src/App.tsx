import { Button, Column, Grid, InlineNotification } from "@carbon/react";
import {
  ChartLine,
  CheckmarkOutline,
  DocumentExport,
  Play,
  Restart,
  SettingsAdjust,
  TemperatureHot,
} from "@carbon/react/icons";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExportReceipt,
  ResultSwitcher,
  ScientificAppShell,
  ScientificEmptyState,
  ScientificHeader,
  ScientificModelScope,
  ScientificOutcomeSummary,
  ScientificPreflightSummary,
  ScientificReproducibilityManifest,
  ScientificResultsLayout,
  ScientificResultsToolbar,
  ScientificRunControl,
  ScientificStatusBar,
  ScientificStageHeader,
  ScientificToolRail,
  ScientificValidationSummary,
  useScientificFormValidity,
  useScientificResultTransition,
  type ScientificActionDescriptor,
  type ScientificCheckDescriptor,
  type ScientificStatusDescriptor,
  type WorkflowItem,
} from "@jorpago2/scientific-ui";
import { ConfigurationPanel } from "./components/ConfigurationPanel";
import { ExperimentOverview } from "./components/ExperimentOverview";
import { VO2_REFERENCE_CONFIG } from "./solver/defaults";
import { cancelActiveSimulation, runSimulation } from "./solver/workerClient";
import type { OptothermalConfig, OptothermalResult } from "./solver/types";
import { validateConfig, validateResult } from "./solver/validation";

type AppView = "configure" | "results" | "validation";
type MapView = "peak" | "final";

const loadPlots = () => import("./components/Plots");
const TemperatureTransientPlot = lazy(() => loadPlots().then((module) => ({ default: module.TemperatureTransientPlot })));
const PhaseTransientPlot = lazy(() => loadPlots().then((module) => ({ default: module.PhaseTransientPlot })));
const RadialTemperaturePlot = lazy(() => loadPlots().then((module) => ({ default: module.RadialTemperaturePlot })));
const TemperatureMapPlot = lazy(() => loadPlots().then((module) => ({ default: module.TemperatureMapPlot })));

const workflow: WorkflowItem[] = [
  { id: "configure", label: "Configure", controlsId: "configuration-panel", icon: <SettingsAdjust size={20} /> },
  { id: "results", label: "Results", controlsId: "results-view", icon: <ChartLine size={20} /> },
  { id: "validation", label: "Validation", controlsId: "validation-view", icon: <CheckmarkOutline size={20} /> },
];

function cloneReferenceConfig(): OptothermalConfig {
  return { ...VO2_REFERENCE_CONFIG };
}

function downloadJson(config: OptothermalConfig, result: OptothermalResult) {
  const content = JSON.stringify({
    schema: "optothermal-simulator/result@1",
    generatedAt: new Date().toISOString(),
    model: "axisymmetric-rz-local-tmm-thermal@0.1",
    config,
    result,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "optothermal-vo2-result.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>("configure");
  const [config, setConfig] = useState<OptothermalConfig>(cloneReferenceConfig);
  const [lastRunConfig, setLastRunConfig] = useState<OptothermalConfig>();
  const [result, setResult] = useState<OptothermalResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runtimeMs, setRuntimeMs] = useState<number>();
  const [mapView, setMapView] = useState<MapView>("peak");
  const [exported, setExported] = useState(false);
  const outcomeRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const {
    hasInvalidFields,
    isValid: draftsAreValid,
    reportFieldValidity,
    resetValidity,
    revision: fieldRevision,
  } = useScientificFormValidity();
  const issues = useMemo(() => validateConfig(config), [config]);
  const hasErrors = issues.some((issue) => issue.severity === "error");
  const runBlocked = hasErrors || hasInvalidFields;
  const modified = Boolean(result && lastRunConfig && JSON.stringify(config) !== JSON.stringify(lastRunConfig));

  const status: ScientificStatusDescriptor = busy
    ? { state: "running", label: "Simulation running", detail: "Rust/WASM axisymmetric solve" }
    : error
      ? { state: "failed", label: "Simulation failed", detail: error }
      : modified
        ? { state: "modified", label: "Inputs modified", detail: "Run again to update the results." }
        : result
          ? { state: "up-to-date", label: "Results up to date", detail: "Fixed axial position" }
          : runBlocked
            ? { state: "needs-input", label: "Review inputs" }
            : { state: "ready", label: "Ready", detail: "VO₂ reference preset" };

  const run = useCallback(async () => {
    if (!draftsAreValid() || validateConfig(config).some((issue) => issue.severity === "error")) {
      setActiveView("configure");
      return;
    }
    setBusy(true);
    setError("");
    setExported(false);
    setActiveView("results");
    const started = performance.now();
    try {
      const [next] = await Promise.all([runSimulation(config), loadPlots()]);
      setResult(next);
      setLastRunConfig({ ...config });
      setRuntimeMs(performance.now() - started);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [config, draftsAreValid]);

  useEffect(() => {
    stageRef.current?.closest(".scientific-workbench__stage")?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeView]);

  useScientificResultTransition({
    state: status.state,
    resultRef: outcomeRef,
    completionKey: runtimeMs,
    onReveal: () => setActiveView("results"),
  });

  const updateConfig = (field: keyof OptothermalConfig, value: number) => {
    setConfig((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const resetPreset = () => {
    resetValidity();
    setConfig(cloneReferenceConfig());
    setError("");
  };

  const stop = () => {
    cancelActiveSimulation();
    setBusy(false);
    setError("Simulation cancelled.");
  };

  const resultActions = useMemo<ScientificActionDescriptor[]>(() => result && lastRunConfig ? [
    {
      id: "export-result",
      label: "Export result",
      shortLabel: "Export",
      icon: DocumentExport,
      emphasis: "secondary",
      onClick: () => { downloadJson(lastRunConfig, result); setExported(true); },
    },
    {
      id: "rerun-model",
      label: "Run again",
      icon: Restart,
      emphasis: "ghost",
      onClick: () => { void run(); },
      disabled: busy || runBlocked,
    },
  ] : [], [busy, lastRunConfig, result, run, runBlocked]);

  const preflightChecks = useMemo<ScientificCheckDescriptor[]>(() => {
    const pointsPerFwhm = config.timeSteps * config.pulseFwhmNs / config.durationNs;
    const meshCells = config.radialCells * (config.substrateCells + 1);
    return [
      { id: "input", label: "Parameter ranges", state: runBlocked ? "failed" : "passed", detail: hasInvalidFields ? "A visible field contains an uncommitted invalid value." : hasErrors ? "Correct the blocking input messages." : "All required values are finite and within solver limits." },
      { id: "time", label: "Pulse resolution", state: pointsPerFwhm >= 16 ? "passed" : "warning", value: `${pointsPerFwhm.toFixed(1)} points/FWHM`, detail: "Implicit integration removes a stability restriction but not temporal discretization error." },
      { id: "radius", label: "Radial boundary", state: config.radiusUm >= 4 * config.waistUm ? "passed" : "warning", value: `${(config.radiusUm / config.waistUm).toFixed(1)} w₀`, detail: "A boundary at four beam waists limits interaction with the heated region." },
      { id: "mesh", label: "Browser mesh", state: meshCells <= 40_000 ? "passed" : "failed", value: `${meshCells.toLocaleString()} cells`, detail: "The hard limit bounds worker memory and interaction latency." },
    ];
  }, [config, hasErrors, hasInvalidFields, runBlocked]);

  const validationChecks = useMemo<ScientificCheckDescriptor[]>(() => {
    if (!result) return [
      { id: "not-run", label: "Simulation result", state: "not-run", detail: "Run the model before evaluating numerical checks." },
    ];
    const checks = validateResult(result);
    return [
      { id: "finite", label: "Finite solution", state: checks.finite ? "passed" : "failed", detail: "All temporal and spatial temperature samples must remain finite." },
      { id: "passive", label: "Optical passivity", state: checks.passive ? "passed" : "failed", value: `A = ${result.metrics.baselineAbsorptance.toFixed(4)}–${result.metrics.peakAbsorptance.toFixed(4)}`, detail: "The local TMM stack must satisfy 0 ≤ A ≤ 1." },
      { id: "energy", label: "Thermal energy bound", state: checks.energyBound ? "passed" : "failed", value: `${(100 * result.metrics.storedToAbsorbedRatio).toFixed(2)}% stored/absorbed`, detail: "Stored sensible heat cannot exceed integrated absorbed optical energy." },
      { id: "convergence", label: "Mesh convergence", state: "warning", detail: "A refinement comparison has not been run. Treat quantitative values as provisional." },
    ];
  }, [result]);

  const validationPassed = result ? validateResult(result) : undefined;
  const validationStatus: ScientificStatusDescriptor = !result
    ? { state: "needs-input", label: "Not evaluated" }
    : validationPassed && validationPassed.finite && validationPassed.passive && validationPassed.energyBound
      ? { state: "warning", label: "Core checks passed; convergence pending" }
      : { state: "failed", label: "Validation check failed" };

  const panelOpen = activeView === "configure";
  const navigationItems = workflow.map((item) => item.id === "results" && busy ? { ...item, status: "loading" as const, statusLabel: "Simulation running" } : item);

  return (
    <ScientificAppShell
      className="optothermal-app"
      panelOpen={panelOpen}
      header={(
        <ScientificHeader
          product="Optothermal Simulator"
          descriptor="Axisymmetric VO₂"
          productMark={<TemperatureHot size={24} aria-hidden="true" />}
          contextLabel="FIXED POSITION"
          context={`z = 0 · λ ${config.wavelengthUm} µm`}
          status={status}
          primaryAction={<ScientificRunControl execution={{ ...status, onRun: () => { void run(); }, onStop: stop, runLabel: "Run", stopLabel: "Stop", disabled: runBlocked, disabledReason: runBlocked ? "Review invalid inputs before running." : undefined }} size="sm" />}
          help={{
            summary: "Configure a single axial position, run the Rust/WASM r–z solver, then inspect temperature, phase state and validation evidence.",
            footer: "The reference material values are not a substitute for sample-specific calibration.",
          }}
        />
      )}
      navigation={<ScientificToolRail items={navigationItems} activeId={activeView} expandedId={panelOpen ? "configure" : null} collapsible onChange={(id) => setActiveView((id ?? (result ? "results" : "configure")) as AppView)} />}
      panel={(
        <div id="configuration-panel">
          <ConfigurationPanel
            config={config}
            issues={issues}
            busy={busy}
            onChange={updateConfig}
            onReset={resetPreset}
            onRun={() => { void run(); }}
            onClose={() => setActiveView(result ? "results" : "validation")}
            onFieldValidationChange={reportFieldValidity}
            fieldRevision={fieldRevision}
            hasInvalidDrafts={hasInvalidFields}
          />
        </div>
      )}
      statusBar={<ScientificStatusBar status={status} metadata={[`${config.radialCells} × ${config.substrateCells + 1} r–z cells · ${config.timeSteps} time samples · ${result ? result.engine : "Rust/WASM"}`]} />}
    >
      <div ref={stageRef} className="optothermal-stage">
        <h1 className="optothermal-visually-hidden">Optothermal Simulator</h1>
        {activeView === "results" && (
          <section id="results-view" aria-label="Simulation results">
            {error && <InlineNotification kind="error" title="Simulation failed" subtitle={error} lowContrast hideCloseButton />}
            {!result ? (
              <ScientificEmptyState
                title={busy ? "Solving the optothermal response" : "No result yet"}
                description={busy ? "The axisymmetric thermal solve is running in a background worker." : "Review the reference preset and run the fixed-position model."}
                icon={<TemperatureHot size={32} />}
                action={!busy ? <Button type="button" renderIcon={Play} onClick={() => setActiveView("configure")}>Open configuration</Button> : undefined}
              />
            ) : (
              <ScientificResultsLayout
                title="Fixed-position response"
                description="One Gaussian-beam position at z = 0; no axial sweep or detector propagation."
                actions={<ScientificResultsToolbar actions={resultActions} />}
              >
                <section ref={outcomeRef} tabIndex={-1}>
                  <ScientificOutcomeSummary
                    title="Optothermal pulse completed"
                    headingLevel={3}
                    status={modified ? { state: "modified", label: "Result is stale" } : { state: "up-to-date", label: "Current result" }}
                    summary={result.metrics.maximumMetallicFraction > 0.5 ? "The reference model predicts a substantial thermally driven metallic fraction at the beam centre." : "The reference model remains predominantly on the insulating branch during this pulse."}
                    metrics={[
                      { id: "temperature", label: "Peak center temperature", value: result.metrics.maximumTemperatureC, unit: "°C", format: { significantDigits: 5 } },
                      { id: "phase", label: "Maximum metallic fraction", value: result.metrics.maximumMetallicFraction, format: { significantDigits: 4 } },
                      { id: "absorption", label: "Peak absorptance", value: result.metrics.peakAbsorptance, format: { significantDigits: 4 } },
                      { id: "runtime", label: "Browser runtime", value: runtimeMs ? runtimeMs / 1000 : 0, unit: "s", format: { significantDigits: 3 } },
                    ]}
                  />
                </section>
                {exported && <ExportReceipt fileName="optothermal-vo2-result.json" format="JSON" destination="Browser downloads" onDismiss={() => setExported(false)} />}
                <Suspense fallback={<p className="plot-loading" role="status">Loading scientific plots…</p>}>
                  <Grid fullWidth narrow className="plot-grid">
                    <Column sm={4} md={8} lg={8} className="plot-column">
                      <TemperatureTransientPlot result={result} />
                      <RadialTemperaturePlot result={result} />
                    </Column>
                    <Column sm={4} md={8} lg={8} className="plot-column">
                      <PhaseTransientPlot result={result} />
                      <div className="map-result">
                        <ResultSwitcher options={[{ id: "peak", label: "Peak map" }, { id: "final", label: "Final map" }]} activeId={mapView} onChange={(id) => setMapView(id as MapView)} label="Temperature map" />
                        <TemperatureMapPlot result={result} view={mapView} />
                      </div>
                    </Column>
                  </Grid>
                </Suspense>
              </ScientificResultsLayout>
            )}
          </section>
        )}
        {activeView === "validation" && (
          <section id="validation-view" aria-labelledby="validation-title">
            <ScientificStageHeader
              title="Model and validation"
              titleId="validation-title"
              description="Separate numerical sanity checks from the convergence and sample calibration still required for quantitative use."
            />
            <Grid fullWidth narrow className="validation-grid">
              <Column sm={4} md={8} lg={8}>
                <ScientificPreflightSummary status={runBlocked ? { state: "failed", label: "Inputs blocked" } : issues.length ? { state: "warning", label: "Ready with warnings" } : { state: "ready", label: "Ready" }} checks={preflightChecks} />
              </Column>
              <Column sm={4} md={8} lg={8}>
                <ScientificValidationSummary status={validationStatus} checks={validationChecks} />
              </Column>
              <Column sm={4} md={8} lg={16}>
                <ScientificModelScope
                  model="Normal-incidence coherent thin-film TMM supplies local absorptance to an implicit axisymmetric r–z finite-volume heat solver. A hysteretic, relaxing metallic fraction interpolates the VO₂ optical constants."
                  assumptions={[
                    "Gaussian beam evaluated at a single fixed axial position.",
                    "Isotropic, temperature-independent thermal properties.",
                    "One optical film layer and a finite glass substrate with ambient outer boundaries.",
                  ]}
                  limits={[
                    "No Z-scan propagation or detector-plane observable is calculated.",
                    "No latent heat, temperature-dependent conductivity, stress or ablation.",
                    "Reference optical constants are not sample-specific ellipsometry.",
                    "Quantitative use requires temporal, radial and depth convergence studies.",
                  ]}
                  reference="Defaults migrated from paper_zscan/simulations/configs/materials/vo2_1064_reference.json."
                />
              </Column>
              {result && lastRunConfig && (
                <Column sm={4} md={8} lg={16}>
                  <ScientificReproducibilityManifest
                    status={modified ? { state: "modified", label: "Inputs changed after run" } : { state: "up-to-date", label: "Manifest current" }}
                    items={[
                      { id: "engine", label: "Engine", value: result.engine },
                      { id: "model", label: "Model", value: "axisymmetric-rz-local-tmm-thermal@0.1" },
                      { id: "mesh", label: "Mesh", value: `${lastRunConfig.radialCells} × ${lastRunConfig.substrateCells + 1} cells; ${lastRunConfig.timeSteps} time samples` },
                      { id: "timestep", label: "Time step", value: `${result.metrics.timeStepNs.toPrecision(5)} ns` },
                      { id: "iterations", label: "Mean implicit iterations", value: result.metrics.averageLinearIterations.toFixed(2) },
                    ]}
                  />
                </Column>
              )}
            </Grid>
          </section>
        )}
        {activeView === "configure" && (
          <section className="configuration-overview" aria-labelledby="configuration-overview-title">
            <ScientificStageHeader
              title="Run overview"
              titleId="configuration-overview-title"
            />
            <Grid fullWidth narrow className="configuration-overview-grid">
              <Column sm={4} md={8} lg={16}>
                <ExperimentOverview config={config} />
              </Column>
              <Column sm={4} md={8} lg={16}>
                <ScientificPreflightSummary
                  compact
                  title="Numerical checks"
                  status={runBlocked ? { state: "failed", label: "Inputs blocked" } : issues.length ? { state: "warning", label: "Ready with warnings" } : { state: "ready", label: "Ready" }}
                  checks={preflightChecks.map((check) => ({
                    ...check,
                    detail: undefined,
                    value: check.value ?? (check.state === "passed" ? "Within limits" : undefined),
                  }))}
                />
              </Column>
            </Grid>
          </section>
        )}
      </div>
    </ScientificAppShell>
  );
}
