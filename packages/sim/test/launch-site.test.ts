import { describe, expect, test } from 'bun:test';
import type { Quat, Vec3 } from '@orbital/core';
import { rotateBy } from './helpers/ground.ts';
import { newSim, probe } from './helpers/vessels.ts';

/** Plan 025 item 1: `placeOnSurface` takes body-fixed latitude and longitude. */
type TestSim = Awaited<ReturnType<typeof newSim>>;

const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const run = (sim: TestSim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const bodyFixed = (sim: TestSim, position: Vec3): Vec3 =>
	rotateBy(conj(sim.snapshot().bodies.find((b) => b.id === sim.home)!.rotation), position);

/** Horizontal distance, m, of a body-fixed position from the vertical through (lat, lon). */
const lateralOffset = (
	sim: TestSim,
	position: Vec3,
	latitude: number,
	longitude: number
): number => {
	const p = bodyFixed(sim, position);
	const up: Vec3 = {
		x: Math.cos(latitude) * Math.cos(longitude),
		y: Math.sin(latitude),
		z: -Math.cos(latitude) * Math.sin(longitude)
	};
	const along = p.x * up.x + p.y * up.y + p.z * up.z;
	return Math.hypot(p.x - along * up.x, p.y - along * up.y, p.z - along * up.z);
};

describe('launch site coordinates', () => {
	for (const [label, bootSeconds] of [
		['at t = 0', 0],
		['after 1 s', 1],
		['after 37 s', 37]
	] as const) {
		for (const [lat, lon] of [
			[0, 0],
			[0.3, 1.2],
			[-0.6, -2.5]
		] as const) {
			test(`loaded ${label} at (${lat}, ${lon}) the vessel stands within 1 m horizontally of the body-fixed site`, async () => {
				const sim = await newSim();
				run(sim, bootSeconds);
				const loaded = sim.dispatch({
					type: 'load-vessel',
					design: probe(),
					placement: { kind: 'surface', latitude: lat, longitude: lon }
				});
				if (!loaded.ok) throw new Error(loaded.reason);
				const v = sim.snapshot().vessels[0]!;
				const lateral = lateralOffset(sim, v.position, lat, lon);
				expect(lateral).toBeLessThan(1);
			});
		}
	}

	test('the vessel co-rotates: the body-fixed position holds while the pad vessel rests', async () => {
		const sim = await newSim();
		run(sim, 5);
		sim.dispatch({ type: 'load-vessel', design: probe() });
		const before = bodyFixed(sim, sim.snapshot().vessels[0]!.position);
		run(sim, 3);
		const after = bodyFixed(sim, sim.snapshot().vessels[0]!.position);
		expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeLessThan(
			0.5
		);
	});
});
