import { ScientificStatus, formatScientificValue, type ScientificStatusDescriptor } from "@jorpago2/scientific-ui";
import type { OptothermalConfig } from "../solver/types";

interface ExperimentOverviewProps {
  config: OptothermalConfig;
  status: ScientificStatusDescriptor;
}

function value(value: number, unit: string) {
  return <><strong>{formatScientificValue(value, { significantDigits: 4 })}</strong><span>{unit}</span></>;
}

/** Compact r–z experiment schematic. Geometry is explanatory and not to scale. */
export function ExperimentOverview({ config, status }: ExperimentOverviewProps) {
  return (
    <section className="experiment-overview" aria-labelledby="experiment-overview-title">
      <header className="experiment-overview__header">
        <div>
          <p className="experiment-overview__eyebrow">Reference experiment</p>
          <h3 id="experiment-overview-title">Gaussian pulse on a VO₂ film</h3>
        </div>
        <ScientificStatus status={status} compact />
      </header>

      <div className="experiment-overview__body">
        <div className="experiment-overview__schematic">
          <svg
            viewBox="0 0 760 320"
            role="img"
            aria-labelledby="experiment-schematic-title experiment-schematic-description"
            preserveAspectRatio="xMidYMid meet"
          >
            <title id="experiment-schematic-title">Axisymmetric optothermal experiment</title>
            <desc id="experiment-schematic-description">
              A Gaussian beam travels upward through the substrate and reaches its waist at a thin VO₂ film beneath the surrounding medium.
            </desc>
            <rect className="experiment-schematic__ambient" x="28" y="28" width="704" height="88" />
            <rect className="experiment-schematic__film" x="28" y="116" width="704" height="12" />
            <rect className="experiment-schematic__substrate" x="28" y="128" width="704" height="164" />

            <path className="experiment-schematic__beam" d="M230 292 L344 128 L416 128 L530 292 Z" />
            <path className="experiment-schematic__beam-axis" d="M380 276 V82" />
            <path className="experiment-schematic__beam-arrow" d="M371 94 L380 82 L389 94" />
            <line className="experiment-schematic__symmetry" x1="380" y1="36" x2="380" y2="292" />
            <line className="experiment-schematic__waist" x1="344" y1="104" x2="416" y2="104" />
            <line className="experiment-schematic__tick" x1="344" y1="98" x2="344" y2="110" />
            <line className="experiment-schematic__tick" x1="416" y1="98" x2="416" y2="110" />

            <text className="experiment-schematic__material" x="48" y="72">Surrounding medium · n = {config.airIndex}</text>
            <text className="experiment-schematic__material experiment-schematic__material--film" x="48" y="112">VO₂ · {config.filmThicknessNm} nm</text>
            <text className="experiment-schematic__material" x="48" y="158">Substrate · n = {config.substrateIndex}</text>
            <text className="experiment-schematic__annotation" x="428" y="100">w₀ = {config.waistUm} µm</text>
            <text className="experiment-schematic__annotation" x="396" y="226">λ = {config.wavelengthUm} µm</text>
            <text className="experiment-schematic__axis-label" x="389" y="50">r = 0</text>
            <text className="experiment-schematic__axis-label" x="690" y="144">z = 0</text>
          </svg>
          <div className="experiment-overview__caption">
            <span>Incident through substrate</span>
            <span>Axisymmetric r–z · geometry not to scale</span>
          </div>
        </div>

        <dl className="experiment-overview__parameters">
          <div><dt>Wavelength</dt><dd>{value(config.wavelengthUm, "µm")}</dd></div>
          <div><dt>Pulse FWHM</dt><dd>{value(config.pulseFwhmNs, "ns")}</dd></div>
          <div><dt>Beam waist w₀</dt><dd>{value(config.waistUm, "µm")}</dd></div>
          <div><dt>Peak intensity</dt><dd>{value(config.peakIntensityGwCm2, "GW/cm²")}</dd></div>
          <div><dt>Radial domain</dt><dd>{value(config.radiusUm / config.waistUm, "w₀")}</dd></div>
          <div><dt>Model scope</dt><dd><strong>Fixed</strong><span>z = 0</span></dd></div>
        </dl>
      </div>
    </section>
  );
}
