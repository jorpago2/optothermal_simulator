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

## Explore results

- **Studies → Compare:** name and save up to eight completed cases in this browser, overlay up to six temperature/phase/absorptance curves, select a reference and inspect changed inputs and numerical differences. Export the library as JSON; local storage failures are reported and the cases remain available in the open tab.
- **Studies → Refine:** preview and execute a baseline plus independent radial, film, substrate and time refinements. Adjust the difference tolerance, inspect skipped directions at mesh limits and export the study. Agreement is a sensitivity check, not proof of general convergence.
- **Studies → Sweep:** vary intensity, pulse FWHM or film thickness over 2–12 equally spaced points. The full plan is validated before starting. Progress and cancellation preserve completed points; convergence and sweep results remain separate in the current tab. Export studies before closing or replacing them.
- **Results → Thermal depth profile:** select a radius and zoom to the film/interface or full depth. Compare final temperatures with the envelope of local cell maxima, including a weighted film mean and a resistance-weighted interface estimate.

Study results and plots retain the approximation limits described in [docs/model.md](docs/model.md). Use the current configuration for a new study; saved-case **Load inputs** restores that case's settings for further runs.

## Model scope

- Coherent normal-incidence transfer matrix for substrate / VO₂ / air.
- Gaussian radial and temporal optical source at the beam waist.
- Implicit axisymmetric `r–z` finite-volume heat equation.
- Configurable radial, film and substrate cells, graded substrate spacing and time resolution, with mesh diagnostics and session persistence.
- Hysteretic equilibrium fraction with a first-order phase relaxation time.
- Dedicated Web Worker so the numerical solve does not block the interface.

Thermal depth is resolved across the film; the optical phase remains an effective film value driven by its thickness-mean temperature. The current model omits latent heat, temperature-dependent thermal properties, thermoelastic stress, ablation and any far-field aperture observable. Its reference optical and thermal values require sample-specific calibration, and quantitative use requires mesh/time convergence studies. See [docs/model.md](docs/model.md).

## Provenance

Default values were migrated from `paper_zscan/simulations/configs/materials/vo2_1064_reference.json`. The implementation is new and is not a direct browser port of the original Python workflow.

## License

MIT.
