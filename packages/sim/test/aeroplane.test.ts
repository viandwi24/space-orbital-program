/**
 * Aeroplanes (plan 063, ADR 0161): tyres from the ground contacts, a level start on the runway,
 * take-off at the hand-calculated speed, gentle and hard touchdowns, trim, level wings, flaps.
 */
import { describe, expect, test } from 'bun:test';
import { partId, type EntityId, type VesselDesign } from '@orbital/core';
import { wingCoefficients, wingConfigSchema, wingLiftSlope } from '@orbital/mod-stock';
import type { Sim } from '../src/index.ts';
import { VESSEL } from '../src/state.ts';
import { vesselMass } from './helpers/measure.ts';
import { newSim } from './helpers/vessels.ts';

const FLAT = { maxHeight: 0, heightAt: () => 0 };
const R = 600_000;
const G0 = 3.5316e12 / (R * R);
const INCIDENCE = 0.15;
/** Tailplane incidence, rad: trims the craft level at its cruise (journal 063). */
const TAIL = 0.04;
/** Nose (+Y) north and +Z up at longitude 0 on the equator: a quarter turn about +Y. */
const LEVEL_NORTH = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };

/**
 * Pod, medium tank and engine lying level (nose = pod, +Z up): two pairs of wings ahead of the
 * centre of mass tilted by `INCIDENCE`, a tailplane at the tank's foot at `TAIL` (a stable craft,
 * trimmed level), a steering pair of wheels forward and a main pair behind, spread wide (no wingtip
 * touches the ground in a roll).
 */
export function testPlane(surfaces = true): VesselDesign {
	const radial = (index: number, part: string, angle: number, y: number) => ({
		index,
		part: partId(part),
		parent: { index: 1, parentNode: 'surface', node: 'radial', radial: { angle, y } }
	});
	const wing = (index: number, angle: number, y: number, tilt: number, symmetry: number) => ({
		...radial(index, 'stock.wing', angle, y),
		tilt: { x: tilt, y: 0, z: 0 },
		symmetry
	});
	const SPREAD = 0.9;
	return {
		formatVersion: 3,
		name: 'Test plane',
		aircraft: true,
		parts: [
			{ index: 0, part: partId('stock.command-pod'), parent: null },
			{
				index: 1,
				part: partId('stock.tank-medium'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 2,
				// the 0.5 t cluster since plan 380: the realistic LV-T30 is light, and the plane trimmed
				// nose-down with its mass forward (ADR 0317)
				part: partId('stock.engine-cluster'),
				parent: { index: 1, parentNode: 'bottom', node: 'top' }
			},
			// and the heat shield under it as tail ballast (0.38 t): together about the old engine's mass
			{
				index: 30,
				part: partId('stock.heat-shield'),
				parent: { index: 2, parentNode: 'bottom', node: 'top' }
			},
			wing(3, 0, 0.3, INCIDENCE, 1),
			wing(4, Math.PI, 0.3, INCIDENCE, 1),
			wing(5, 0, -0.7, INCIDENCE, 2),
			wing(6, Math.PI, -0.7, INCIDENCE, 2),
			wing(7, 0, -1.6, TAIL, 3),
			wing(8, Math.PI, -1.6, TAIL, 3),
			radial(9, 'stock.wheel-steer', Math.PI / 2 + SPREAD, 1.5),
			radial(10, 'stock.wheel-steer', Math.PI / 2 - SPREAD, 1.5),
			radial(11, 'stock.wheel', Math.PI / 2 + SPREAD, -0.6),
			radial(12, 'stock.wheel', Math.PI / 2 - SPREAD, -0.6),
			// elevators either side and a fin on top, at the tail
			...(surfaces
				? [
						radial(13, 'stock.control-surface', 0, -1.0),
						radial(14, 'stock.control-surface', Math.PI, -1.0),
						radial(15, 'stock.control-surface', (3 * Math.PI) / 2, -1.6)
					]
				: [])
		],
		stages: [[2]]
	};
}

async function onRunway(surfaces = true): Promise<{ sim: Sim; id: EntityId }> {
	const sim = await newSim({ terrain: FLAT });
	const r = sim.dispatch({
		type: 'load-vessel',
		design: testPlane(surfaces),
		placement: { kind: 'surface' }
	});
	if (!r.ok) throw new Error(r.reason);
	return { sim, id: r.vessel! };
}

const run = (sim: Sim, seconds: number, each?: () => void) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) {
		sim.step(0.02);
		each?.();
	}
};
const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
/** Ground speed (relative to the turning surface) and its components along north and east. */
function ground(sim: Sim, id: EntityId) {
	const v = vesselOf(sim, id);
	const omega = (2 * Math.PI) / 21_600;
	const surface = {
		x: v.velocity.x - omega * v.position.z,
		y: v.velocity.y,
		z: v.velocity.z + omega * v.position.x
	};
	const up = normal(v.position);
	const along = surface.x * 0 + surface.y; // north is +Y at the equator
	const speed = Math.hypot(
		surface.x - up.x * dot(surface, up),
		surface.y - up.y * dot(surface, up),
		surface.z - up.z * dot(surface, up)
	);
	return { speed, north: along, height: Math.hypot(v.position.x, v.position.y, v.position.z) - R };
}
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
	a.x * b.x + a.y * b.y + a.z * b.z;
const normal = (p: { x: number; y: number; z: number }) => {
	const n = Math.hypot(p.x, p.y, p.z);
	return { x: p.x / n, y: p.y / n, z: p.z / n };
};
const parts = (sim: Sim, id: EntityId) => vesselOf(sim, id).parts.length;

describe('aeroplanes (plan 063)', () => {
	test('an aircraft starts level on its wheels, nose north, and stays put', async () => {
		const { sim, id } = await onRunway();
		run(sim, 3);
		const v = vesselOf(sim, id);
		// the nose (+Y of the root) points north (+Y at the equator, longitude 0)
		const q = v.orientation;
		const noseY = 1 - 2 * (q.x * q.x + q.z * q.z);
		expect(noseY).toBeGreaterThan(0.99);
		expect(ground(sim, id).speed).toBeLessThan(0.05);
		expect(parts(sim, id)).toBe(17); // 16 and the tail ballast (plan 380)
		sim.dispose();
	}, 60_000);

	test('it coasts down at the rolling resistance, holds its line, and stops sooner with brakes', async () => {
		const coast = async (brakes: boolean) => {
			const { sim, id } = await onRunway();
			run(sim, 1);
			sim.dispatch({ type: 'stage', vessel: id });
			sim.dispatch({ type: 'throttle', vessel: id, value: 0.05 });
			let t = 0;
			while (ground(sim, id).speed < 6 && t < 30) {
				run(sim, 0.02);
				t += 0.02;
			}
			sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
			if (brakes)
				sim.dispatch({
					type: 'action-group',
					vessel: id,
					group: 'stock.brakes',
					value: true
				} as never);
			const v0 = ground(sim, id).speed;
			run(sim, 1);
			const v1 = ground(sim, id).speed;
			const result = {
				decel: v0 - v1,
				v1,
				line: Math.abs(ground(sim, id).north) / Math.max(ground(sim, id).speed, 1e-9)
			};
			sim.dispose();
			return result;
		};
		const free = await coast(false);
		// rolling resistance 0.02 g (air drag at 6 m/s is under 3 percent of it)
		expect(Math.abs(free.decel - 0.02 * G0) / (0.02 * G0)).toBeLessThan(0.15);
		// it keeps rolling along its nose (north), not sideways
		expect(free.line).toBeGreaterThan(0.99);
		const braked = await coast(true);
		expect(braked.v1).toBeLessThan(free.v1 - 2);
	}, 120_000);

	test('it lifts off where lift and the tilted thrust carry its weight at its attitude, after v² / 2a', async () => {
		// wings only: the hand calculation below counts the wings (the elevators would add tail lift)
		const { sim, id } = await onRunway(false);
		run(sim, 1);
		const pitchOf = () => {
			const q = vesselOf(sim, id).orientation;
			// the nose (+Y) against the local up (+X at longitude 0, the equator)
			return Math.asin(2 * (q.x * q.y - q.z * q.w));
		};
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 0.6 });
		const wing = wingConfigSchema.parse({
			area: 3,
			aspectRatio: 6,
			flapLift: 0.6,
			flapDrag: 0.05,
			flapStall: 3
		});
		let t = 0;
		let distance = 0;
		let early = 0;
		type Moment = { t: number; speed: number; distance: number; pitch: number };
		let liftoff: Moment | null = null;
		let off: Moment | null = null;
		while (t < 40 && !liftoff) {
			run(sim, 0.02);
			t += 0.02;
			const g = ground(sim, id);
			if (Math.abs(t - 1) < 0.01) early = g.speed;
			distance += g.speed * 0.02;
			// lift-off: the wheels leave the ground and stay off for half a second
			const landed = sim.world.get(id, VESSEL)?.landed === true;
			if (landed) off = null;
			else off ??= { t, speed: g.speed, distance, pitch: pitchOf() };
			if (off && t - off.t >= 0.5) liftoff = off;
		}
		expect(liftoff).not.toBeNull();
		const mass = vesselMass(sim, vesselOf(sim, id));
		// the thrust from the first second's acceleration (rolling resistance added back)
		const thrust = mass * (early / 1 + 0.02 * G0);
		// hand calculation: the four main wings at incidence plus attitude and the two tail wings at
		// theirs, with the thrust's upward part, carry the weight
		const slope = wingLiftSlope(wing);
		const liftArea =
			(4 * slope * (INCIDENCE + liftoff!.pitch) + 2 * slope * (TAIL + liftoff!.pitch)) * wing.area;
		const vHand = Math.sqrt(
			(2 * (mass * G0 - thrust * Math.sin(liftoff!.pitch))) / (1.225 * liftArea)
		);
		console.log(
			`lift-off ${liftoff!.speed.toFixed(1)} m/s after ${liftoff!.distance.toFixed(0)} m and ${liftoff!.t.toFixed(1)} s at ${((liftoff!.pitch * 180) / Math.PI).toFixed(1)} deg; hand ${vHand.toFixed(1)} m/s (mass ${mass.toFixed(0)} kg, thrust ${(thrust / 1000).toFixed(1)} kN)`
		);
		expect(Math.abs(liftoff!.speed - vHand) / vHand).toBeLessThan(0.1);
		const a = liftoff!.speed / liftoff!.t;
		expect(
			Math.abs(liftoff!.distance - liftoff!.speed ** 2 / (2 * a)) / liftoff!.distance
		).toBeLessThan(0.2);
		sim.dispose();
	}, 120_000);

	test('a 2 m/s touchdown on the wheels breaks nothing; 8 m/s breaks a wheel', async () => {
		const touchdown = async (sink: number) => {
			const sim = await newSim({ terrain: FLAT });
			// level, 0.5 m above the wheels' resting height, moving with the ground and sinking
			const omega = (2 * Math.PI) / 21_600;
			const h = R + 1.04 + 0.5;
			const r = sim.dispatch({
				type: 'load-vessel',
				design: testPlane(),
				placement: {
					kind: 'state',
					body: 'stock.home',
					position: { x: h, y: 0, z: 0 },
					velocity: { x: -sink, y: 0, z: -omega * h },
					orientation: LEVEL_NORTH
				}
			} as never);
			if (!r.ok) throw new Error(r.reason);
			const broken: string[] = [];
			sim.events.on('part:damaged', (e) => broken.push(e.definition));
			run(sim, 3);
			sim.dispose();
			return broken;
		};
		expect(await touchdown(2)).toEqual([]);
		expect(await touchdown(8)).toContain('stock.wheel');
	}, 120_000);

	test('level wings brings a banked, nose-down craft back to level within 45 s and holds it to 60 s; trim pitches the nose', async () => {
		const h = R + 3_000;
		const omega = (2 * Math.PI) / 21_600;
		/** LEVEL_NORTH turned 20 degrees about the nose and 8 degrees nose up. */
		const half = (a: number) => [Math.cos(a / 2), Math.sin(a / 2)] as const;
		const mul = (p: Q, q: Q): Q => ({
			w: p.w * q.w - p.x * q.x - p.y * q.y - p.z * q.z,
			x: p.w * q.x + p.x * q.w + p.y * q.z - p.z * q.y,
			y: p.w * q.y - p.x * q.z + p.y * q.w + p.z * q.x,
			z: p.w * q.z + p.x * q.y - p.y * q.x + p.z * q.w
		});
		type Q = { x: number; y: number; z: number; w: number };
		const [cr, sr] = half((20 * Math.PI) / 180);
		const [cp, sp] = half((-8 * Math.PI) / 180);
		const disturbed = mul(mul(LEVEL_NORTH, { x: 0, y: sr, z: 0, w: cr }), {
			x: sp,
			y: 0,
			z: 0,
			w: cp
		});
		const fly = async (orientation: Q, sas: 'level' | 'off', trim = 0) => {
			const sim = await newSim({ terrain: FLAT });
			const r = sim.dispatch({
				type: 'load-vessel',
				design: testPlane(),
				placement: {
					kind: 'state',
					body: 'stock.home',
					position: { x: h, y: 0, z: 0 },
					velocity: { x: 0, y: 181, z: -omega * h },
					orientation
				}
			} as never);
			if (!r.ok) throw new Error(r.reason);
			const id = r.vessel!;
			expect(sim.dispatch({ type: 'sas', vessel: id, mode: sas })).toEqual({ ok: true });
			if (trim !== 0)
				expect(sim.dispatch({ type: 'trim', vessel: id, pitch: trim })).toEqual({ ok: true });
			return { sim, id };
		};
		/** Bank (the span against the horizon) and pitch (the nose against it), rad. */
		const attitude = (sim: Sim, id: EntityId) => {
			const v = vesselOf(sim, id);
			const q = v.orientation;
			const up = normal(v.position);
			const rot = (x: number, y: number, z: number) => {
				const ix = q.w * x + q.y * z - q.z * y;
				const iy = q.w * y + q.z * x - q.x * z;
				const iz = q.w * z + q.x * y - q.y * x;
				const iw = -q.x * x - q.y * y - q.z * z;
				return {
					x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
					y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
					z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
				};
			};
			return { bank: Math.asin(dot(rot(1, 0, 0), up)), pitch: Math.asin(dot(rot(0, 1, 0), up)) };
		};
		const { sim, id } = await fly(disturbed, 'level');
		const start = attitude(sim, id);
		expect(Math.abs(start.bank)).toBeGreaterThan(0.3);
		// 45 s to come back, then the wings stay level within 2 degrees and the nose within 6 of the
		// horizon to 60 s (the test plane's few small tail surfaces are what make it slow; 4, not 3,
		// since plan 212's colder, denser air aloft trims it about half a degree further; 6 since plan
		// 380: the heavier early-era tank moves its mass forward, and it trims nose-down 5.5)
		run(sim, 45);
		let bank = 0;
		let pitch = 0;
		for (let i = 0; i < 15; i++) {
			run(sim, 1);
			const a = attitude(sim, id);
			bank = Math.max(bank, Math.abs(a.bank));
			pitch = Math.max(pitch, Math.abs(a.pitch));
		}
		const deg = (r: number) => ((r * 180) / Math.PI).toFixed(2);
		console.log(
			`level: from bank ${deg(start.bank)} deg, worst bank ${deg(bank)} and pitch ${deg(pitch)} deg over 45 to 60 s`
		);
		expect(bank).toBeLessThan((2 * Math.PI) / 180);
		expect(pitch).toBeLessThan((6 * Math.PI) / 180);
		sim.dispose();
		// trim alone (no assist): nose-up trim raises the nose against nose-down trim
		const noseAfter = async (trim: number) => {
			const f = await fly(LEVEL_NORTH, 'off', trim);
			run(f.sim, 2);
			const pitch = attitude(f.sim, f.id).pitch;
			f.sim.dispose();
			return pitch;
		};
		const up = await noseAfter(0.3);
		const down = await noseAfter(-0.3);
		console.log(
			`trim: +0.3 gives ${((up * 180) / Math.PI).toFixed(1)} deg, -0.3 gives ${((down * 180) / Math.PI).toFixed(1)} deg`
		);
		expect(up).toBeGreaterThan(down + 0.02);
	}, 180_000);

	test('flaps lower the stall speed', () => {
		const wing = wingConfigSchema.parse({
			area: 3,
			aspectRatio: 6,
			flapLift: 0.6,
			flapDrag: 0.05,
			flapStall: 3
		});
		const peak = (flap: number) => {
			let best = 0;
			for (let a = 0; a < 0.5; a += 0.001)
				best = Math.max(best, wingCoefficients(wing, a, flap).cl);
			return best;
		};
		const ratio = Math.sqrt(peak(0) / peak(1));
		expect(peak(1)).toBeGreaterThan(peak(0));
		// stall speed goes with 1 / sqrt(CL max)
		expect(ratio).toBeLessThan(0.95);
	});
});
