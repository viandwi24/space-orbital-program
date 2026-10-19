/** Plan 041 / ADR 0075: a craft with wings carries its weight and glides at the glide ratio of its drag polar. */
import { describe, expect, test } from 'bun:test';
import { partId, type EntityId, type VesselDesign } from '@orbital/core';
import { HomeBody, wingCoefficients, wingConfigSchema } from '@orbital/mod-stock';
import { ambientAt } from '../src/atmosphere.ts';
import { qFromBasis } from '../src/math.ts';
import { VESSEL } from '../src/state.ts';
import { vesselMass } from './helpers/measure.ts';
import { newSim } from './helpers/vessels.ts';

const OMEGA = (2 * Math.PI) / 21_600;
const RADIUS = 600_000;
/** A flat planet: the glide is over level ground (the home terrain has mountains at 3 km). */
const FLAT = { maxHeight: 0, heightAt: () => 0 };

/**
 * Pod on a full small tank with a pair of wings at the tank's middle (tilted `incidence` rad
 * about their span, the same on both sides: the tilt is about the parent's axes, ADR 0071) and a
 * pair of tail wings at its foot with no incidence. +Z of the vessel is "up" for these wings.
 */
export function glider(incidence = 0.15): VesselDesign {
	const wing = (index: number, y: number, angle: number, tilt: number, symmetry: number) => ({
		index,
		part: partId('stock.wing'),
		parent: { index: 1, parentNode: 'surface', node: 'radial', radial: { angle, y } },
		tilt: { x: tilt, y: 0, z: 0 },
		symmetry
	});
	return {
		formatVersion: 3,
		name: 'Glider',
		parts: [
			{ index: 0, part: partId('stock.command-pod'), parent: null },
			{
				index: 1,
				part: partId('stock.tank-small'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			wing(2, 0, 0, incidence, 1),
			wing(3, 0, Math.PI, incidence, 1),
			wing(4, -0.8, 0, 0, 2),
			wing(5, -0.8, Math.PI, 0, 2)
		],
		stages: []
	};
}

const wingConfig = wingConfigSchema.parse({ area: 3, aspectRatio: 6 });
/** Air density of the stock home atmosphere (ADR 0017): `rho0 exp(-h / H)`. */
// the stock air with its temperature curve (plan 212): colder, so denser, aloft
const density = (h: number): number => ambientAt(HomeBody, h).density;

/** The craft in level flight at `alt` m heading -Z, its flight path `gamma` rad below the horizon, nose along it (no angle of attack), `speed` m/s through the air. */
async function fly(speed: number, gamma: number, alt = 3_000, incidence = 0.15) {
	const sim = await newSim({ terrain: FLAT });
	const f = { x: -Math.sin(gamma), y: 0, z: -Math.cos(gamma) };
	const up = { x: Math.cos(gamma), y: 0, z: -Math.sin(gamma) };
	const x0 = RADIUS + alt;
	const r = sim.dispatch({
		type: 'load-vessel',
		design: glider(incidence),
		placement: {
			kind: 'state',
			position: { x: x0, y: 0, z: 0 },
			// The air turns with the planet: inertial velocity = air velocity + omega x r.
			velocity: { x: speed * f.x, y: 0, z: speed * f.z - OMEGA * x0 },
			orientation: qFromBasis({ x: 0, y: -1, z: 0 }, f, up)
		}
	});
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel as EntityId;
	const mass = vesselMass(sim, sim.snapshot().vessels[0]!);
	const state = () => {
		const s = sim.world.get(id, VESSEL)!;
		const radius = Math.hypot(s.com.x, s.com.y, s.com.z);
		const air = {
			x: s.velocity.x - OMEGA * s.com.z,
			y: s.velocity.y,
			z: s.velocity.z + OMEGA * s.com.x
		};
		return { s, radius, air, speed: Math.hypot(air.x, air.y, air.z) };
	};
	return { sim, id, mass, state };
}

describe('wings carry a craft (ADR 0075)', () => {
	test('at the speed where q S C_L equals the weight the net vertical force is zero (lift within 3 percent of the weight)', async () => {
		const incidence = 0.15;
		const { sim, mass, state } = await fly(1, 0, 3_000, incidence);
		sim.dispose();
		// Hand value: two wings of 3 m2 at the incidence, tail wings at no angle of attack.
		const cl = wingCoefficients(wingConfig, incidence).cl;
		const g = 3.5316e12 / (RADIUS + 3_000) ** 2;
		const speed = Math.sqrt((2 * mass * g) / (density(3_000) * 6 * cl));
		expect(speed).toBeGreaterThan(150);
		expect(speed).toBeLessThan(250);
		const level = await fly(speed, 0);
		const before = { ...level.state().s.velocity };
		level.sim.step(0.02);
		const after = level.state().s.velocity;
		// Gravity is along -X (the radial); the craft's up is +X. Lift plus gravity: |a_x| << g.
		const acc = (after.x - before.x) / 0.02;
		expect(Math.abs(acc)).toBeLessThan(0.03 * g);
		level.sim.dispose();
	});

	test('it glides: the energy-corrected glide ratio over 30 s is the polar value within 15 percent', async () => {
		const incidence = 0.15;
		const cl = wingCoefficients(wingConfig, incidence).cl;
		const probe = await fly(1, 0);
		const mass = probe.mass;
		probe.sim.dispose();
		const g = 3.5316e12 / (RADIUS + 3_000) ** 2;
		const speed = Math.sqrt((2 * mass * g) / (density(3_000) * 6 * cl));
		// Drag area of the craft by hand: the pod's nose disc (the tank end faces are covered) at 0.3,
		// four wings at their parasite drag 0.02 on 3 m2, their thin box faces at 0.05 x 0.24 m2.
		const cdA = 0.3 * Math.PI * 0.625 ** 2 + 4 * 0.02 * 3 + 4 * 0.05 * 0.24;
		const cd = cdA / 6 + (cl * cl) / (Math.PI * 0.85 * 6);
		const predicted = cl / cd;
		expect(predicted).toBeGreaterThan(4.5);
		expect(predicted).toBeLessThan(5.5);
		const { sim, state } = await fly(speed, Math.atan(1 / predicted));
		const start = state();
		const energy = (st: ReturnType<typeof state>): number =>
			st.radius - RADIUS + (st.speed * st.speed) / (2 * g);
		let path = 0;
		let worstAoa = 0;
		for (let i = 0; i < 1_500; i++) {
			sim.step(0.02);
			path += state().speed * 0.02;
			if (i % 50 === 0) {
				const q = sim.snapshot().vessels[0]!.orientation;
				// Nose +Y of the vessel in the world; angle to the air velocity.
				const nose = {
					x: 2 * (q.x * q.y - q.w * q.z),
					y: 1 - 2 * (q.x * q.x + q.z * q.z),
					z: 2 * (q.y * q.z + q.w * q.x)
				};
				const st = state();
				const cosine = (nose.x * st.air.x + nose.y * st.air.y + nose.z * st.air.z) / st.speed;
				worstAoa = Math.max(worstAoa, Math.acos(Math.min(1, cosine)));
			}
		}
		const end = state();
		const glide = path / (energy(start) - energy(end));
		expect(Math.abs(glide / predicted - 1)).toBeLessThan(0.15);
		// It is flying, not tumbling: the nose stays within 12 degrees of the air velocity.
		expect(worstAoa).toBeLessThan((12 * Math.PI) / 180);
		expect(end.radius).toBeLessThan(start.radius);
		sim.dispose();
	});

	test('wings without incidence give no lift: the same craft falls with gravity', async () => {
		const { sim, state } = await fly(200, 0, 3_000, 0);
		const before = { ...state().s.velocity };
		for (let i = 0; i < 50; i++) sim.step(0.02);
		const after = state().s.velocity;
		const g = 3.5316e12 / (RADIUS + 3_000) ** 2;
		expect(Math.abs((after.x - before.x) / 1 + g)).toBeLessThan(0.1 * g);
		sim.dispose();
	});
});
