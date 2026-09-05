# Numerical model

## Optical absorption

At each radial cell and time sample, the local complex VO₂ refractive index is linearly interpolated between insulating and metallic reference states. A coherent normal-incidence transfer matrix evaluates reflectance `R` and transmittance `T` for the substrate / VO₂ / air stack. The core retains the raw balance

\[
A_\mathrm{raw}=1-R-T.
\]

`R`, `T`, and `A_raw` must be finite and remain within a documented numerical tolerance of the passive interval before the thermal step is accepted. Only round-off inside that tolerance is clipped for source deposition; a non-passive balance aborts the run.

The incident intensity is a separable Gaussian pulse,

\[
I(r,t)=I_0\exp[-2(r/w_0)^2]\exp[-4\ln(2)((t-t_0)/\tau)^2],
\]

with `t₀ = 3τ`. Absorbed power is deposited uniformly through all VO₂ depth cells, with volumetric source `Q = I A / d_f`. The optical film retains one effective phase fraction at each radius, driven by the thickness-mean film temperature. Resolving thermal depth does not introduce optical phase fronts or detector-plane propagation.

## Thermal equation

The axisymmetric model solves

\[
\rho c_p\frac{\partial T}{\partial t}=\frac{1}{r}\frac{\partial}{\partial r}\left(kr\frac{\partial T}{\partial r}\right)+\frac{\partial}{\partial z}\left(k\frac{\partial T}{\partial z}\right)+Q.
\]

An implicit finite-volume update accounts for each cell's actual volume. Face conductance uses the series resistance of the adjacent half-cells, including at the film/substrate interface. A Thomas solve along depth is combined with forward/backward radial Gauss–Seidel sweeps. Symmetry is applied at `r = 0`; the node at the outer radial boundary is imposed explicitly at ambient temperature and carries no source or storage control volume. The bottom substrate boundary is fixed at ambient temperature, while the film/air boundary uses convection. The current material properties are isotropic and temperature independent.

Every implicit step must satisfy both a maximum-update tolerance and a scaled discrete-equation residual. Reaching the iteration limit without satisfying both criteria aborts the run; the result contract records the worst step, update, residual and iteration count.

## Phase response

Heating and cooling use separate logistic transition centres. The phase fraction relaxes toward the corresponding equilibrium value with a first-order time constant. This captures a phenomenological hysteresis but not nucleation, latent heat or spatial phase-domain kinetics.

## Configurable mesh

The Numerical mesh panel exposes radial cells, film depth cells, substrate depth cells, substrate grading and time samples. Defaults are 65 radial cells, 24 film cells, 96 substrate cells, grading 6 and 241 time samples. Film cells are uniform; substrate cells concentrate near the interface. Film cell count is limited to 1–64, grading to 0–8 and the complete spatial mesh to 40,000 cells.

For substrate thickness `D`, cell count `N` and grading `g`, interface-to-bottom edges are `d(j) = D expm1(g j/N) / expm1(g)`. Grading zero uses `d(j) = D j/N`. Depth coordinates increase from the substrate bottom to the film surface, with the interface at zero. The heatmap uses explicit cell edges so unequal cell thicknesses are rendered at their physical positions. Surface curves use the air-side cell temperature; phase kinetics use the thickness-mean film temperature.

Resolution checks compare the pulse diffusion length with film spacing and the largest substrate cell intersecting that diffusion layer. These checks are heuristics, not proof of convergence. A separate warning flags a substrate bottom within four diffusion lengths over the simulation window. Refinement should vary spatial resolution, time resolution and domain size independently.

Saved sessions without the new mesh parameters restore one film cell and uniform substrate spacing to preserve their earlier configuration. New JSON exports use `optothermal-simulator/result@3`, retain all mesh parameters and include both depth centres and edges.

## Studies and derived quantities

Convergence studies run the baseline and change one resolution at a time. Radial and temporal interval counts are doubled (`n → 2(n−1)+1`); film and substrate cell counts are doubled. Refinement stops at each solver limit, with skipped directions explicitly reported. No domain-size or grading change is made implicitly. One refined comparison per direction tests sensitivity and does not establish an asymptotic convergence rate.

For two cases, temperature-rise change is measured relative to the baseline rise above its own ambient temperature, with a 1 K denominator floor. Absorbed-energy change uses the absolute baseline energy with a 10⁻¹⁸ J floor. Metallic-fraction differences are absolute. The UI defaults to 1% for temperature rise and energy and one percentage point for phase, with a configurable common threshold. These are user criteria rather than a validated numerical error bound. Evidence is attached only to an identical input configuration; incomplete studies remain partial.

Sweeps keep all non-swept inputs fixed. In particular, increasing pulse width does not silently extend the time window: an insufficient window blocks the whole plan. The duration above 50% centre metallic fraction sums all intervals above the threshold, interpolating crossings linearly and explicitly reporting metallic states at the start or end of the sampled window. It does not extrapolate the cooling time beyond that window.

Depth profiles use existing per-cell temporal maxima and the final simultaneous snapshot. The weighted average of local maxima is an upper bound on the instantaneous film mean, not its peak at a common time. Interface estimates use the two half-cell thermal resistances `R_s = Δz_s/(2k_s)` and `R_f = Δz_f/(2k_f)`, giving `T_i = (T_s R_f + T_f R_s)/(R_s + R_f)` under a linear half-cell reconstruction. Applying this reconstruction to local maxima gives a bound on the reconstructed interface temperature, not a resolved temporal interface peak. No new time-history field or material physics is introduced.

## Verification evidence

Automated tests require:

1. finite output with the expected mesh dimensions;
2. finite raw `R`, `T`, `A_raw`, passive bounds and `R+T+A_raw=1` within tolerance;
3. stored sensible heat no greater than integrated absorbed energy within a 2% numerical allowance;
4. negligible temperature rise and metallic fraction at negligible optical power;
5. explicit linear convergence evidence and an ambient outer radial node;
6. energy conservation in an insulated, negligible-conductivity limit and convergence toward analytical Gaussian absorbed energy;
7. depth coordinates and surface curves consistent with the configured mesh;
8. decreasing changes under independent film, substrate and time refinement in a low-power case.

For the automated low-power case (0.001 GW/cm², 33 radial cells, other settings at defaults), the final two refinement levels change peak temperature by approximately 0.00419 K for film cells (12→24), 0.000300 K for substrate cells (64→96), and 0.00447 K for time samples (241→481). These are limited regression checks below the phase transition, not validation for arbitrary inputs.

These are necessary sanity checks, not a convergence or experimental validation. A quantitative study should refine time, radial and depth resolutions independently and compare against sample-specific optical/thermal measurements.
