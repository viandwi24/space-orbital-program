/**
 * Plan 283 (ADR 0354): a rover's wheels ride on a spring and damper. A rover placed sunk into the
 * ground (its hubs touching) is pushed up by the springs, rebounds only a little and settles at a
 * steady ride height on its springs, every wheel compressed part of its travel.
 */
import { describe, expect, test } from 'bun:test';
import { length } from '@orbital/kepler';
import { newSim } from './helpers/vessels.ts';
import { testRover } from './rover.test.ts';

const FLAT = { maxHeight: 0, heightAt: () => 0 };

describe('wheel suspension (plan 283)', () => {
	test('the springs lift the rover off its hubs, it rebounds little and settles steady on them', async () => {
		const sim = await newSim({ terrain: FLAT });
		const r = sim.dispatch({
			type: 'load-vessel',
			design: testRover(),
			placement: { kind: 'surface' }
		});
		if (!r.ok) throw new Error(r.reason);
		const body = sim.registries.bodies.get('stock.home')!;
		const vessel = () => sim.snapshot().vessels.find((v) => v.id === r.vessel)!;
		const height = () => length(vessel().position) - body.radius;
		const compressions = () =>
			vessel()
				.parts.filter((p) => p.definition.startsWith('stock.rover-wheel'))
				.map((p) => (p.modules['stock.wheel'] as { compression?: number }).compression ?? 0);
		const start = height();
		let peak = start;
		for (let i = 0; i < 150; i++) {
			sim.step(0.02);
			peak = Math.max(peak, height());
		}
		const rest = height();
		const samples: number[] = [];
		for (let i = 0; i < 100; i++) {
			sim.step(0.02);
			samples.push(height());
		}
		const spread = Math.max(...samples) - Math.min(...samples);
		// lifted well off the hubs; the rebound over the rest height is under a quarter of the lift
		expect(rest).toBeGreaterThan(start + 0.3);
		expect(peak - rest).toBeLessThan(0.25 * (rest - start));
		expect(spread).toBeLessThan(0.003);
		for (const c of compressions()) {
			expect(c).toBeGreaterThan(0.2);
			expect(c).toBeLessThan(0.95);
		}
		sim.dispose();
	}, 120_000);
});
