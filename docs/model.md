# Numerical model

## Optical absorption

At each radial cell and time sample, the local complex VO₂ refractive index is linearly interpolated between insulating and metallic reference states. A coherent normal-incidence transfer matrix evaluates reflectance `R` and transmittance `T` for the substrate / VO₂ / air stack. The absorptance used by the thermal source is

\[
A = \max(0, \min(1, 1-R-T)).
\]

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

An implicit Gauss–Seidel finite-volume update uses harmonic interface conductance between the film and substrate. Symmetry is applied at `r = 0`; the outer radial and bottom substrate boundaries are fixed at ambient temperature, while the film/air boundary uses convection. The current material properties are isotropic and temperature independent.

## Phase response

Heating and cooling use separate logistic transition centres. The phase fraction relaxes toward the corresponding equilibrium value with a first-order time constant. This captures a phenomenological hysteresis but not nucleation, latent heat or spatial phase-domain kinetics.

## Verification evidence

Automated tests require:

1. finite output with the expected mesh dimensions;
2. `0 ≤ A ≤ 1` for the reference stack;
3. stored sensible heat no greater than integrated absorbed energy within a 2% numerical allowance;
4. negligible temperature rise and metallic fraction at negligible optical power.

These are necessary sanity checks, not a convergence or experimental validation. A quantitative study should refine time, radial and depth resolutions independently and compare against sample-specific optical/thermal measurements.
