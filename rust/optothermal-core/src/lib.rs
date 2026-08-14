use std::{mem, slice};

const CONFIG_LENGTH: usize = 30;
const HEADER_LENGTH: usize = 16;
const MAX_CELLS: usize = 40_000;

#[derive(Clone, Copy)]
struct Complex {
    re: f64,
    im: f64,
}

impl Complex {
    fn new(re: f64, im: f64) -> Self { Self { re, im } }
    fn add(self, other: Self) -> Self { Self::new(self.re + other.re, self.im + other.im) }
    fn sub(self, other: Self) -> Self { Self::new(self.re - other.re, self.im - other.im) }
    fn mul(self, other: Self) -> Self {
        Self::new(self.re * other.re - self.im * other.im, self.re * other.im + self.im * other.re)
    }
    fn div(self, other: Self) -> Self {
        let denominator = other.re * other.re + other.im * other.im;
        Self::new(
            (self.re * other.re + self.im * other.im) / denominator,
            (self.im * other.re - self.re * other.im) / denominator,
        )
    }
    fn exp(self) -> Self {
        let magnitude = self.re.exp();
        Self::new(magnitude * self.im.cos(), magnitude * self.im.sin())
    }
    fn norm_sqr(self) -> f64 { self.re * self.re + self.im * self.im }
}

#[derive(Clone, Copy)]
struct Material {
    conductivity: f64,
    volumetric_heat_capacity: f64,
}

struct Config {
    wavelength_m: f64,
    waist_m: f64,
    peak_intensity_w_m2: f64,
    pulse_fwhm_s: f64,
    duration_s: f64,
    time_steps: usize,
    radial_cells: usize,
    substrate_cells: usize,
    radius_m: f64,
    film_thickness_m: f64,
    substrate_depth_m: f64,
    ambient_k: f64,
    substrate_index: f64,
    air_index: f64,
    insulating_index: Complex,
    metallic_index: Complex,
    transition_heating_k: f64,
    transition_cooling_k: f64,
    transition_width_k: f64,
    phase_relaxation_s: f64,
    film: Material,
    substrate: Material,
    h_air_w_m2k: f64,
}

impl Config {
    fn parse(values: &[f64]) -> Result<Self, i32> {
        if values.len() != CONFIG_LENGTH || values.iter().any(|value| !value.is_finite()) { return Err(2); }
        let time_steps = values[5].round() as usize;
        let radial_cells = values[6].round() as usize;
        let substrate_cells = values[7].round() as usize;
        if !(24..=1200).contains(&time_steps)
            || !(17..=257).contains(&radial_cells)
            || !(4..=128).contains(&substrate_cells)
            || radial_cells.saturating_mul(substrate_cells + 1) > MAX_CELLS
        { return Err(3); }
        let positive = [0usize, 1, 2, 3, 4, 8, 9, 10, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 25, 26, 27];
        if positive.iter().any(|index| values[*index] <= 0.0) { return Err(4); }
        Ok(Self {
            wavelength_m: values[0] * 1.0e-6,
            waist_m: values[1] * 1.0e-6,
            peak_intensity_w_m2: values[2] * 1.0e13,
            pulse_fwhm_s: values[3] * 1.0e-9,
            duration_s: values[4] * 1.0e-9,
            time_steps,
            radial_cells,
            substrate_cells,
            radius_m: values[8] * 1.0e-6,
            film_thickness_m: values[9] * 1.0e-9,
            substrate_depth_m: values[10] * 1.0e-6,
            ambient_k: values[11] + 273.15,
            substrate_index: values[12],
            air_index: values[13],
            insulating_index: Complex::new(values[14], values[15]),
            metallic_index: Complex::new(values[16], values[17]),
            transition_heating_k: values[18] + 273.15,
            transition_cooling_k: values[19] + 273.15,
            transition_width_k: values[20],
            phase_relaxation_s: values[21] * 1.0e-9,
            film: Material { conductivity: values[24], volumetric_heat_capacity: values[22] * values[23] },
            substrate: Material { conductivity: values[27], volumetric_heat_capacity: values[25] * values[26] },
            h_air_w_m2k: values[28],
        })
    }
}

#[no_mangle]
pub extern "C" fn allocate_f64(length: usize) -> *mut f64 {
    let mut values = Vec::<f64>::with_capacity(length);
    let pointer = values.as_mut_ptr();
    mem::forget(values);
    pointer
}

#[no_mangle]
pub unsafe extern "C" fn deallocate_f64(pointer: *mut f64, capacity: usize) {
    if !pointer.is_null() { drop(Vec::from_raw_parts(pointer, 0, capacity)); }
}

#[no_mangle]
pub extern "C" fn output_length(time_steps: usize, radial_cells: usize, substrate_cells: usize) -> usize {
    let nz = substrate_cells.saturating_add(1);
    HEADER_LENGTH
        .saturating_add(4usize.saturating_mul(time_steps))
        .saturating_add(3usize.saturating_mul(radial_cells))
        .saturating_add(nz)
        .saturating_add(2usize.saturating_mul(nz.saturating_mul(radial_cells)))
}

#[no_mangle]
pub unsafe extern "C" fn run_simulation(
    config_pointer: *const f64,
    config_length: usize,
    output_pointer: *mut f64,
    output_capacity: usize,
) -> i32 {
    if config_pointer.is_null() || output_pointer.is_null() { return 1; }
    let values = slice::from_raw_parts(config_pointer, config_length);
    let config = match Config::parse(values) { Ok(config) => config, Err(code) => return code };
    let required = output_length(config.time_steps, config.radial_cells, config.substrate_cells);
    if output_capacity < required { return 5; }
    let output = slice::from_raw_parts_mut(output_pointer, required);
    simulate(&config, output);
    0
}

fn simulate(config: &Config, output: &mut [f64]) {
    let nt = config.time_steps;
    let nr = config.radial_cells;
    let nz = config.substrate_cells + 1;
    let cell_count = nr * nz;
    let dr = config.radius_m / (nr - 1) as f64;
    let substrate_dz = config.substrate_depth_m / config.substrate_cells as f64;
    let dt = config.duration_s / (nt - 1) as f64;
    let pulse_center = 3.0 * config.pulse_fwhm_s;

    let mut previous: Vec<f64> = vec![0.0; cell_count];
    let mut current: Vec<f64> = vec![0.0; cell_count];
    let mut peak: Vec<f64> = vec![0.0; cell_count];
    let mut phase: Vec<f64> = vec![0.0; nr];
    let mut previous_film_temperature = vec![config.ambient_k; nr];
    let mut radial_peak = vec![config.ambient_k; nr];

    let mut cursor = HEADER_LENGTH;
    let time_offset = cursor; cursor += nt;
    let center_temperature_offset = cursor; cursor += nt;
    let center_phase_offset = cursor; cursor += nt;
    let center_absorption_offset = cursor; cursor += nt;
    let radial_offset = cursor; cursor += nr;
    let radial_final_offset = cursor; cursor += nr;
    let radial_peak_offset = cursor; cursor += nr;
    let depth_offset = cursor; cursor += nz;
    let final_map_offset = cursor; cursor += cell_count;
    let peak_map_offset = cursor;

    for i in 0..nr { output[radial_offset + i] = i as f64 * dr * 1.0e6; }
    for layer in 0..config.substrate_cells {
        output[depth_offset + layer] = -config.substrate_depth_m * 1.0e6 + (layer as f64 + 0.5) * substrate_dz * 1.0e6;
    }
    output[depth_offset + nz - 1] = 0.5 * config.film_thickness_m * 1.0e6;

    let baseline_absorption = thin_film_absorptance(config, config.insulating_index);
    let mut maximum_temperature = config.ambient_k;
    let mut maximum_time = 0.0;
    let mut maximum_phase: f64 = 0.0;
    let mut peak_absorption = baseline_absorption;
    let mut absorbed_energy = 0.0;
    let mut maximum_stored_energy: f64 = 0.0;
    let mut total_iterations = 0usize;

    output[time_offset] = 0.0;
    output[center_temperature_offset] = config.ambient_k - 273.15;
    output[center_phase_offset] = 0.0;
    output[center_absorption_offset] = baseline_absorption;

    for step in 1..nt {
        let time = step as f64 * dt;
        let midpoint = time - 0.5 * dt;
        let temporal = (-4.0 * std::f64::consts::LN_2 * ((midpoint - pulse_center) / config.pulse_fwhm_s).powi(2)).exp();
        let mut source = vec![0.0; nr];
        let mut absorption = vec![0.0; nr];

        for i in 0..nr {
            let optical_index = interpolate_complex(config.insulating_index, config.metallic_index, phase[i]);
            absorption[i] = thin_film_absorptance(config, optical_index);
            peak_absorption = peak_absorption.max(absorption[i]);
            let radius = i as f64 * dr;
            let spatial = (-2.0 * (radius / config.waist_m).powi(2)).exp();
            let incident = config.peak_intensity_w_m2 * spatial * temporal;
            source[i] = incident * absorption[i] / config.film_thickness_m;
            let annulus_area = if i == 0 {
                std::f64::consts::PI * (0.5 * dr).powi(2)
            } else {
                2.0 * std::f64::consts::PI * radius * dr
            };
            absorbed_energy += incident * absorption[i] * annulus_area * dt;
        }

        current.copy_from_slice(&previous);
        let iterations = implicit_step(config, &previous, &mut current, &source, dt, dr, substrate_dz);
        total_iterations += iterations;

        for i in 0..nr {
            let index = (nz - 1) * nr + i;
            let absolute_temperature = config.ambient_k + current[index];
            let heating = absolute_temperature >= previous_film_temperature[i];
            let center = if heating { config.transition_heating_k } else { config.transition_cooling_k };
            let equilibrium = 0.5 * (1.0 + ((absolute_temperature - center) / config.transition_width_k).tanh());
            let response = 1.0 - (-dt / config.phase_relaxation_s).exp();
            phase[i] = (phase[i] + response * (equilibrium - phase[i])).clamp(0.0, 1.0);
            previous_film_temperature[i] = absolute_temperature;
            radial_peak[i] = radial_peak[i].max(absolute_temperature);
            maximum_phase = maximum_phase.max(phase[i]);
        }

        let center_temperature = config.ambient_k + current[(nz - 1) * nr];
        if center_temperature > maximum_temperature {
            maximum_temperature = center_temperature;
            maximum_time = time;
        }
        for index in 0..cell_count { peak[index] = peak[index].max(current[index]); }
        maximum_stored_energy = maximum_stored_energy.max(stored_energy(config, &current, dr, substrate_dz));

        output[time_offset + step] = time * 1.0e9;
        output[center_temperature_offset + step] = center_temperature - 273.15;
        output[center_phase_offset + step] = phase[0];
        output[center_absorption_offset + step] = thin_film_absorptance(
            config,
            interpolate_complex(config.insulating_index, config.metallic_index, phase[0]),
        );
        previous.copy_from_slice(&current);
    }

    for i in 0..nr {
        output[radial_final_offset + i] = config.ambient_k - 273.15 + current[(nz - 1) * nr + i];
        output[radial_peak_offset + i] = radial_peak[i] - 273.15;
    }
    for layer in 0..nz {
        for i in 0..nr {
            let index = layer * nr + i;
            output[final_map_offset + index] = config.ambient_k - 273.15 + current[index];
            output[peak_map_offset + index] = config.ambient_k - 273.15 + peak[index];
        }
    }

    let pulse_fluence = config.peak_intensity_w_m2 * config.pulse_fwhm_s
        * (std::f64::consts::PI / (4.0 * std::f64::consts::LN_2)).sqrt();
    let adiabatic_rise = baseline_absorption * pulse_fluence
        / (config.film.volumetric_heat_capacity * config.film_thickness_m);
    output[0] = 1.0;
    output[1] = nt as f64;
    output[2] = nr as f64;
    output[3] = nz as f64;
    output[4] = maximum_temperature - 273.15;
    output[5] = maximum_time * 1.0e9;
    output[6] = maximum_phase;
    output[7] = peak_absorption;
    output[8] = absorbed_energy;
    output[9] = maximum_stored_energy;
    output[10] = total_iterations as f64 / (nt - 1) as f64;
    output[11] = if absorbed_energy > 0.0 { maximum_stored_energy / absorbed_energy } else { 0.0 };
    output[12] = baseline_absorption;
    output[13] = adiabatic_rise;
    output[14] = dt * 1.0e9;
    output[15] = pulse_fluence;
}

fn implicit_step(
    config: &Config,
    previous: &[f64],
    current: &mut [f64],
    film_source: &[f64],
    dt: f64,
    dr: f64,
    substrate_dz: f64,
) -> usize {
    let nr = config.radial_cells;
    let nz = config.substrate_cells + 1;
    let maximum_iterations = 80usize;
    let tolerance = 1.0e-7;
    for iteration in 0..maximum_iterations {
        let mut maximum_change: f64 = 0.0;
        for layer in 0..nz {
            let material = if layer == nz - 1 { config.film } else { config.substrate };
            let dz = if layer == nz - 1 { config.film_thickness_m } else { substrate_dz };
            let alpha = material.conductivity / material.volumetric_heat_capacity;
            for i in 0..nr {
                let index = layer * nr + i;
                let mut diagonal_rate = 0.0;
                let mut neighbour_rate = 0.0;
                if nr > 1 {
                    if i == 0 {
                        let coefficient = 4.0 * alpha / (dr * dr);
                        diagonal_rate += coefficient;
                        neighbour_rate += coefficient * current[index + 1];
                    } else {
                        let radius = i as f64 * dr;
                        let minus = alpha * (1.0 / (dr * dr) - 1.0 / (2.0 * radius * dr));
                        let plus = alpha * (1.0 / (dr * dr) + 1.0 / (2.0 * radius * dr));
                        diagonal_rate += minus + plus;
                        neighbour_rate += minus * current[index - 1];
                        if i < nr - 1 { neighbour_rate += plus * current[index + 1]; }
                    }
                }
                if layer > 0 {
                    let below_material = if layer - 1 == nz - 1 { config.film } else { config.substrate };
                    let below_dz = if layer - 1 == nz - 1 { config.film_thickness_m } else { substrate_dz };
                    let conductance = interface_conductance(material.conductivity, dz, below_material.conductivity, below_dz);
                    let coefficient = conductance / (material.volumetric_heat_capacity * dz);
                    diagonal_rate += coefficient;
                    neighbour_rate += coefficient * current[index - nr];
                } else {
                    let coefficient = 2.0 * material.conductivity / (material.volumetric_heat_capacity * dz * dz);
                    diagonal_rate += coefficient;
                }
                if layer + 1 < nz {
                    let above_material = if layer + 1 == nz - 1 { config.film } else { config.substrate };
                    let above_dz = if layer + 1 == nz - 1 { config.film_thickness_m } else { substrate_dz };
                    let conductance = interface_conductance(material.conductivity, dz, above_material.conductivity, above_dz);
                    let coefficient = conductance / (material.volumetric_heat_capacity * dz);
                    diagonal_rate += coefficient;
                    neighbour_rate += coefficient * current[index + nr];
                } else {
                    diagonal_rate += config.h_air_w_m2k / (material.volumetric_heat_capacity * dz);
                }
                let source_rate = if layer == nz - 1 { film_source[i] / material.volumetric_heat_capacity } else { 0.0 };
                let next = (previous[index] + dt * (source_rate + neighbour_rate)) / (1.0 + dt * diagonal_rate);
                maximum_change = maximum_change.max((next - current[index]).abs());
                current[index] = next;
            }
        }
        if maximum_change < tolerance { return iteration + 1; }
    }
    maximum_iterations
}

fn interface_conductance(k_a: f64, dz_a: f64, k_b: f64, dz_b: f64) -> f64 {
    1.0 / (0.5 * dz_a / k_a + 0.5 * dz_b / k_b)
}

fn interpolate_complex(a: Complex, b: Complex, fraction: f64) -> Complex {
    Complex::new(a.re + fraction * (b.re - a.re), a.im + fraction * (b.im - a.im))
}

fn thin_film_absorptance(config: &Config, film_index: Complex) -> f64 {
    let n0 = Complex::new(config.substrate_index, 0.0);
    let n2 = Complex::new(config.air_index, 0.0);
    let r01 = n0.sub(film_index).div(n0.add(film_index));
    let r12 = film_index.sub(n2).div(film_index.add(n2));
    let t01 = n0.mul(Complex::new(2.0, 0.0)).div(n0.add(film_index));
    let t12 = film_index.mul(Complex::new(2.0, 0.0)).div(film_index.add(n2));
    let delta = film_index.mul(Complex::new(2.0 * std::f64::consts::PI * config.film_thickness_m / config.wavelength_m, 0.0));
    let phase = Complex::new(-delta.im, delta.re).exp();
    let round_trip = phase.mul(phase);
    let denominator = Complex::new(1.0, 0.0).add(r01.mul(r12).mul(round_trip));
    let reflection = r01.add(r12.mul(round_trip)).div(denominator);
    let transmission = t01.mul(t12).mul(phase).div(denominator);
    let reflected = reflection.norm_sqr();
    let transmitted = config.air_index / config.substrate_index * transmission.norm_sqr();
    (1.0 - reflected - transmitted).clamp(0.0, 1.0)
}

fn stored_energy(config: &Config, temperature_rise: &[f64], dr: f64, substrate_dz: f64) -> f64 {
    let nr = config.radial_cells;
    let nz = config.substrate_cells + 1;
    let mut energy = 0.0;
    for layer in 0..nz {
        let material = if layer == nz - 1 { config.film } else { config.substrate };
        let dz = if layer == nz - 1 { config.film_thickness_m } else { substrate_dz };
        for i in 0..nr {
            let radius = i as f64 * dr;
            let area = if i == 0 { std::f64::consts::PI * (0.5 * dr).powi(2) } else { 2.0 * std::f64::consts::PI * radius * dr };
            energy += material.volumetric_heat_capacity * temperature_rise[layer * nr + i] * area * dz;
        }
    }
    energy.max(0.0)
}
