/**
 * The mission blueprints in a headless sim (plans 307, 309): what each is for, it does. Short runs
 * only; the full flights are the players'.
 */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { MISSION_BLUEPRINTS } from './missions';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const blueprint = (id: string) => MISSION_BLUEPRINTS.find((m) => m.id === id)!.build(content);

async function launch(id: string): Promise<{ sim: Sim; vessel: number }> {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1
	});
	const r = sim.dispatch({ type: 'load-vessel', design: blueprint(id) });
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return { sim, vessel: Number(r.vessel) };
}

/** Home's day, s (the aeroplane test's figure). */
const DAY = 21_600;

const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};

describe('mission flights (plans 307, 309)', () => {
	it('Trailblazer Rover drives off the pad on its wheel throttle', async () => {
		const { sim, vessel } = await launch('trailblazer-rover');
		try {
			const at = () => sim.snapshot().vessels.find((v) => Number(v.id) === vessel)!;
			run(sim, 3);
			const start = at();
			const parts = start.parts.length;
			expect(sim.dispatch({ type: 'wheel-throttle', vessel: start.id, value: 1 }).ok).toBe(true);
			run(sim, 8);
			const end = at();
			// against the ground under the start, which turned with the planet meanwhile (about +Y)
			const a = (2 * Math.PI * 8) / DAY;
			const p = start.position;
			const ground = {
				x: p.x * Math.cos(a) + p.z * Math.sin(a),
				y: p.y,
				z: -p.x * Math.sin(a) + p.z * Math.cos(a)
			};
			const moved = Math.hypot(
				end.position.x - ground.x,
				end.position.y - ground.y,
				end.position.z - ground.z
			);
			expect(moved).toBeGreaterThan(10);
			expect(moved).toBeLessThan(12 * 8); // the wheels' top speed: so the planet's turn is out
			expect(end.parts.length).toBe(parts);
		} finally {
			sim.dispose();
		}
	}, 120_000);
});
