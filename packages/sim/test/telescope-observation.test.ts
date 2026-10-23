/**
 * Plan 298 (ADR 0331): in a real sim, the telescope's observation needs its aperture door open and
 * its tube within 5° of the body it orbits; the sim answers the module's `sibling` and
 * `targetDirection` from the part and the vessel's attitude.
 */
import { describe, expect, test } from 'bun:test';
import type { EntityId, VesselDesign } from '@orbital/core';
import type { Sim } from '../src/index.ts';
import { newSim } from './helpers/vessels.ts';

const R = 600_000;
const design: VesselDesign = {
	formatVersion: 4,
	name: 'Spyglass',
	parts: [
		{ index: 0, part: 'stock.telescope' as never, parent: null },
		{
			index: 1,
			part: 'stock.probe-core' as never,
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		}
	],
	stages: []
};

/** A circular orbit at 300 km (space high), the tube `off` degrees from straight down. */
async function orbit(off: number): Promise<{ sim: Sim; id: EntityId }> {
	const sim = await newSim();
	const mu = sim.registries.bodies.get('stock.home')!.mass * 6.6743e-11;
	const r = R + 300_000;
	const a = ((90 - off) * Math.PI) / 180;
	const placed = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: {
			kind: 'state',
			body: 'stock.home',
			position: { x: r, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: -Math.sqrt(mu / r) },
			// the telescope's +Y turned from up (+X) to straight down (-X): 90° about Z
			orientation: { x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }
		}
	} as never);
	if (!placed.ok || placed.vessel === undefined)
		throw new Error(placed.ok ? 'no vessel' : placed.reason);
	return { sim, id: placed.vessel };
}
const part = (sim: Sim, id: EntityId) =>
	sim
		.snapshot()
		.vessels.find((v) => v.id === id)!
		.parts.find((p) => p.definition === 'stock.telescope')!;
const act = (sim: Sim, id: EntityId, module: string, action: string) =>
	sim.dispatch({ type: 'action', vessel: id, part: part(sim, id).id, module, action } as never);
const status = (sim: Sim, id: EntityId) =>
	part(sim, id).modules['stock.experiment'] as {
		status: string;
		reason: string | null;
		progress: number;
	};

describe('the telescope observation in a sim (plan 298)', () => {
	test('door shut: refused; door open and pointing at the planet: runs and yields a result', async () => {
		const { sim, id } = await orbit(0);
		try {
			expect(sim.snapshot().vessels.find((v) => v.id === id)!.science?.situation).toBe(
				'stock.space-high'
			);
			act(sim, id, 'stock.experiment', 'run');
			expect(status(sim, id)).toMatchObject({ status: 'INVALID' });
			expect(status(sim, id).reason).toMatch(/door is closed/);
			act(sim, id, 'stock.animate', 'open');
			act(sim, id, 'stock.experiment', 'run');
			expect(status(sim, id).status).toBe('RUNNING');
			for (let i = 0; i < 32 / 0.02; i++) sim.step(0.02);
			expect(status(sim, id).status).toBe('READY');
		} finally {
			sim.dispose();
		}
	}, 60_000);

	test('door open, tube 10° off: refused; 4° off: runs', async () => {
		for (const [off, ok] of [
			[10, false],
			[4, true]
		] as const) {
			const { sim, id } = await orbit(off);
			try {
				act(sim, id, 'stock.animate', 'open');
				act(sim, id, 'stock.experiment', 'run');
				const s = status(sim, id);
				expect(s.status, `${off}° off: ${s.reason}`).toBe(ok ? 'RUNNING' : 'INVALID');
				if (!ok) expect(s.reason).toMatch(/off its target/);
			} finally {
				sim.dispose();
			}
		}
	}, 60_000);
});
