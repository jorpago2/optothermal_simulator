import { formatScientificValue } from "@jorpago2/scientific-ui";
import type { OptothermalConfig } from "../solver/types";

interface ExperimentOverviewProps {
  config: OptothermalConfig;
}

interface DiagramAnnotationProps {
  className: string;
  label: string;
  value: number;
  unit: string;
}

function DiagramAnnotation({ className, label, value, unit }: DiagramAnnotationProps) {
  return (
    <div className={`experiment-diagram__annotation ${className}`}>
      <dt>{label}</dt>
      <dd>
        <strong>{formatScientificValue(value, { significantDigits: 4 })}</strong>
        <span>{unit}</span>
      </dd>
    </div>
  );
}

/** Responsive r–z experiment illustration. Geometry is explanatory and not to scale. */
export function ExperimentOverview({ config }: ExperimentOverviewProps) {
  return (
    <section className="experiment-overview" aria-labelledby="experiment-overview-title">
      <header className="experiment-overview__header">
        <h3 id="experiment-overview-title">Optical stack and beam</h3>
      </header>

      <figure
        className="experiment-diagram"
        role="img"
        aria-labelledby="experiment-overview-title experiment-diagram-description"
      >
        <figcaption id="experiment-diagram-description" className="optothermal-visually-hidden">
          A {formatScientificValue(config.wavelengthUm)} micrometre Gaussian pulse with a {formatScientificValue(config.pulseFwhmNs)} nanosecond FWHM and {formatScientificValue(config.peakIntensityGwCm2)} gigawatts per square centimetre peak intensity travels through a substrate of refractive index {formatScientificValue(config.substrateIndex)} and reaches a {formatScientificValue(config.filmThicknessNm)} nanometre VO₂ film at a {formatScientificValue(config.waistUm)} micrometre beam waist.
        </figcaption>

        <div className="experiment-diagram__ambient" aria-hidden="true" />
        <div className="experiment-diagram__substrate" aria-hidden="true" />
        <div className="experiment-diagram__beam" aria-hidden="true" />
        <div className="experiment-diagram__film" aria-hidden="true" />
        <div className="experiment-diagram__symmetry" aria-hidden="true" />
        <div className="experiment-diagram__beam-axis" aria-hidden="true" />
        <div className="experiment-diagram__waist" aria-hidden="true" />

        <p className="experiment-diagram__material experiment-diagram__material--ambient">
          <strong>Surrounding medium</strong>
          <span>n = {formatScientificValue(config.airIndex)}</span>
        </p>
        <p className="experiment-diagram__material experiment-diagram__material--film">
          <strong>VO₂ film</strong>
          <span>{formatScientificValue(config.filmThicknessNm)} nm</span>
        </p>
        <p className="experiment-diagram__material experiment-diagram__material--substrate">
          <strong>Substrate</strong>
          <span>n = {formatScientificValue(config.substrateIndex)}</span>
        </p>

        <dl className="experiment-diagram__annotations">
          <DiagramAnnotation className="experiment-diagram__annotation--pulse" label="Pulse FWHM" value={config.pulseFwhmNs} unit="ns" />
          <DiagramAnnotation className="experiment-diagram__annotation--intensity" label="Peak intensity" value={config.peakIntensityGwCm2} unit="GW/cm²" />
          <DiagramAnnotation className="experiment-diagram__annotation--waist" label="Beam waist w₀" value={config.waistUm} unit="µm" />
          <DiagramAnnotation className="experiment-diagram__annotation--wavelength" label="Wavelength λ" value={config.wavelengthUm} unit="µm" />
        </dl>

        <span className="experiment-diagram__axis-label experiment-diagram__axis-label--radial">r = 0</span>
        <span className="experiment-diagram__axis-label experiment-diagram__axis-label--axial">z = 0</span>
        <span className="experiment-diagram__caption">Substrate-side incidence · axisymmetric r–z · not to scale</span>
      </figure>
    </section>
  );
}
