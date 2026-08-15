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

with `t₀ = 3τ`. Absorbed power is deposited uniformly through the single VO₂ film cell. This local approximation does not propagate a nonlinear beam to an aperture or detector.

## Thermal equation

The axisymmetric model solves

\[
\rho c_p\frac{\partial T}{\partial t}=\frac{1}{r}\frac{\partial}{\partial r}\left(kr\frac{\partial T}{\partial r}\right)+\frac{\partial}{\partial z}\left(k\frac{\partial T}{\partial z}\right)+Q.
\]

An implicit Gauss–Seidel finite-volume update uses harmonic interface conductance between the film and substrate. Symmetry is applied at `r = 0`; the node at the outer radial boundary is imposed explicitly at ambient temperature and carries no source or storage control volume. The bottom substrate boundary is fixed at ambient temperature, while the film/air boundary uses convection. The current material properties are isotropic and temperature independent.

Every implicit step must satisfy both a maximum-update tolerance and a scaled discrete-equation residual. Reaching the iteration limit without satisfying both criteria aborts the run; the result contract records the worst step, update, residual and iteration count.

## Phase response

Heating and cooling use separate logistic transition centres. The phase fraction relaxes toward the corresponding equilibrium value with a first-order time constant. This captures a phenomenological hysteresis but not nucleation, latent heat or spatial phase-domain kinetics.

## Verification evidence

Automated tests require:

1. finite output with the expected mesh dimensions;
2. finite raw `R`, `T`, `A_raw`, passive bounds and `R+T+A_raw=1` within tolerance;
3. stored sensible heat no greater than integrated absorbed energy within a 2% numerical allowance;
4. negligible temperature rise and metallic fraction at negligible optical power;
5. explicit linear convergence evidence and an ambient outer radial node.

These are necessary sanity checks, not a convergence or experimental validation. A quantitative study should refine time, radial and depth resolutions independently and compare against sample-specific optical/thermal measurements.
