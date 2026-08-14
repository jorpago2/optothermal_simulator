# Optothermal Simulator

Interactive fixed-position optothermal simulation of a VO₂ thin film under a pulsed Gaussian beam. The browser application combines React, TypeScript, Carbon, `@jorpago2/scientific-ui`, Plotly and a Rust/WebAssembly numerical core.

The initial reference case represents a 150 nm VO₂ layer on a borosilicate-like substrate at 1064 nm. It computes the transient axisymmetric temperature field, a hysteretic metallic fraction and the associated thin-film absorptance at **one axial position (`z = 0`)**. It deliberately does not perform a Z-scan sweep or detector-plane propagation.

## Run locally

Requirements: Node.js 24+, pnpm 11, Rust and the `wasm32-unknown-unknown` target.

```bash
rustup target add wasm32-unknown-unknown
pnpm install
pnpm dev
```

The development command compiles the WASM core before starting Vite. Then open `http://127.0.0.1:5173/optothermal_simulator/`.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm check:conformance
pnpm exec playwright install chromium
pnpm test:ui
pnpm build
```

The automated checks cover input validation, the actual WASM solver, optical passivity, a thermal-energy bound, the negligible-power limit, responsive layout, the real reference run, keyboard help, dark theme and invalid-input states.

## Model scope

- Coherent normal-incidence transfer matrix for substrate / VO₂ / air.
- Gaussian radial and temporal optical source at the beam waist.
- Implicit axisymmetric `r–z` finite-volume heat equation.
- Hysteretic equilibrium fraction with a first-order phase relaxation time.
- Dedicated Web Worker so the numerical solve does not block the interface.

The current model omits latent heat, temperature-dependent thermal properties, thermoelastic stress, ablation and any far-field aperture observable. Its reference optical and thermal values require sample-specific calibration, and quantitative use requires mesh/time convergence studies. See [docs/model.md](docs/model.md).

## Provenance

Default values were migrated from `paper_zscan/simulations/configs/materials/vo2_1064_reference.json`. The implementation is new and is not a direct browser port of the original Python workflow.

## License

MIT.
