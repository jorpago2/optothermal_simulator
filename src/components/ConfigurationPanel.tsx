import { Button } from "@carbon/react";
import {
  ScientificNumberField,
  ScientificPanelFooter,
  ScientificParameterSection,
  ScientificTaskPanel,
  ValidationSummary,
  type ValidationMessage,
  type ScientificFieldValidationReporter,
} from "@jorpago2/scientific-ui";
import type { OptothermalConfig, ValidationIssue } from "../solver/types";
import { getMeshDiagnostics } from "../solver/validation";

interface ConfigurationPanelProps {
  config: OptothermalConfig;
  issues: ValidationIssue[];
  busy: boolean;
  onChange: (field: keyof OptothermalConfig, value: number) => void;
  onReset: () => void;
  onClose: () => void;
  onFieldValidationChange: ScientificFieldValidationReporter;
  fieldRevision: number;
  hasInvalidDrafts: boolean;
}

interface FieldDefinition {
  key: keyof OptothermalConfig;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  helperText?: string;
}

const beamFields: FieldDefinition[] = [
  { key: "wavelengthUm", label: "Wavelength", unit: "µm", min: 0.2, max: 20 },
  { key: "waistUm", label: "Beam waist w₀", unit: "µm", min: 0.5, max: 500 },
  { key: "peakIntensityGwCm2", label: "Peak intensity", unit: "GW/cm²", min: 1e-12, max: 10 },
  { key: "pulseFwhmNs", label: "Pulse FWHM", unit: "ns", min: 0.001, max: 1000 },
  { key: "durationNs", label: "Simulated window", unit: "ns", min: 0.01, max: 1e6 },
];

const geometryFields: FieldDefinition[] = [
  { key: "filmThicknessNm", label: "VO₂ thickness", unit: "nm", min: 5, max: 5000 },
  { key: "substrateDepthUm", label: "Modelled substrate depth", unit: "µm", min: 0.1, max: 1000 },
  { key: "radiusUm", label: "Radial domain", unit: "µm", min: 2, max: 5000, helperText: "Use at least four beam waists." },
];

const opticalFields: FieldDefinition[] = [
  { key: "substrateIndex", label: "Substrate refractive index", min: 0.01, max: 20 },
  { key: "airIndex", label: "Surrounding refractive index", min: 0.01, max: 20 },
  { key: "insulatingN", label: "Insulating n", min: 0.01, max: 20 },
  { key: "insulatingK", label: "Insulating k", min: 1e-8, max: 20 },
  { key: "metallicN", label: "Metallic n", min: 0.01, max: 20 },
  { key: "metallicK", label: "Metallic k", min: 1e-8, max: 20 },
  { key: "transitionHeatingC", label: "Heating transition", unit: "°C", min: -50, max: 500 },
  { key: "transitionCoolingC", label: "Cooling transition", unit: "°C", min: -50, max: 500 },
  { key: "transitionWidthC", label: "Transition width", unit: "K", min: 0.05, max: 100 },
  { key: "phaseRelaxationNs", label: "Phase relaxation", unit: "ns", min: 0.001, max: 1e6 },
];

const thermalFields: FieldDefinition[] = [
  { key: "ambientC", label: "Ambient temperature", unit: "°C", min: -100, max: 500 },
  { key: "filmDensityKgM3", label: "VO₂ density", unit: "kg/m³", min: 1, max: 3e4 },
  { key: "filmHeatCapacityJKgK", label: "VO₂ heat capacity", unit: "J/(kg·K)", min: 1, max: 1e5 },
  { key: "filmConductivityWMK", label: "VO₂ conductivity", unit: "W/(m·K)", min: 0.001, max: 1e4 },
  { key: "substrateDensityKgM3", label: "Substrate density", unit: "kg/m³", min: 1, max: 3e4 },
  { key: "substrateHeatCapacityJKgK", label: "Substrate heat capacity", unit: "J/(kg·K)", min: 1, max: 1e5 },
  { key: "substrateConductivityWMK", label: "Substrate conductivity", unit: "W/(m·K)", min: 0.001, max: 1e4 },
  { key: "convectionWM2K", label: "Air-side convection", unit: "W/(m²·K)", min: 0, max: 1e5 },
];

const numericalFields: FieldDefinition[] = [
  { key: "radialCells", label: "Radial cells", min: 17, max: 257, helperText: "Uniform radial mesh, including the axis and ambient outer boundary." },
  { key: "filmCells", label: "VO₂ thickness cells", min: 1, max: 64, helperText: "Uniform cells through the film. One cell reproduces the previous thermal approximation." },
  { key: "substrateCells", label: "Substrate depth cells", min: 4, max: 128 },
  { key: "substrateGrading", label: "Substrate grading", min: 0, max: 8, helperText: "0: uniform. Larger values concentrate cells near the VO₂ interface; the substrate depth stays unchanged." },
  { key: "timeSteps", label: "Time samples", min: 24, max: 1200, helperText: "Uniform time samples over the simulated window; refine separately from the spatial mesh." },
];

function issueFor(field: keyof OptothermalConfig, issues: ValidationIssue[]) {
  return issues.find((issue) => issue.field === field && issue.severity === "error")?.message;
}

function Fields({ definitions, config, issues, onChange, onFieldValidationChange, fieldRevision, disabled }: {
  definitions: FieldDefinition[];
  disabled: boolean;
  config: OptothermalConfig;
  issues: ValidationIssue[];
  onChange: ConfigurationPanelProps["onChange"];
  onFieldValidationChange: ScientificFieldValidationReporter;
  fieldRevision: number;
}) {
  return definitions.map((definition) => (
    <ScientificNumberField
      key={definition.key}
      id={`parameter-${definition.key}`}
      labelText={definition.label}
      unit={definition.unit}
      value={config[definition.key]}
      disabled={disabled}
      min={definition.min}
      max={definition.max}
      helperText={definition.helperText}
      invalidText={issueFor(definition.key, issues)}
      revision={fieldRevision}
      onValidationChange={(message) => onFieldValidationChange(String(definition.key), message)}
      onValueChange={(value) => { if (value !== null) onChange(definition.key, value); }}
    />
  ));
}

export function ConfigurationPanel({ config, issues, busy, onChange, onReset, onClose, onFieldValidationChange, fieldRevision, hasInvalidDrafts }: ConfigurationPanelProps) {
  const mesh = getMeshDiagnostics(config);
  const format = (value: number) => Number.isFinite(value) ? value.toPrecision(3) : "—";
  const errors = issues.filter((issue) => issue.severity === "error");
  const messages: ValidationMessage[] = issues.map((issue) => ({
    id: issue.id,
    title: issue.severity === "error" ? "Invalid parameter" : "Resolution warning",
    detail: issue.message,
    severity: issue.severity,
    targetId: `parameter-${issue.field}`,
    actionLabel: "Review",
  }));

  return (
    <ScientificTaskPanel
      title="Single-position model"
      titleId="configuration-panel-title"
      eyebrow="Configuration"
      onClose={onClose}
      closeLabel="Close configuration"
      footer={(
        <ScientificPanelFooter summary={hasInvalidDrafts ? "Review the invalid field before running" : errors.length ? `${errors.length} blocking issue${errors.length === 1 ? "" : "s"}` : "Ready for a fixed-position run"}>
          <Button type="button" kind="secondary" disabled={busy} onClick={onReset}>Reset preset</Button>
        </ScientificPanelFooter>
      )}
    >
      <ScientificParameterSection title="Pulse and beam" description="Gaussian pulse evaluated at the beam waist; no axial sweep is performed." columns={1}>
        <Fields disabled={busy} definitions={beamFields} config={config} issues={issues} onChange={onChange} onFieldValidationChange={onFieldValidationChange} fieldRevision={fieldRevision} />
      </ScientificParameterSection>
      <ScientificParameterSection title="Geometry" columns={1}>
        <Fields disabled={busy} definitions={geometryFields} config={config} issues={issues} onChange={onChange} onFieldValidationChange={onFieldValidationChange} fieldRevision={fieldRevision} />
      </ScientificParameterSection>
      <ScientificParameterSection title="Optical and phase model" description="Thin-film TMM converts n/k into local absorptance A(λ,T); reference values should be replaced by measured ellipsometry." columns={1} collapsible defaultOpen={false}>
        <Fields disabled={busy} definitions={opticalFields} config={config} issues={issues} onChange={onChange} onFieldValidationChange={onFieldValidationChange} fieldRevision={fieldRevision} />
      </ScientificParameterSection>
      <ScientificParameterSection title="Thermal properties" description="Homogeneous, isotropic properties; convection applies at the air-side outer boundary." columns={1} collapsible defaultOpen={false}>
        <Fields disabled={busy} definitions={thermalFields} config={config} issues={issues} onChange={onChange} onFieldValidationChange={onFieldValidationChange} fieldRevision={fieldRevision} />
      </ScientificParameterSection>
      <ScientificParameterSection title="Numerical mesh" description="Refine the film and interface independently. Finer meshes cost more; passing resolution checks does not establish convergence." columns={1} collapsible defaultOpen={false}>
        <Fields disabled={busy} definitions={numericalFields} config={config} issues={issues} onChange={onChange} onFieldValidationChange={onFieldValidationChange} fieldRevision={fieldRevision} />
        <div className="mesh-summary" aria-label="Mesh spacing summary">
          <p><strong>Current mesh</strong> · {config.radialCells * (config.substrateCells + config.filmCells)} cells / 40,000 maximum</p>
          <dl>
            <div><dt>Radial spacing</dt><dd>{format(mesh.radialSpacingUm)} µm</dd></div>
            <div><dt>VO₂ cell thickness</dt><dd>{format(mesh.filmSpacingNm)} nm</dd></div>
            <div><dt>Substrate cell at interface</dt><dd>{format(mesh.substrateSpacingUm * 1000)} nm</dd></div>
            <div><dt>Largest substrate cell</dt><dd>{format(mesh.substrateMaximumSpacingUm)} µm</dd></div>
            <div><dt>Time step</dt><dd>{format(config.durationNs / (config.timeSteps - 1))} ns</dd></div>
          </dl>
          <p>Thermal cells resolve depth. Optical absorption remains uniform through the film, with an effective phase driven by its thickness-averaged temperature.</p>
        </div>
      </ScientificParameterSection>
      {messages.length > 0 && <ValidationSummary heading="Input review" messages={messages} />}
    </ScientificTaskPanel>
  );
}
