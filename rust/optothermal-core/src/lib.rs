use std::{mem, slice};

const CONFIG_LENGTH: usize = 30;
const HEADER_LENGTH: usize = 29;
const MAX_CELLS: usize = 40_000;
const MAX_OUTPUT_VALUES: usize = 100_000;
const MAX_LINEAR_ITERATIONS: usize = 80;
const LINEAR_UPDATE_TOLERANCE_K: f64 = 1.0e-7;
const LINEAR_RESIDUAL_TOLERANCE: f64 = 1.0e-9;
const OPTICAL_POWER_TOLERANCE: f64 = 1.0e-9;
const NEGATIVE_ENERGY_TOLERANCE_J: f64 = 1.0e-18;

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

#[derive(Clone, Copy)]
struct LinearSolveReport {
    converged: bool,
    iterations: usize,
    maximum_update_k: f64,
    residual_norm: f64,
}

#[derive(Clone, Copy)]
struct OpticalPower {
    reflectance: f64,
    transmittance: f64,
    absorptance_raw: f64,
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
        if [5usize, 6, 7].iter().any(|index| values[*index].fract() != 0.0) { return Err(3); }
        let time_steps = values[5] as usize;
        let radial_cells = values[6] as usize;
        let substrate_cells = values[7] as usize;
        if !(24..=1200).contains(&time_steps)
            || !(17..=257).contains(&radial_cells)
            || !(4..=128).contains(&substrate_cells)
            || radial_cells.saturating_mul(substrate_cells + 1) > MAX_CELLS
        { return Err(3); }
        let positive = [0usize, 1, 2, 3, 4, 8, 9, 10, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 25, 26, 27];
        if positive.iter().any(|index| values[*index] <= 0.0) || values[28] < 0.0 { return Err(4); }
        let wavelength_m = values[0] * 1.0e-6;
        let waist_m = values[1] * 1.0e-6;
        let peak_intensity_w_m2 = values[2] * 1.0e13;
        let pulse_fwhm_s = values[3] * 1.0e-9;
        let duration_s = values[4] * 1.0e-9;
        let radius_m = values[8] * 1.0e-6;
        let film_thickness_m = values[9] * 1.0e-9;
        let substrate_depth_m = values[10] * 1.0e-6;
        let ambient_k = values[11] + 273.15;
        let transition_heating_k = values[18] + 273.15;
        let transition_cooling_k = values[19] + 273.15;
        let phase_relaxation_s = values[21] * 1.0e-9;
        let film_volumetric_heat_capacity = values[22] * values[23];
        let substrate_volumetric_heat_capacity = values[25] * values[26];
        if !wavelength_m.is_finite()
            || !waist_m.is_finite()
            || !peak_intensity_w_m2.is_finite()
            || !pulse_fwhm_s.is_finite()
            || !duration_s.is_finite()
            || !radius_m.is_finite()
            || !film_thickness_m.is_finite()
            || !substrate_depth_m.is_finite()
            || !ambient_k.is_finite()
            || ambient_k <= 0.0
            || !transition_heating_k.is_finite()
            || !transition_cooling_k.is_finite()
            || transition_heating_k <= 0.0
            || transition_cooling_k <= 0.0
            || !phase_relaxation_s.is_finite()
            || !film_volumetric_heat_capacity.is_finite()
            || !substrate_volumetric_heat_capacity.is_finite()
            || film_volumetric_heat_capacity <= 0.0
            || substrate_volumetric_heat_capacity <= 0.0
        { return Err(4); }
        Ok(Self {
            wavelength_m,
            waist_m,
            peak_intensity_w_m2,
            pulse_fwhm_s,
            duration_s,
            time_steps,
            radial_cells,
            substrate_cells,
            radius_m,
            film_thickness_m,
            substrate_depth_m,
            ambient_k,
            substrate_index: values[12],
            air_index: values[13],
            insulating_index: Complex::new(values[14], values[15]),
            metallic_index: Complex::new(values[16], values[17]),
            transition_heating_k,
            transition_cooling_k,
            transition_width_k: values[20],
            phase_relaxation_s,
            film: Material { conductivity: values[24], volumetric_heat_capacity: film_volumetric_heat_capacity },
            substrate: Material { conductivity: values[27], volumetric_heat_capacity: substrate_volumetric_heat_capacity },
            h_air_w_m2k: values[28],
        })
    }
}

#[no_mangle]
pub extern "C" fn allocate_f64(length: usize) -> *mut f64 {
    if length == 0 || length > MAX_OUTPUT_VALUES { return std::ptr::null_mut(); }
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
    if !(24..=1200).contains(&time_steps)
        || !(17..=257).contains(&radial_cells)
        || !(4..=128).contains(&substrate_cells)
        || radial_cells.saturating_mul(substrate_cells.saturating_add(1)) > MAX_CELLS
    { return 0; }
    let nz = substrate_cells + 1;
    let Some(time_values) = 4usize.checked_mul(time_steps) else { return 0; };
    let Some(radial_values) = 3usize.checked_mul(radial_cells) else { return 0; };
    let Some(cell_count) = nz.checked_mul(radial_cells) else { return 0; };
    let Some(map_values) = 2usize.checked_mul(cell_count) else { return 0; };
    let Some(length) = HEADER_LENGTH.checked_add(time_values)
        .and_then(|length| length.checked_add(radial_values))
        .and_then(|length| length.checked_add(nz))
        .and_then(|length| length.checked_add(map_values)) else { return 0; };
    if length > MAX_OUTPUT_VALUES { return 0; }
    length
}

#[no_mangle]
pub unsafe extern "C" fn run_simulation(
    config_pointer: *const f64,
    config_length: usize,
    output_pointer: *mut f64,
    output_capacity: usize,
) -> i32 {
    if config_pointer.is_null() || output_pointer.is_null() { return 1; }
    if config_length != CONFIG_LENGTH { return 2; }
    let values = slice::from_raw_parts(config_pointer, config_length);
    let config = match Config::parse(values) { Ok(config) => config, Err(code) => return code };
    let required = output_length(config.time_steps, config.radial_cells, config.substrate_cells);
    if output_capacity < required { return 5; }
    let output = slice::from_raw_parts_mut(output_pointer, required);
    output.fill(f64::NAN);
    output[0] = 2.0;
    output[1] = config.time_steps as f64;
    output[2] = config.radial_cells as f64;
    output[3] = (config.substrate_cells + 1) as f64;
    match simulate(&config, output) { Ok(()) => 0, Err(code) => code }
}

fn simulate(config: &Config, output: &mut [f64]) -> Result<(), i32> {
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

    let baseline_optical_power = thin_film_power(config, config.insulating_index);
    if !optical_power_is_valid(baseline_optical_power) { return Err(7); }
    let baseline_absorption = baseline_optical_power.absorptance_raw.clamp(0.0, 1.0);
    let mut maximum_temperature = config.ambient_k;
    let mut maximum_time = 0.0;
    let mut maximum_phase: f64 = 0.0;
    let mut peak_absorption = baseline_absorption;
    let mut absorbed_energy = 0.0;
    let mut maximum_stored_energy: f64 = 0.0;
    let mut total_iterations = 0usize;
    let mut maximum_linear_iterations = 0usize;
    let mut worst_linear_update_k: f64 = 0.0;
    let mut worst_linear_residual: f64 = 0.0;
    let mut worst_linear_step = 0usize;
    let mut minimum_absorptance_raw = baseline_optical_power.absorptance_raw;
    let mut maximum_absorptance_raw = baseline_optical_power.absorptance_raw;
    let mut minimum_stored_energy: f64 = 0.0;

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
            let optical_power = thin_film_power(config, optical_index);
            if !optical_power_is_valid(optical_power) { return Err(7); }
            minimum_absorptance_raw = minimum_absorptance_raw.min(optical_power.absorptance_raw);
            maximum_absorptance_raw = maximum_absorptance_raw.max(optical_power.absorptance_raw);
            absorption[i] = optical_power.absorptance_raw.clamp(0.0, 1.0);
            peak_absorption = peak_absorption.max(absorption[i]);
            let radius = i as f64 * dr;
            let spatial = (-2.0 * (radius / config.waist_m).powi(2)).exp();
            let incident = config.peak_intensity_w_m2 * spatial * temporal;
            source[i] = if i == nr - 1 { 0.0 } else { incident * absorption[i] / config.film_thickness_m };
            let annulus_area = radial_annulus_area(i, nr, dr);
            absorbed_energy += incident * absorption[i] * annulus_area * dt;
        }

        current.copy_from_slice(&previous);
        let linear_report = implicit_step(config, &previous, &mut current, &source, dt, dr, substrate_dz);
        total_iterations += linear_report.iterations;
        maximum_linear_iterations = maximum_linear_iterations.max(linear_report.iterations);
        if linear_report.residual_norm >= worst_linear_residual {
            worst_linear_residual = linear_report.residual_norm;
            worst_linear_update_k = linear_report.maximum_update_k;
            worst_linear_step = step;
        }
        write_linear_diagnostics(output, linear_report.converged, maximum_linear_iterations,
            worst_linear_update_k, worst_linear_residual, worst_linear_step);
        if !linear_report.converged { return Err(6); }

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
        let stored_energy_j = stored_energy(config, &current, dr, substrate_dz);
        if !stored_energy_j.is_finite() || stored_energy_j < -NEGATIVE_ENERGY_TOLERANCE_J { return Err(8); }
        minimum_stored_energy = minimum_stored_energy.min(stored_energy_j);
        maximum_stored_energy = maximum_stored_energy.max(stored_energy_j);

        output[time_offset + step] = time * 1.0e9;
        output[center_temperature_offset + step] = center_temperature - 273.15;
        output[center_phase_offset + step] = phase[0];
        let center_optical_power = thin_film_power(
            config,
            interpolate_complex(config.insulating_index, config.metallic_index, phase[0]),
        );
        if !optical_power_is_valid(center_optical_power) { return Err(7); }
        output[center_absorption_offset + step] = center_optical_power.absorptance_raw.clamp(0.0, 1.0);
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
    write_linear_diagnostics(output, true, maximum_linear_iterations, worst_linear_update_k,
        worst_linear_residual, worst_linear_step);
    output[23] = baseline_optical_power.reflectance;
    output[24] = baseline_optical_power.transmittance;
    output[25] = baseline_optical_power.absorptance_raw;
    output[26] = minimum_absorptance_raw;
    output[27] = maximum_absorptance_raw;
    output[28] = minimum_stored_energy;
    Ok(())
}

fn write_linear_diagnostics(
    output: &mut [f64],
    converged: bool,
    maximum_iterations: usize,
    worst_update_k: f64,
    worst_residual: f64,
    worst_step: usize,
) {
    output[16] = if converged { 1.0 } else { 0.0 };
    output[17] = maximum_iterations as f64;
    output[18] = worst_update_k;
    output[19] = worst_residual;
    output[20] = worst_step as f64;
    output[21] = LINEAR_UPDATE_TOLERANCE_K;
    output[22] = LINEAR_RESIDUAL_TOLERANCE;
}

fn implicit_step(
    config: &Config,
    previous: &[f64],
    current: &mut [f64],
    film_source: &[f64],
    dt: f64,
    dr: f64,
    substrate_dz: f64,
) -> LinearSolveReport {
    let nr = config.radial_cells;
    let nz = config.substrate_cells + 1;
    let mut final_update_k = f64::INFINITY;
    let mut final_residual_norm = f64::INFINITY;
    for iteration in 0..MAX_LINEAR_ITERATIONS {
        let mut maximum_change: f64 = 0.0;
        for layer in 0..nz {
            for i in 0..nr {
                let index = layer * nr + i;
                if i == nr - 1 {
                    maximum_change = maximum_change.max(current[index].abs());
                    current[index] = 0.0;
                    continue;
                }
                let (diagonal_rate, neighbour_rate, source_rate) = cell_rates(
                    config, current, film_source, layer, i, dr, substrate_dz,
                );
                let next = (previous[index] + dt * (source_rate + neighbour_rate)) / (1.0 + dt * diagonal_rate);
                maximum_change = maximum_change.max((next - current[index]).abs());
                current[index] = next;
            }
        }
        let residual_norm = linear_residual_norm(config, previous, current, film_source, dt, dr, substrate_dz);
        final_update_k = maximum_change;
        final_residual_norm = residual_norm;
        if maximum_change <= LINEAR_UPDATE_TOLERANCE_K && residual_norm <= LINEAR_RESIDUAL_TOLERANCE {
            return LinearSolveReport {
                converged: true,
                iterations: iteration + 1,
                maximum_update_k: maximum_change,
                residual_norm,
            };
        }
    }
    LinearSolveReport {
        converged: false,
        iterations: MAX_LINEAR_ITERATIONS,
        maximum_update_k: final_update_k,
        residual_norm: final_residual_norm,
    }
}

fn cell_rates(
    config: &Config,
    current: &[f64],
    film_source: &[f64],
    layer: usize,
    i: usize,
    dr: f64,
    substrate_dz: f64,
) -> (f64, f64, f64) {
    let nr = config.radial_cells;
    let nz = config.substrate_cells + 1;
    let index = layer * nr + i;
    let material = if layer == nz - 1 { config.film } else { config.substrate };
    let dz = if layer == nz - 1 { config.film_thickness_m } else { substrate_dz };
    let alpha = material.conductivity / material.volumetric_heat_capacity;
    let mut diagonal_rate = 0.0;
    let mut neighbour_rate = 0.0;
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
    if layer > 0 {
        let below_material = if layer - 1 == nz - 1 { config.film } else { config.substrate };
        let below_dz = if layer - 1 == nz - 1 { config.film_thickness_m } else { substrate_dz };
        let conductance = interface_conductance(material.conductivity, dz, below_material.conductivity, below_dz);
        let coefficient = conductance / (material.volumetric_heat_capacity * dz);
        diagonal_rate += coefficient;
        neighbour_rate += coefficient * current[index - nr];
    } else {
        diagonal_rate += 2.0 * material.conductivity / (material.volumetric_heat_capacity * dz * dz);
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
    (diagonal_rate, neighbour_rate, source_rate)
}

fn linear_residual_norm(
    config: &Config,
    previous: &[f64],
    current: &[f64],
    film_source: &[f64],
    dt: f64,
    dr: f64,
    substrate_dz: f64,
) -> f64 {
    let nr = config.radial_cells;
    let nz = config.substrate_cells + 1;
    let mut maximum_scaled_residual: f64 = 0.0;
    for layer in 0..nz {
        for i in 0..nr {
            let index = layer * nr + i;
            if i == nr - 1 {
                maximum_scaled_residual = maximum_scaled_residual.max(current[index].abs());
                continue;
            }
            let (diagonal_rate, neighbour_rate, source_rate) = cell_rates(
                config, current, film_source, layer, i, dr, substrate_dz,
            );
            let left = (1.0 + dt * diagonal_rate) * current[index];
            let right = previous[index] + dt * (source_rate + neighbour_rate);
            let scale = left.abs().max(right.abs()).max(1.0);
            maximum_scaled_residual = maximum_scaled_residual.max((left - right).abs() / scale);
        }
    }
    maximum_scaled_residual
}

fn interface_conductance(k_a: f64, dz_a: f64, k_b: f64, dz_b: f64) -> f64 {
    1.0 / (0.5 * dz_a / k_a + 0.5 * dz_b / k_b)
}

fn radial_annulus_area(index: usize, radial_cells: usize, dr: f64) -> f64 {
    if index == radial_cells - 1 {
        0.0
    } else if index == 0 {
        std::f64::consts::PI * (0.5 * dr).powi(2)
    } else {
        2.0 * std::f64::consts::PI * index as f64 * dr * dr
    }
}

fn interpolate_complex(a: Complex, b: Complex, fraction: f64) -> Complex {
    Complex::new(a.re + fraction * (b.re - a.re), a.im + fraction * (b.im - a.im))
}

fn thin_film_power(config: &Config, film_index: Complex) -> OpticalPower {
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
    OpticalPower {
        reflectance: reflected,
        transmittance: transmitted,
        absorptance_raw: 1.0 - reflected - transmitted,
    }
}

fn optical_power_is_valid(power: OpticalPower) -> bool {
    power.reflectance.is_finite()
        && power.transmittance.is_finite()
        && power.absorptance_raw.is_finite()
        && power.reflectance >= -OPTICAL_POWER_TOLERANCE
        && power.transmittance >= -OPTICAL_POWER_TOLERANCE
        && power.absorptance_raw >= -OPTICAL_POWER_TOLERANCE
        && power.reflectance <= 1.0 + OPTICAL_POWER_TOLERANCE
        && power.transmittance <= 1.0 + OPTICAL_POWER_TOLERANCE
        && power.absorptance_raw <= 1.0 + OPTICAL_POWER_TOLERANCE
}

fn stored_energy(config: &Config, temperature_rise: &[f64], dr: f64, substrate_dz: f64) -> f64 {
    let nr = config.radial_cells;
    let nz = config.substrate_cells + 1;
    let mut energy = 0.0;
    for layer in 0..nz {
        let material = if layer == nz - 1 { config.film } else { config.substrate };
        let dz = if layer == nz - 1 { config.film_thickness_m } else { substrate_dz };
        for i in 0..nr {
            let area = radial_annulus_area(i, nr, dr);
            energy += material.volumetric_heat_capacity * temperature_rise[layer * nr + i] * area * dz;
        }
    }
    energy
}
