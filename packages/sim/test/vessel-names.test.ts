/** Plan 270 / ADR 0252: launches, staging and old saves give distinct vessel names. */
import { describe, expect, test } from 'bun:test';
import { simSaveChecksum, type SimSave } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { newSim, rapier, stack } from './helpers/vessels.ts';

const names = (sim: Sim): string[] =>
	sim
		.snapshot()
		.vessels.map((v) => v.name ?? '')
		.sort();

/** Probe core over two decoupled tanks: stage 0 drops the bottom tank, stage 1 the middle one. */
const twoDrops = () =>
	stack(
		'Moon shot',
		[
			'stock.probe-core',
			'stock.tank-small',
			'stock.decoupler',
			'stock.tank-small',
			'stock.decoupler',
			'stock.tank-small'
		],
		[[4], [2]]
	);

function launch(sim: Sim, offset = 0): number {
	const at = orbitState(sim, 300_000);
	const r = sim.dispatch({
		type: 'load-vessel',
		design: twoDrops(),
		placement: {
			kind: 'state',
			...at,
			position: { ...at.position, z: at.position.z + offset }
		}
	});
	if (!r.ok) throw new Error(r.reason);
	return Number(r.vessel);
}

describe('distinct vessel names (plan 270)', () => {
	test('a second launch of a design gets a number', async () => {
		const sim = await newSim();
		launch(sim);
		launch(sim, 200);
		expect(names(sim)).toEqual(['Moon shot', 'Moon shot 2']);
		sim.dispose();
	});

	test('staging names debris once: "Moon shot debris", "Moon shot debris 2"', async () => {
		const sim = await newSim();
		const id = launch(sim);
		for (let i = 0; i < 2; i++) {
			expect(sim.dispatch({ type: 'stage', vessel: id as never }).ok).toBe(true);
			for (let k = 0; k < 10; k++) sim.step(0.02);
		}
		expect(names(sim)).toEqual(['Moon shot', 'Moon shot debris', 'Moon shot debris 2']);
		sim.dispose();
	});

	test('a save with legacy "(debris)" names loads with them tidied', async () => {
		const sim = await newSim();
		const id = launch(sim);
		expect(sim.dispatch({ type: 'stage', vessel: id as never }).ok).toBe(true);
		for (let k = 0; k < 10; k++) sim.step(0.02);
		const save = JSON.parse(
			JSON.stringify(sim.save()).replace(/"Moon shot debris"/g, '"Moon shot (debris) (debris)"')
		) as SimSave;
		expect(JSON.stringify(save)).toContain('(debris) (debris)');
		const { checksum: _old, ...unsigned } = save;
		const resumed = await createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			resume: { ...unsigned, checksum: simSaveChecksum(unsigned) }
		});
		expect(names(resumed)).toEqual(['Moon shot', 'Moon shot debris']);
		sim.dispose();
		resumed.dispose();
	});
});
