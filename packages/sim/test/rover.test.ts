/** Plan 307: a rover drives forward and back on the wheel throttle, its motors on from the start. */
import { describe, expect, test } from 'bun:test';
import { partId, type VesselDesign } from '@orbital/core';
import { newSim } from './helpers/vessels.ts';

const FLAT = { maxHeight: 0, heightAt: () => 0 };
/** Under the deck's bottom face, 0.6 m either side of the middle (the deck is 1.6 × 0.35 m). */
const SIDE = Math.atan2(0.175, 0.6);

export function testRover(): VesselDesign {
	const wheel = (index: number, part: string, angle: number, y: number) => ({
		index,
		part: partId(part),
		parent: { index: 0, parentNode: 'surface', node: 'radial', radial: { angle, y } }
	});
	return {
		formatVersion: 4,
		name: 'Test rover',
		aircraft: true,
		parts: [
			{ index: 0, part: partId('stock.rover-chassis'), parent: null },
			{
				index: 1,
				part: partId('stock.probe-core'),
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			},
			wheel(2, 'stock.rover-wheel-m-steer', SIDE, 1),
			wheel(3, 'stock.rover-wheel-m-steer', Math.PI - SIDE, 1),
			wheel(4, 'stock.rover-wheel-m', SIDE, -1),
			wheel(5, 'stock.rover-wheel-m', Math.PI - SIDE, -1)
		],
		stages: []
	};
}

describe('rover (plan 307)', () => {
	test('wheel throttle 1 drives it north, -1 brings it back', async () => {
		const sim = await newSim({ terrain: FLAT });
		const r = sim.dispatch({
			type: 'load-vessel',
			design: testRover(),
			placement: { kind: 'surface' }
		});
		if (!r.ok) throw new Error(r.reason);
		const id = r.vessel!;
		const north = () => sim.snapshot().vessels.find((v) => v.id === id)!.position.y;
		const run = (s: number) => {
			for (let i = 0; i < s / 0.02; i++) sim.step(0.02);
		};
		run(3);
		const start = north();
		expect(sim.dispatch({ type: 'wheel-throttle', vessel: id, value: 1 }).ok).toBe(true);
		run(6);
		const ahead = north() - start;
		expect(ahead).toBeGreaterThan(3);
		expect(sim.dispatch({ type: 'wheel-throttle', vessel: id, value: -1 }).ok).toBe(true);
		run(12);
		expect(north() - start).toBeLessThan(ahead - 3);
		sim.dispose();
	}, 120_000);
});
