/**
 * Part temperature (ADR 0023). Each part has one skin temperature. Heat comes in as the
 * Sutton-Graves stagnation-point flux `q = k·√(ρ/r_n)·v³` (`k` for air) over the area the airflow
 * hits, minus what a module absorbs (an ablating heat shield), and leaves by grey-body radiation
 * `ε·σ·A·(T⁴ − T_env⁴)`. The skin heat capacity is `SKIN_HEAT_CAPACITY · surface area`. The update is
 * implicit (backward) Euler solved by Newton's method from above, so it is stable for any step: the
 * same function cools parts across a 10 s rails chunk and heats them in a 20 ms flight step.
 */
import type { EntityId, PartShape, Vec3 } from '@orbital/core';
import {
	AMBIENT_TEMPERATURE,
	DEFAULT_MAX_TEMPERATURE,
	EMISSIVITY,
	FALLBACK_PART_SIZE,
	SKIN_HEAT_CAPACITY,
	STEFAN_BOLTZMANN,
	SUTTON_GRAVES_K,
	THERMAL_ITERATIONS
} from './constants.ts';
import { makeContext } from './hooks.ts';
import { moduleDefOf, partDefOf, partOf, vesselOf, type SimCore } from './core.ts';

/** Heat the airflow delivers to one part this step. */
export interface HeatInput {
	/** Power on the part, W. */
	power: number;
	/** Airspeed of the part, m/s. */
	speed: number;
}

/** A part whose temperature went above its limit. */
export interface Overheat {
	vessel: EntityId;
	part: EntityId;
	/** Temperature reached, K. */
	temperature: number;
	/** Airspeed at the time, m/s (0 when it was not in an airflow). */
	speed: number;
}

/** Total skin area of a part's shape, m² (a 1 m box without a shape). */
export function surfaceArea(shape: PartShape | undefined): number {
	if (shape?.kind === 'cylinder') {
		return 2 * Math.PI * shape.radius * (shape.height + shape.radius);
	}
	const [a, b, c] =
		shape?.kind === 'box'
			? shape.size
			: ([FALLBACK_PART_SIZE, FALLBACK_PART_SIZE, FALLBACK_PART_SIZE] as const);
	return 2 * (a * b + b * c + a * c);
}

/** Effective nose radius for the stagnation flux, m: the cylinder radius, half the narrower box side. */
export function noseRadius(shape: PartShape | undefined): number {
	if (shape?.kind === 'cylinder') return shape.radius;
	const [a, , c] =
		shape?.kind === 'box'
			? shape.size
			: ([FALLBACK_PART_SIZE, FALLBACK_PART_SIZE, FALLBACK_PART_SIZE] as const);
	return Math.min(a, c) / 2;
}

/** Sutton-Graves stagnation-point convective heat flux, W/m². */
export function stagnationFlux(density: number, radius: number, speed: number): number {
	return SUTTON_GRAVES_K * Math.sqrt(density / radius) * speed ** 3;
}

/**
 * Power on a part from the airflow: stagnation flux times the area the flow hits, i.e. the part's
 * projected areas (`areas`, shielded ends already zero) weighted by the flow component along each
 * axis (`local` is the airspeed in the part frame).
 */
export function heatInput(
	density: number,
	shape: PartShape | undefined,
	areas: Vec3,
	local: Vec3
): HeatInput {
	const speed = Math.hypot(local.x, local.y, local.z);
	if (density <= 0 || speed <= 0) return { power: 0, speed };
	const exposed =
		(areas.x * Math.abs(local.x) + areas.y * Math.abs(local.y) + areas.z * Math.abs(local.z)) /
		speed;
	return { power: stagnationFlux(density, noseRadius(shape), speed) * exposed, speed };
}

/**
 * Temperature after `h` seconds with `power` W going in, for heat capacity `capacity` J/K and
 * radiating surface `area` m². Solves `T = T0 + h/C·(P − εσA(T⁴ − Te⁴))` for T by Newton's method
 * starting from an upper bound (so the iteration decreases monotonically).
 */
export function advanceTemperature(
	t0: number,
	power: number,
	capacity: number,
	area: number,
	h: number,
	env = AMBIENT_TEMPERATURE
): number {
	const k = (h * EMISSIVITY * STEFAN_BOLTZMANN * area) / capacity;
	const source = t0 + (h * power) / capacity;
	// The radiative equilibrium for this power bounds the answer from above, as does t0 when the part
	// is hotter than that; both are at least `env`, and f is convex, so Newton falls monotonically.
	const equilibrium =
		(env ** 4 + power / (EMISSIVITY * STEFAN_BOLTZMANN * area || Infinity)) ** 0.25;
	let t = Math.min(source, Math.max(t0, equilibrium));
	for (let i = 0; i < THERMAL_ITERATIONS; i++) {
		const f = t - source + k * (t ** 4 - env ** 4);
		const next = t - f / (1 + 4 * k * t ** 3);
		if (Math.abs(next - t) < 1e-9) return next;
		t = next;
	}
	return t;
}

/**
 * Advance every part of a vessel by `h`: modules with `absorbHeat` take their share of the power
 * (in part id order), the rest warms the skin, radiation cools it. Returns the parts above their
 * limit, ascending, for the caller to destroy after the physics step.
 */
export function stepThermal(
	core: SimCore,
	vesselId: EntityId,
	inputs: ReadonlyMap<EntityId, HeatInput>,
	h: number
): Overheat[] {
	const hot: Overheat[] = [];
	for (const id of vesselOf(core, vesselId).parts) {
		const part = partOf(core, id);
		const def = partDefOf(core, part);
		const input = inputs.get(id);
		let power = input?.power ?? 0;
		if (power > 0) {
			for (const m of part.modules) {
				const absorb = moduleDefOf(core, m.id).absorbHeat;
				if (!absorb) continue;
				const taken = absorb(
					makeContext(core, id, m.id),
					{ power, temperature: part.temperature },
					h
				);
				power -= Math.min(power, Math.max(0, taken));
			}
		}
		const area = surfaceArea(def.shape);
		part.temperature = advanceTemperature(
			part.temperature,
			power,
			SKIN_HEAT_CAPACITY * area,
			area,
			h
		);
		if (part.temperature > (def.maxTemperature ?? DEFAULT_MAX_TEMPERATURE)) {
			hot.push({
				vessel: vesselId,
				part: id,
				temperature: part.temperature,
				speed: input?.speed ?? 0
			});
		}
	}
	return hot;
}
