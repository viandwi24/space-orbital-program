/**
 * Plan 391 (ADR 0337), C4: the ground under a vessel is the real terrain over its whole footprint,
 * not the tangent plane at its centre of mass. A rover with its front wheels over a bump rides
 * up on it instead of sinking into it.
 */
import { expect, test } from 'bun:test';
import type { TerrainField, Vec3 } from '@orbital/core';
import { length } from '@orbital/kepler';
import { qConj } from '../src/math.ts';
import { rotateBy } from './helpers/ground.ts';
import { RADIUS } from './helpers/measure.ts';
import { newSim } from './helpers/vessels.ts';
import { testRover } from './rover.test.ts';

/** A bump `height` m high, 3 m wide (Gaussian), 1.5 m north of the rover's middle: under its front wheels. */
const bumpOf = (height: number): TerrainField => ({
	maxHeight: 2,
	heightAt(n) {
		const lon = Math.atan2(-n.z, n.x);
		const lat = Math.asin(Math.max(-1, Math.min(1, n.y)));
		const east = lon * RADIUS;
		const north = lat * RADIUS - 1.5;
		return height * Math.exp(-(east * east + north * north) / (2 * 1.5 * 1.5));
	}
});

/** Height of the wheel hubs over the terrain under each, after the rover has settled. */
async function wheelClearances(terrain: TerrainField): Promise<number[]> {
	const sim = await newSim({ terrain });
	try {
		const r = sim.dispatch({
			type: 'load-vessel',
			design: testRover(),
			placement: { kind: 'surface' }
		});
		if (!r.ok) throw new Error(r.reason);
		for (let i = 0; i < 300; i++) sim.step(0.02);
		const v = sim.snapshot().vessels.find((x) => x.id === r.vessel)!;
		const turn = sim.snapshot().bodies.find((b) => b.id === sim.home)!.rotation;
		const clearance = (p: Vec3): number => {
			const n = rotateBy(qConj(turn), {
				x: p.x / length(p),
				y: p.y / length(p),
				z: p.z / length(p)
			});
			return length(p) - RADIUS - terrain.heightAt(n);
		};
		return v.parts
			.filter((p) => p.definition.startsWith('stock.rover-wheel'))
			.map((p) =>
				clearance({
					x: v.position.x + p.position.x,
					y: v.position.y + p.position.y,
					z: v.position.z + p.position.z
				})
			);
	} finally {
		sim.dispose();
	}
}

test('a rover with its front wheels on a bump rides up on it: no wheel hub lower over the terrain than on flat ground', async () => {
	const flat = await wheelClearances(bumpOf(0));
	expect(flat).toHaveLength(4);
	const over = await wheelClearances(bumpOf(1));
	expect(over).toHaveLength(4);
	// the single plane under the middle of the rover put the front wheels 0.4 m into the bump
	for (let i = 0; i < 4; i++) expect(over[i]!).toBeGreaterThan(Math.min(...flat) - 0.05);
}, 120_000);
