import { formatScientificValue } from "@jorpago2/scientific-ui";
import type { OptothermalConfig } from "../solver/types";

interface ExperimentOverviewProps {
  config: OptothermalConfig;
}

function value(value: number, unit: string) {
  return <><strong>{formatScientificValue(value, { significantDigits: 4 })}</strong><span>{unit}</span></>;
}

/** Compact r–z experiment schematic. Geometry is explanatory and not to scale. */
export function ExperimentOverview({ config }: ExperimentOverviewProps) {
  return (
    <section className="experiment-overview" aria-labelledby="experiment-overview-title">
      <header className="experiment-overview__header">
        <h3 id="experiment-overview-title">Optical stack and beam</h3>
      </header>

      <div className="experiment-overview__body">
        <div className="experiment-overview__schematic">
          <svg
            viewBox="0 0 760 220"
            role="img"
            aria-labelledby="experiment-schematic-title experiment-schematic-description"
            preserveAspectRatio="xMidYMid meet"
          >
            <title id="experiment-schematic-title">Axisymmetric optothermal experiment</title>
            <desc id="experiment-schematic-description">
              A Gaussian beam travels upward through the substrate and reaches its waist at a thin VO₂ film beneath the surrounding medium.
            </desc>
            <rect className="experiment-schematic__ambient" x="28" y="20" width="704" height="68" />
            <rect className="experiment-schematic__film" x="28" y="88" width="704" height="10" />
            <rect className="experiment-schematic__substrate" x="28" y="98" width="704" height="104" />

            <path className="experiment-schematic__beam" d="M250 202 L344 98 L416 98 L510 202 Z" />
            <path className="experiment-schematic__beam-axis" d="M380 190 V50" />
            <path className="experiment-schematic__beam-arrow" d="M371 62 L380 50 L389 62" />
            <line className="experiment-schematic__symmetry" x1="380" y1="25" x2="380" y2="202" />
            <line className="experiment-schematic__waist" x1="344" y1="76" x2="416" y2="76" />
            <line className="experiment-schematic__tick" x1="344" y1="70" x2="344" y2="82" />
            <line className="experiment-schematic__tick" x1="416" y1="70" x2="416" y2="82" />

            <text className="experiment-schematic__material" x="48" y="50">Surrounding medium · n = {config.airIndex}</text>
            <text className="experiment-schematic__material experiment-schematic__material--film" x="48" y="84">VO₂ · {config.filmThicknessNm} nm</text>
            <text className="experiment-schematic__material" x="48" y="126">Substrate · n = {config.substrateIndex}</text>
            <text className="experiment-schematic__annotation" x="428" y="72">w₀ = {config.waistUm} µm</text>
            <text className="experiment-schematic__annotation" x="396" y="155">λ = {config.wavelengthUm} µm</text>
            <text className="experiment-schematic__axis-label" x="389" y="36">r = 0</text>
            <text className="experiment-schematic__axis-label" x="690" y="116">z = 0</text>
          </svg>
          <div className="experiment-overview__caption">
            Substrate-side incidence · axisymmetric r–z · not to scale
          </div>
        </div>

        <dl className="experiment-overview__parameters">
          <div><dt>Wavelength</dt><dd>{value(config.wavelengthUm, "µm")}</dd></div>
          <div><dt>Pulse FWHM</dt><dd>{value(config.pulseFwhmNs, "ns")}</dd></div>
          <div><dt>Beam waist w₀</dt><dd>{value(config.waistUm, "µm")}</dd></div>
          <div><dt>Peak intensity</dt><dd>{value(config.peakIntensityGwCm2, "GW/cm²")}</dd></div>
        </dl>
      </div>
    </section>
  );
}
