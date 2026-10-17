import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { scriptBodyState } from './script-body-state';

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
	Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('bodies[id].state for scripts', () => {
	it('equals the sim body positions at the sim time and after a warp, and the speed is the numerical one', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			maxFlightFrames: 1
		});
		try {
			const provider = scriptBodyState(sim.registries.bodies.list());
			const at = (t: number) => provider('stock.cinder', t, 'system');
			const simMoon = () => sim.snapshot().bodies.find((b) => b.id === 'stock.cinder')!.position;
			expect(dist(at(sim.time).position, simMoon())).toBeLessThan(1e-3);
			// Run the clock 40 000 s on rails (no vessel, so no flight frame): the moon moved far.
			sim.dispatch({ type: 'warp-to', time: 40_000, factor: 100_000 });
			for (let i = 0; i < 60 && sim.time < 40_000 - 1e-9; i++) sim.step(1);
			expect(sim.time).toBeCloseTo(40_000, 6);
			expect(dist(at(sim.time).position, simMoon())).toBeLessThan(1e-3);
			const dt = 1;
			const numeric = dist(at(40_000 + dt).position, at(40_000 - dt).position) / (2 * dt);
			expect(Math.abs(numeric - Math.hypot(...Object.values(at(40_000).velocity)))).toBeLessThan(
				1e-3
			);
			// The root rests; the moon in its parent's frame is the same as in the system frame here.
			expect(provider('stock.home', 123, 'system').position).toEqual({ x: 0, y: 0, z: 0 });
			expect(dist(provider('stock.cinder', 500, 'parent').position, at(500).position)).toBeLessThan(
				1e-6
			);
		} finally {
			sim.dispose();
		}
	}, 30_000);

	it('refuses an unknown body, a bad time and a bad frame', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			maxFlightFrames: 1
		});
		try {
			const provider = scriptBodyState(sim.registries.bodies.list());
			expect(() => provider('stock.nowhere', 0, 'parent')).toThrow(/unknown body/);
			expect(() => provider('stock.cinder', Number.NaN, 'parent')).toThrow(RangeError);
			expect(() => provider('stock.cinder', 0, 'sun' as never)).toThrow(RangeError);
		} finally {
			sim.dispose();
		}
	});
});
