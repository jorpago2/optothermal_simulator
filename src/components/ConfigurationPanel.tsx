import { Button } from "@carbon/react";
import {
  ScientificNumberField,
  ScientificPanelFooter,
  ScientificParameterSection,
  ScientificTaskPanel,
  ValidationSummary,
  type ValidationMessage,
} from "@jorpago2/scientific-ui";
import type { OptothermalConfig, ValidationIssue } from "../solver/types";

interface ConfigurationPanelProps {
  config: OptothermalConfig;
  issues: ValidationIssue[];
  busy: boolean;
  onChange: (field: keyof OptothermalConfig, value: number) => void;
  onReset: () => void;
  onRun: () => void;
  onClose: () => void;
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
  { key: "ambientC", label: "Ambient temperature", unit: "°C", min: -100, max: 500 },
];

const opticalFields: FieldDefinition[] = [
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
  { key: "filmDensityKgM3", label: "VO₂ density", unit: "kg/m³", min: 1, max: 3e4 },
  { key: "filmHeatCapacityJKgK", label: "VO₂ heat capacity", unit: "J/(kg·K)", min: 1, max: 1e5 },
  { key: "filmConductivityWMK", label: "VO₂ conductivity", unit: "W/(m·K)", min: 0.001, max: 1e4 },
  { key: "substrateDensityKgM3", label: "Substrate density", unit: "kg/m³", min: 1, max: 3e4 },
  { key: "substrateHeatCapacityJKgK", label: "Substrate heat capacity", unit: "J/(kg·K)", min: 1, max: 1e5 },
  { key: "substrateConductivityWMK", label: "Substrate conductivity", unit: "W/(m·K)", min: 0.001, max: 1e4 },
  { key: "convectionWM2K", label: "Air-side convection", unit: "W/(m²·K)", min: 0, max: 1e5 },
];

const numericalFields: FieldDefinition[] = [
  { key: "timeSteps", label: "Time samples", min: 24, max: 1200 },
  { key: "radialCells", label: "Radial cells", min: 17, max: 257 },
  { key: "substrateCells", label: "Substrate depth cells", min: 4, max: 128 },
];

function issueFor(field: keyof OptothermalConfig, issues: ValidationIssue[]) {
  return issues.find((issue) => issue.field === field)?.message;
}

function Fields({ definitions, config, issues, onChange }: {
  definitions: FieldDefinition[];
  config: OptothermalConfig;
  issues: ValidationIssue[];
  onChange: ConfigurationPanelProps["onChange"];
}) {
  return definitions.map((definition) => (
    <ScientificNumberField
      key={definition.key}
      id={`parameter-${definition.key}`}
      labelText={definition.label}
      unit={definition.unit}
      value={config[definition.key]}
      min={definition.min}
      max={definition.max}
      helperText={definition.helperText}
      invalidText={issueFor(definition.key, issues)}
      onValueChange={(value) => { if (value !== null) onChange(definition.key, value); }}
    />
  ));
}

export function ConfigurationPanel({ config, issues, busy, onChange, onReset, onRun, onClose }: ConfigurationPanelProps) {
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
        <ScientificPanelFooter summary={errors.length ? `${errors.length} blocking issue${errors.length === 1 ? "" : "s"}` : "Ready for a fixed-position run"}>
          <Button type="button" kind="secondary" disabled={busy} onClick={onReset}>Reset preset</Button>
          <Button type="button" kind="primary" disabled={busy || errors.length > 0} onClick={onRun}>{busy ? "Running…" : "Run simulation"}</Button>
        </ScientificPanelFooter>
      )}
    >
      <ScientificParameterSection title="Pulse and beam" description="Gaussian pulse evaluated at the beam waist; no axial sweep is performed." columns={2}>
        <Fields definitions={beamFields} config={config} issues={issues} onChange={onChange} />
      </ScientificParameterSection>
      <ScientificParameterSection title="Geometry" columns={2}>
        <Fields definitions={geometryFields} config={config} issues={issues} onChange={onChange} />
      </ScientificParameterSection>
      <ScientificParameterSection title="VO₂ optical state" description="Reference values are sample-dependent and should be replaced by measured ellipsometry." columns={2} collapsible>
        <Fields definitions={opticalFields} config={config} issues={issues} onChange={onChange} />
      </ScientificParameterSection>
      <ScientificParameterSection title="Thermal properties" columns={2} collapsible defaultOpen={false}>
        <Fields definitions={thermalFields} config={config} issues={issues} onChange={onChange} />
      </ScientificParameterSection>
      <ScientificParameterSection title="Numerical mesh" description="The implicit solver is stable for large steps, but the pulse still requires temporal resolution." columns={2} collapsible>
        <Fields definitions={numericalFields} config={config} issues={issues} onChange={onChange} />
      </ScientificParameterSection>
      {messages.length > 0 && <ValidationSummary heading="Input review" messages={messages} />}
    </ScientificTaskPanel>
  );
}
