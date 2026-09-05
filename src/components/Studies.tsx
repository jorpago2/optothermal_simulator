import { Button, Checkbox, InlineNotification, Select, SelectItem, TextInput } from "@carbon/react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ResultSwitcher, ScientificStageHeader } from "@jorpago2/scientific-ui";
import { buildConvergencePlan, buildSweepPlan, changedParameters, compareResults, thermalTransitionDuration, type StudyCase, type StudyPlanCase } from "../solver/studies";
import { loadCases, saveCases } from "../solver/caseStorage";
import { cancelActiveSimulation, runSimulation } from "../solver/workerClient";
import { validateConfig } from "../solver/validation";
import type { OptothermalConfig, OptothermalResult } from "../solver/types";
import type { ComparisonMetric } from "./StudyPlot";
import { downloadJsonFile as downloadStudy } from "../download";

const StudyPlot = lazy(() => import("./StudyPlot").then((module) => ({ default: module.StudyPlot })));
const SweepPlot = lazy(() => import("./StudyPlot").then((module) => ({ default: module.SweepPlot })));
type Mode = "compare" | "convergence" | "sweep";
type SweepField = "peakIntensityGwCm2" | "pulseFwhmNs" | "filmThicknessNm";
interface StudyBatch { kind: "convergence" | "sweep"; config: OptothermalConfig; plan: StudyPlanCase[]; field: SweepField; tolerance: number; cases: StudyCase[]; state: "running" | "completed" | "cancelled" | "failed" }
const sweepLabels: Record<SweepField, string> = { peakIntensityGwCm2: "Peak intensity (GW/cm²)", pulseFwhmNs: "Pulse FWHM (ns)", filmThicknessNm: "VO₂ thickness (nm)" };
const number = (value: number) => Number.isFinite(value) ? Number(value.toPrecision(5)).toString() : "—";
const sameConfig = (a: OptothermalConfig, b: OptothermalConfig) => JSON.stringify(a) === JSON.stringify(b);

export interface ConvergenceEvidence {
  config: OptothermalConfig;
  tolerancePercent: number;
  comparisons: Array<{ name: string; comparison: ReturnType<typeof compareResults> }>;
  skipped: string[];
  complete: boolean;
}

interface Props {
  config: OptothermalConfig;
  result?: OptothermalResult;
  lastRunConfig?: OptothermalConfig;
  blocked: boolean;
  simulationBusy: boolean;
  resultStale: boolean;
  stopRef: RefObject<(() => void) | null>;
  onBusyChange: (busy: boolean) => void;
  onConvergence: (evidence: ConvergenceEvidence) => void;
  onLoadConfiguration: (config: OptothermalConfig) => void;
}

export function Studies({ config, result, lastRunConfig, blocked, simulationBusy, resultStale, stopRef, onBusyChange, onConvergence, onLoadConfiguration }: Props) {
  const [initial] = useState(() => loadCases());
  const [library, setLibrary] = useState<StudyCase[]>(initial.cases);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [mode, setMode] = useState<Mode>("compare");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(initial.cases.slice(0, 6).map((entry) => entry.id));
  const [referenceId, setReferenceId] = useState(initial.cases[0]?.id ?? "");
  const [metric, setMetric] = useState<ComparisonMetric>("temperature");
  const [sweepField, setSweepField] = useState<SweepField>("peakIntensityGwCm2");
  const [start, setStart] = useState("0.001");
  const [end, setEnd] = useState("0.02");
  const [count, setCount] = useState("5");
  const [tolerance, setTolerance] = useState("1");
  const [batches, setBatches] = useState<Partial<Record<"convergence" | "sweep", StudyBatch>>>({});
  const batch = mode === "compare" ? undefined : batches[mode];
  const setBatch = (value: StudyBatch) => setBatches((current) => ({ ...current, [value.kind]: value }));
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const batchActive = useRef(false);
  const busy = Object.values(batches).some((entry) => entry.state === "running");
  const locked = busy || simulationBusy;
  const activeCases = useMemo(() => library.filter((entry) => selected.includes(entry.id)), [library, selected]);
  const reference = activeCases.find((entry) => entry.id === referenceId) ?? activeCases[0];
  const toleranceValue = Number(tolerance);
  const validTolerance = tolerance.trim() !== "" && Number.isFinite(toleranceValue) && toleranceValue > 0 && toleranceValue <= 20;
  const preview = useMemo(() => {
    try {
      if (mode === "compare") return { plan: [] as StudyPlanCase[], error: "" };
      if (blocked) throw new Error("Correct configuration inputs before starting a study.");
      if (mode === "convergence" && !validTolerance) throw new Error("Tolerance must be greater than 0 and at most 20%. Phase uses the same number of percentage points.");
      if (mode === "sweep" && [start, end, count].some((value) => value.trim() === "")) throw new Error("Complete the sweep range and number of points.");
      return { plan: mode === "convergence" ? buildConvergencePlan(config) : buildSweepPlan(config, sweepField, Number(start), Number(end), Number(count)), error: "" };
    } catch (cause) { return { plan: [] as StudyPlanCase[], error: cause instanceof Error ? cause.message : String(cause) }; }
  }, [config, blocked, mode, sweepField, start, end, count, validTolerance]);

  useEffect(() => () => { if (batchActive.current) { batchActive.current = false; cancelActiveSimulation(); } }, []);
  useEffect(() => {
    stopRef.current = () => { batchActive.current = false; cancelActiveSimulation(); };
    return () => { stopRef.current = null; };
  }, [stopRef]);

  const persist = (next: StudyCase[]) => {
    setLibrary(next);
    try { saveCases(next); setStorageWarning(""); return true; }
    catch (cause) { setStorageWarning(`${cause instanceof Error ? cause.message : String(cause)} Cases remain available in this tab. Export them before closing.`); return false; }
  };
  const addCase = (entry: StudyCase) => {
    if (library.length >= 8) { setError("The library holds up to 8 cases. Export and remove a case before saving another."); return; }
    const saved = persist([...library, entry]);
    setSelected((current) => [...current, entry.id].slice(0, 6));
    if (!referenceId) setReferenceId(entry.id);
    setReceipt(saved ? `Saved “${entry.name}” to this browser.` : `Added “${entry.name}” to this tab only. Export to retain it.`);
    setError("");
  };
  const saveCurrent = () => {
    if (!result || !lastRunConfig || !name.trim() || locked || blocked || resultStale || !sameConfig(config, lastRunConfig)) return;
    addCase({ id: crypto.randomUUID(), name: name.trim(), config: { ...lastRunConfig }, result });
    setName("");
  };
  const stop = () => { batchActive.current = false; cancelActiveSimulation(); };
  const runBatch = async () => {
    if (locked || preview.error || !preview.plan.length || mode === "compare" || batchActive.current) return;
    const plan = preview.plan.map((entry) => ({ ...entry, config: { ...entry.config } }));
    const snapshot = { kind: mode, config: { ...config }, plan, field: sweepField, tolerance: toleranceValue, cases: [] as StudyCase[], state: "running" as const };
    batchActive.current = true;
    setBatch(snapshot);
    setError("");
    setReceipt("");
    onBusyChange(true);
    const completed: StudyCase[] = [];
    const reportConvergence = (complete: boolean) => {
      if (snapshot.kind !== "convergence" || !completed.length) return;
      onConvergence({ config: snapshot.config, tolerancePercent: snapshot.tolerance,
        comparisons: completed.slice(1).map((entry) => ({ name: entry.name, comparison: compareResults(completed[0], entry, {
          temperatureRiseRelative: snapshot.tolerance / 100, metallicFractionAbsolute: snapshot.tolerance / 100, energyRelative: snapshot.tolerance / 100,
        }) })), skipped: plan.filter((entry) => entry.skippedReason).map((entry) => `${entry.name}: ${entry.skippedReason}`), complete });
    };
    try {
      for (const entry of plan.filter((item) => !item.skippedReason)) {
        if (!batchActive.current) break;
        const output = await runSimulation(entry.config);
        if (!batchActive.current) break;
        completed.push({ id: entry.id, name: entry.name, config: entry.config, result: output });
        setBatch({ ...snapshot, cases: [...completed] });
      }
      const state = batchActive.current ? "completed" : "cancelled";
      setBatch({ ...snapshot, cases: completed, state });
      reportConvergence(state === "completed");
    } catch (cause) {
      const cancelled = !batchActive.current || cause instanceof DOMException && cause.name === "AbortError";
      setBatch({ ...snapshot, cases: completed, state: cancelled ? "cancelled" : "failed" });
      reportConvergence(false);
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { batchActive.current = false; onBusyChange(false); }
  };
  const exportCases = () => {
    downloadStudy({ schema: "optothermal-simulator/cases@1", model: "axisymmetric-rz-local-tmm-thermal@0.3", cases: library, interpretation: "Provisional; case-specific resolution and physical validation remain necessary." }, "optothermal-cases.json");
    setReceipt("Exported optothermal-cases.json to browser downloads.");
  };

  return <div className="studies-workspace">
    <ScientificStageHeader title="Studies" titleId="studies-title" description="Keep cases, compare responses and test numerical sensitivity before interpreting a result." />
    <ResultSwitcher label="Study type" activeId={mode} onChange={(id) => { if (!busy) setMode(id as Mode); }} options={[
      { id: "compare", label: "Compare", disabled: busy && mode !== "compare" }, { id: "convergence", label: "Refine", disabled: busy && mode !== "convergence" }, { id: "sweep", label: "Sweep", disabled: busy && mode !== "sweep" },
    ]} />
    {storageWarning && <InlineNotification kind="warning" title="Local storage" subtitle={storageWarning} lowContrast hideCloseButton />}
    {error && <InlineNotification kind="error" title="Study could not finish" subtitle={error} lowContrast hideCloseButton />}
    {receipt && <p className="study-receipt" role="status">{receipt}</p>}
    {mode === "compare" ? <>
      <section className="study-card" aria-labelledby="case-library-title">
        <h3 id="case-library-title">Case library <span>{library.length} / 8</span></h3>
        <p>Save the current completed result. Cases are stored in this browser; export a copy for safekeeping. Select up to six curves.</p>
        <div className="study-form">
          <TextInput id="case-name" labelText="Case name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Reference · 150 nm" />
          <Button disabled={!result || !lastRunConfig || !sameConfig(config, lastRunConfig) || resultStale || blocked || locked || !name.trim() || library.length >= 8} onClick={saveCurrent}>Save current case</Button>
          <Button kind="tertiary" disabled={!library.length} onClick={exportCases}>Export cases</Button>
        </div>
        {(!result || resultStale) && <p>Run the current configuration in Results before saving it.</p>}
        <div className="case-list">{library.map((entry) => <div key={entry.id} className="case-list__row">
          <div className="case-selection"><Checkbox id={`select-${entry.id}`} labelText={entry.name} checked={selected.includes(entry.id)} disabled={!selected.includes(entry.id) && selected.length >= 6}
            onChange={(_, { checked }) => setSelected((current) => checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} /></div>
          <span>{number(entry.result.metrics.maximumTemperatureC)} °C</span>
          <Button kind="ghost" size="sm" disabled={locked} onClick={() => onLoadConfiguration({ ...entry.config })} aria-label={`Load configuration ${entry.name}`}>Load inputs</Button>
          <Button kind="ghost" size="sm" onClick={() => { persist(library.filter((item) => item.id !== entry.id)); setSelected(selected.filter((id) => id !== entry.id)); }} aria-label={`Remove case ${entry.name}`}>Remove</Button>
        </div>)}</div>
      </section>
      {activeCases.length > 0 && reference && <>
        <div className="study-form study-card">
          <Select id="comparison-reference" labelText="Reference case" value={reference.id} onChange={(event) => setReferenceId(event.target.value)}>{activeCases.map((entry) => <SelectItem key={entry.id} value={entry.id} text={entry.name} />)}</Select>
          <Select id="comparison-metric" labelText="Compare curves" value={metric} onChange={(event) => setMetric(event.target.value as ComparisonMetric)}>
            <SelectItem value="temperature" text="Surface temperature" /><SelectItem value="phase" text="Metallic fraction" /><SelectItem value="absorptance" text="Absorptance" />
          </Select>
        </div>
        <Suspense fallback={<p role="status">Loading comparison…</p>}><StudyPlot cases={activeCases} metric={metric} /></Suspense>
        <MetricsTable cases={activeCases} reference={reference} />
        <section className="study-card"><h3>Parameters changed from {reference.name}</h3>{activeCases.filter((entry) => entry.id !== reference.id).map((entry) => <div key={entry.id} className="case-differences"><h4>{entry.name}</h4><ul>{changedParameters(reference.config, entry.config).map((change) => <li key={change.field}>{change.label}: {number(change.before)} → {number(change.after)} {change.unit}</li>)}</ul>{!changedParameters(reference.config, entry.config).length && <p>Identical inputs.</p>}</div>)}</section>
      </>}
    </> : <>
      <section className="study-card" aria-labelledby="study-plan-title">
        <h3 id="study-plan-title">{mode === "convergence" ? "Independent refinement" : "Sweep setup"}</h3>
        <p>{mode === "convergence" ? "Run the current configuration, then refine radius, film, substrate and time separately. Each pair tests sensitivity; it does not prove asymptotic convergence." : "Vary one parameter over equally spaced values. All other inputs, including the simulated window, remain fixed. Every point is validated before starting."}</p>
        <div className="study-form">
          {mode === "sweep" ? <>
            <Select id="sweep-field" labelText="Sweep parameter" value={sweepField} disabled={locked} onChange={(event) => { const field = event.target.value as SweepField; setSweepField(field); setStart(number(config[field] * 0.5)); setEnd(number(config[field] * 1.5)); }}>
              {Object.entries(sweepLabels).map(([value, label]) => <SelectItem key={value} value={value} text={label} />)}
            </Select>
            <TextInput id="sweep-start" labelText="Start value" value={start} disabled={locked} onChange={(event) => setStart(event.target.value)} />
            <TextInput id="sweep-end" labelText="End value" value={end} disabled={locked} onChange={(event) => setEnd(event.target.value)} />
            <TextInput id="sweep-count" labelText="Sweep points (2–12)" value={count} disabled={locked} onChange={(event) => setCount(event.target.value)} />
          </> : <TextInput id="convergence-tolerance" labelText="Difference tolerance (%)" helperText="Temperature rise and energy: relative %. Metallic fraction: percentage points." value={tolerance} disabled={locked} invalid={!validTolerance} invalidText="Enter a value greater than 0 and at most 20." onChange={(event) => setTolerance(event.target.value)} />}
        </div>
        {preview.error ? <p role="alert" className="study-error">{preview.error}</p> : <ol className="study-plan">{preview.plan.map((entry) => <li key={entry.id}><strong>{entry.name}</strong>{entry.skippedReason ? ` · ${entry.skippedReason}` : !entry.field ? ` · ${entry.config.radialCells} × ${entry.config.substrateCells + entry.config.filmCells} cells; ${entry.config.timeSteps} time samples` : ""}{!entry.skippedReason && validateConfig(entry.config).some((issue) => issue.severity === "warning") ? " · resolution warnings" : ""}</li>)}</ol>}
        <div className="study-actions"><Button disabled={locked || Boolean(preview.error) || !preview.plan.length} onClick={() => { void runBatch(); }}>{mode === "convergence" ? "Run convergence study" : "Run parameter sweep"}</Button>{busy && <Button kind="danger--tertiary" onClick={stop}>Cancel study</Button>}</div>
      </section>
      {batch && <section className="study-card" aria-labelledby="study-results-title">
        <h3 id="study-results-title">{batch.kind === "convergence" ? "Refinement results" : "Sweep results"}</h3>
        <p role="status">{batch.state === "running" ? "Running" : batch.state === "completed" ? "Completed" : batch.state === "cancelled" ? "Cancelled — partial results retained" : "Failed — partial results retained"} · {batch.cases.length} / {batch.plan.filter((entry) => !entry.skippedReason).length} runs</p>
        {busy && <progress aria-label="Study progress" value={batch.cases.length} max={batch.plan.filter((entry) => !entry.skippedReason).length} />}
        {!sameConfig(config, batch.config) && <p role="status">Configuration changed. These results belong to the study’s original inputs.</p>}
        {batch.cases.length > 0 && <>
          <MetricsTable cases={batch.cases} reference={batch.cases[0]} />
          {batch.kind === "convergence" ? <>
            <p>Criterion: {batch.tolerance}% relative temperature-rise / energy change and {batch.tolerance} percentage points in metallic fraction. Temperature uses a 1 K denominator floor; energy uses 10⁻¹⁸ J.</p>
            <ul className="study-plan">{batch.cases.slice(1).map((entry) => {
              const comparison = compareResults(batch.cases[0], entry, { temperatureRiseRelative: batch.tolerance / 100, metallicFractionAbsolute: batch.tolerance / 100, energyRelative: batch.tolerance / 100 });
              return <li key={entry.id}><strong>{entry.name}</strong> · {comparison.status === "within-tolerance" ? "Within selected tolerance" : "Further refinement needed"}</li>;
            })}{batch.plan.filter((entry) => entry.skippedReason).map((entry) => <li key={entry.id}>{entry.name}: not checked — {entry.skippedReason}</li>)}</ul>
            <p>Agreement of these metrics does not validate every field value, the domain boundaries or the material model.</p>
          </> : <Suspense fallback={<p>Loading sweep plot…</p>}><SweepPlot cases={batch.cases} field={batch.field} label={sweepLabels[batch.field]} /></Suspense>}
          <div className="study-actions"><Button kind="tertiary" onClick={() => { downloadStudy({ schema: "optothermal-simulator/study@1", ...batch, interpretation: "Independent numerical sensitivity; not experimental or universal convergence validation." }, "optothermal-study.json"); setReceipt("Exported optothermal-study.json to browser downloads."); }}>Export study</Button></div>
          <details><summary>Keep a completed run in the case library</summary><div className="study-actions">{batch.cases.map((entry) => <Button key={entry.id} size="sm" kind="ghost" disabled={library.length >= 8} onClick={() => addCase({ ...entry, id: crypto.randomUUID(), name: `${batch.kind === "convergence" ? "Refinement" : "Sweep"} · ${entry.name}`.slice(0, 80) })}>Save {entry.name}</Button>)}</div></details>
        </>}
      </section>}
    </>}
  </div>;
}

function MetricsTable({ cases, reference }: { cases: StudyCase[]; reference: StudyCase }) {
  return <div className="study-table-scroll" role="region" aria-label="Simulation metrics" tabIndex={0}><table className="study-table">
    <caption>Completed runs · differences relative to {reference.name}</caption>
    <thead><tr><th scope="col">Case</th><th scope="col">Peak T (°C)</th><th scope="col">Δ rise (K)</th><th scope="col">|Δ rise| (%)</th><th scope="col">Max. metallic fraction</th><th scope="col">|Δ fraction| (pp)</th><th scope="col">Absorbed energy (nJ)</th><th scope="col">|Δ energy| (%)</th><th scope="col">Time ≥ 50% metallic (ns)</th></tr></thead>
    <tbody>{cases.map((entry) => { const change = compareResults(reference, entry); const transition = thermalTransitionDuration(entry.result); return <tr key={entry.id}>
      <th scope="row">{entry.name}</th><td>{number(entry.result.metrics.maximumTemperatureC)}</td><td>{number(change.temperatureRiseDeltaK)}</td><td>{number(change.temperatureRiseRelative * 100)}</td><td>{number(entry.result.metrics.maximumMetallicFraction)}</td><td>{number(change.metallicFractionAbsoluteDelta * 100)}</td><td>{number(entry.result.metrics.absorbedEnergyJ * 1e9)}</td><td>{number(change.energyRelative * 100)}</td><td>{transition.durationNs === null ? "No transition" : number(transition.durationNs)}{transition.endsMetallic ? " (still metallic at end)" : ""}{transition.startsMetallic ? " (metallic at start)" : ""}</td>
    </tr>; })}</tbody>
  </table></div>;
}
