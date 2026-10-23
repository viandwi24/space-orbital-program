/** Plan 358 (ADR 0333): a booster re-rooted on a radial decoupler still separates from the core. */
import { expect, test } from 'bun:test';
import {
	loadPlugins,
	partId,
	resolveVesselDesign,
	type EntityId,
	type VesselDesign
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { PART, VESSEL } from '../src/state.ts';
import { newSim } from './helpers/vessels.ts';

/** What the Root tool writes for `boosted(1)` rooted at its booster: the core hangs on the decoupler's `radial` node. */
const inverse = (): VesselDesign => ({
	formatVersion: 5,
	name: 'Booster first',
	parts: [
		{ index: 11, part: partId('stock.booster'), parent: null },
		{
			index: 7,
			part: partId('stock.radial-decoupler'),
			parent: { index: 11, parentNode: 'radial', node: 'outer' }
		},
		{
			index: 5,
			part: partId('stock.tank-small'),
			parent: {
				index: 7,
				parentNode: 'radial',
				node: 'surface',
				surface: { point: [0.625, 0, 0], normal: [1, 0, 0] }
			}
		},
		{
			index: 2,
			part: partId('stock.command-pod'),
			parent: { index: 5, parentNode: 'top', node: 'bottom' }
		},
		{
			index: 6,
			part: partId('stock.engine-lv'),
			parent: { index: 5, parentNode: 'bottom', node: 'top' }
		}
	],
	stages: [[6, 11], [7]]
});

test('a format 4 design still resolves and an inverse link needs format 5', async () => {
	const lookup = loadPlugins([Stock]).registries.parts;
	const ok = resolveVesselDesign(inverse(), lookup);
	expect(ok.ok).toBe(true);
	const old = resolveVesselDesign({ ...inverse(), formatVersion: 4 }, lookup);
	expect(old.ok).toBe(false);
	const stack = { ...inverse(), formatVersion: 4 as const, parts: inverse().parts.slice(0, 2) };
	expect(resolveVesselDesign({ ...stack, stages: [] }, lookup).ok).toBe(true);
});

test('the decoupler fires: the core and the pod keep the vessel, the booster flies off alone', async () => {
	const sim = await newSim();
	const loaded = sim.dispatch({ type: 'load-vessel', design: inverse() });
	if (!loaded.ok) throw new Error(loaded.reason);
	const id = loaded.vessel! as EntityId;
	sim.dispatch({ type: 'stage', vessel: id }); // engines
	sim.dispatch({ type: 'stage', vessel: id }); // the decoupler
	for (let i = 0; i < 10; i++) sim.step(0.02);
	const vessels = sim.snapshot().vessels;
	expect(vessels.length).toBe(2);
	const indexes = (v: EntityId): number[] =>
		sim.world
			.get(v, VESSEL)!
			.parts.map((p) => sim.world.get(p, PART)!.index)
			.sort((a, b) => a - b);
	expect(indexes(id)).toEqual([2, 5, 6]);
	const other = vessels.find((v) => v.id !== id)!;
	expect(indexes(other.id as EntityId)).toEqual([7, 11]);
	sim.dispose();
});
