/**
 * Plan 391 (ADR 0337), C5: a ground tile touches only its own vessel. A stands on the flank of a
 * sharp crest; B lands on the crest 80 m away, and the plane fitted under B (12 m above A's ground)
 * must not lift A.
 */
import { expect, test } from 'bun:test';
import type { TerrainField } from '@orbital/core';
import { length } from '@orbital/kepler';
import { groundRelativeVelocity } from './helpers/ground.ts';
import { RADIUS } from './helpers/measure.ts';
import { newSim, stack } from './helpers/vessels.ts';

/** A 20 m crest, 60 m wide (Gaussian), peak at longitude 0 on the equator. */
const crest: TerrainField = {
	maxHeight: 20,
	heightAt(n) {
		const lon = Math.atan2(-n.z, n.x);
		const lat = Math.asin(Math.max(-1, Math.min(1, n.y)));
		const east = lon * RADIUS;
		const north = lat * RADIUS;
		return 20 * Math.exp(-(east * east + north * north) / (2 * 60 * 60));
	}
};
const at = (metres: number) => ({
	kind: 'surface' as const,
	latitude: 0,
	longitude: metres / RADIUS
});
const pod = (name: string) => stack(name, ['stock.command-pod'], []);

test('a plane fitted under a neighbour 80 m away does not lift or shove the vessel standing on its own ground', async () => {
	const sim = await newSim({ terrain: crest, maxFlightFrames: 1 });
	try {
		const a = sim.dispatch({ type: 'load-vessel', design: pod('A'), placement: at(80) });
		if (!a.ok) throw new Error(a.reason);
		const only = () => sim.snapshot().vessels.find((v) => v.id === a.vessel)!;
		for (let i = 0; i < 25; i++) sim.step(0.02); // settled on its own tile, not yet on rails
		const before = only();
		const radial = (v: ReturnType<typeof only>) => length(v.position);
		const b = sim.dispatch({ type: 'load-vessel', design: pod('B'), placement: at(0) });
		if (!b.ok) throw new Error(b.reason);
		let worst = 0;
		for (let i = 0; i < 50; i++) {
			sim.step(0.02);
			const v = only();
			worst = Math.max(worst, length(groundRelativeVelocity(v)));
		}
		expect(worst).toBeLessThan(0.05);
		expect(Math.abs(radial(only()) - radial(before))).toBeLessThan(0.05);
	} finally {
		sim.dispose();
	}
}, 60_000);
