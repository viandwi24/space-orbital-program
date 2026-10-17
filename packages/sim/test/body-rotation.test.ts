/** A body's orientation as pole times spin (plan 085, ADR 0145): a tilted home planet. */
import { describe, expect, test } from 'bun:test';
import {
	bodyAngularVelocity,
	bodyOrientation,
	bodyPole,
	type Quat,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import { definePatch, definePlugin } from '@orbital/sdk';
import Stock from '@orbital/mod-stock';
import { cross, length, sub } from '@orbital/kepler';
import { createSim } from '../src/index.ts';
import { rotateBy } from './helpers/ground.ts';
import { rapier, twoStage } from './helpers/vessels.ts';

const DEG = Math.PI / 180;
const DAY = 21_600;
/** The Earth's obliquity: the pole leans 23.44 degrees from +Y, towards +X. */
const TILT = 23.44 * DEG;

const Tilt = definePlugin({
	meta: { id: 'test.tilt', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.patches.register(
			definePatch({
				id: 'test.tilt.home',
				target: 'body',
				select: { id: 'stock.home' },
				ops: [{ op: 'set', path: 'rotation', value: { pole: { ra: 0, dec: Math.PI / 2 - TILT } } }]
			})
		);
	}
});

const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

describe('pole times spin in core', () => {
	const home = { rotationPeriod: DAY };
	test('without rotation it is exactly the spin about +Y of before', () => {
		for (const t of [0, 1, 1234.5, 9e6]) {
			const w = ((2 * Math.PI) / DAY) * t;
			expect(bodyOrientation(home, t)).toEqual({
				x: 0,
				y: Math.sin(w / 2),
				z: 0,
				w: Math.cos(w / 2)
			});
			expect(bodyAngularVelocity(home, t)).toEqual({ x: 0, y: (2 * Math.PI) / DAY, z: 0 });
		}
	});

	test('a tilted pole: +Y goes to the pole, and the angular velocity lies along it', () => {
		const tilted = { rotationPeriod: DAY, rotation: { pole: { ra: 0, dec: Math.PI / 2 - TILT } } };
		const p = bodyPole(tilted);
		expect(p.x).toBeCloseTo(Math.sin(TILT), 12);
		expect(p.y).toBeCloseTo(Math.cos(TILT), 12);
		expect(p.z).toBeCloseTo(0, 12);
		const north = rotateBy(bodyOrientation(tilted, 777), { x: 0, y: 1, z: 0 });
		expect(length(sub(north, p))).toBeLessThan(1e-12);
		const w = bodyAngularVelocity(tilted, 777);
		expect(length(cross(w, p))).toBeLessThan(1e-15);
		expect(length(w)).toBeCloseTo((2 * Math.PI) / DAY, 15);
	});

	test('periodic terms and a start angle move W, and its rate follows', () => {
		const wobble = {
			rotationPeriod: DAY,
			rotation: { w0: 0.3, periodic: [{ amplitude: 0.01, rate: 1e-3, phase: 0 }] }
		};
		const q = bodyOrientation(wobble, 0);
		expect(2 * Math.atan2(q.y, q.w)).toBeCloseTo(0.3, 12);
		expect(bodyAngularVelocity(wobble, 0).y).toBeCloseTo((2 * Math.PI) / DAY + 1e-5, 15);
	});
});

describe('a home planet tilted 23.44 degrees', () => {
	async function padSim() {
		const sim = await createSim({ plugins: [Stock, Tilt], backendFactory: rapier(16), seed: 1 });
		const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!loaded.ok) throw new Error(loaded.reason);
		return sim;
	}
	const vesselOf = (sim: Awaited<ReturnType<typeof padSim>>): VesselSnapshot =>
		sim.snapshot().vessels[0]!;
	/** Body-fixed position of the vessel's root (undoes the tilted body's rotation). */
	const bodyFixed = (sim: Awaited<ReturnType<typeof padSim>>): Vec3 =>
		rotateBy(
			conj(sim.snapshot().bodies.find((b) => b.id === sim.home)!.rotation),
			vesselOf(sim).position
		);

	test('the patch tilts the sim body: its pole and its spin', async () => {
		const sim = await padSim();
		const rotation = sim.snapshot().bodies.find((b) => b.id === sim.home)!.rotation;
		const north = rotateBy(rotation, { x: 0, y: 1, z: 0 });
		expect(north.x).toBeCloseTo(Math.sin(TILT), 9);
		sim.dispose();
	});

	test('a vessel loaded on the pad stands: no slide over 10 s', async () => {
		const sim = await padSim();
		const start = bodyFixed(sim);
		for (let i = 0; i < 500; i++) sim.step(0.02);
		const moved = length(sub(bodyFixed(sim), start));
		expect(moved).toBeLessThan(0.05);
		// upright: the vessel's +Y along the local vertical
		const v = vesselOf(sim);
		const up = rotateBy(v.orientation, { x: 0, y: 1, z: 0 });
		const radial = v.position;
		const cos = (up.x * radial.x + up.y * radial.y + up.z * radial.z) / length(radial);
		expect(cos).toBeGreaterThan(Math.cos(1 * DEG));
		sim.dispose();
	});

	test('on surface rails for 10 game days the vessel stays within 1e-6 m of its body-fixed place', async () => {
		const sim = await padSim();
		for (let i = 0; i < 250 && vesselOf(sim).mode !== 'on-rails'; i++) sim.step(0.02);
		expect(vesselOf(sim).mode).toBe('on-rails');
		const start = bodyFixed(sim);
		const target = sim.snapshot().t + 10 * DAY;
		expect(sim.dispatch({ type: 'warp-to', time: target, factor: 100_000 }).ok).toBe(true);
		for (let i = 0; i < 10_000 && sim.snapshot().t < target - 1e-6; i++) sim.step(0.1);
		expect(sim.snapshot().t).toBeGreaterThanOrEqual(target - 1e-6);
		expect(vesselOf(sim).mode).toBe('on-rails');
		expect(length(sub(bodyFixed(sim), start))).toBeLessThan(1e-6);
		sim.dispose();
	});
});
