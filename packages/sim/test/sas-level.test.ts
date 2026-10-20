/** Plan 260: the assist level of the control parts limits which SAS modes the vessel accepts. */
import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import { newSim, twoStage } from './helpers/vessels.ts';

async function withLevel(level: number | undefined) {
	const sim = await newSim();
	const design = twoStage();
	if (level !== undefined) {
		design.parts[0] = { ...design.parts[0]!, settings: { 'stock.command': { sasLevel: level } } };
	}
	const r = sim.dispatch({ type: 'load-vessel', design });
	if (!r.ok) throw new Error(r.reason);
	return { sim, id: r.vessel as EntityId };
}

describe('SAS level (plan 260)', () => {
	test('a full assist part accepts every mode', async () => {
		const { sim, id } = await withLevel(undefined);
		for (const mode of ['hold', 'prograde', 'normal', 'maneuver', 'target'] as const)
			expect(sim.dispatch({ type: 'sas', vessel: id, mode }).ok).toBe(true);
		sim.dispose();
	});

	test('a basic part holds and points prograde but refuses the burn and target modes', async () => {
		const { sim, id } = await withLevel(1);
		expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'hold' }).ok).toBe(true);
		expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde' }).ok).toBe(true);
		const normal = sim.dispatch({ type: 'sas', vessel: id, mode: 'normal' });
		expect(normal).toMatchObject({ ok: false, reason: expect.stringContaining('basic assist') });
		expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'maneuver' }).ok).toBe(false);
		sim.dispose();
	});

	test('level 0 allows hold only', async () => {
		const { sim, id } = await withLevel(0);
		expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'hold' }).ok).toBe(true);
		expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde' }).ok).toBe(false);
		sim.dispose();
	});
});
