/**
 * Plan 280: a deployed folding solar array flown into strong airflow breaks and stops producing;
 * folded, it survives; and a design with an old stack panel (hidden since plan 280) still resolves
 * and flies.
 */
import { expect, test } from 'bun:test';
import { partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';
import { pilotFor } from './helpers/crew.ts';

const design = (panel: string, deployed: boolean): VesselDesign => ({
	formatVersion: 3,
	name: 'Array',
	parts: [
		{ index: 0, part: partId('stock.pod-3'), parent: null },
		panel === 'stock.solar-panel'
			? { index: 1, part: partId(panel), parent: { index: 0, parentNode: 'top', node: 'bottom' } }
			: {
					index: 1,
					part: partId(panel),
					parent: { index: 0, parentNode: 'surface', node: 'radial', radial: { angle: 0, y: 0 } },
					...(deployed ? { settings: { 'stock.solar-panel': { deployed: true } } } : {})
				}
	],
	stages: []
});

async function fly(d: VesselDesign) {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 3 });
	// 5 km up and 700 m/s: about 170 kPa of dynamic pressure
	const r = sim.dispatch({
		type: 'load-vessel',
		design: d,
		placement: { kind: 'state', ...orbitState(sim, 5_000, 0.3) },
		...pilotFor(sim)
	});
	if (!r.ok) throw new Error(r.reason);
	for (let i = 0; i < 25; i++) sim.step(0.02);
	const v = sim.snapshot().vessels.find((x) => x.id === r.vessel)!;
	const panel = v.parts.find((p) => p.definition !== 'stock.pod-3')!;
	const state = panel.modules['stock.solar-panel'] as { deployed: boolean; broken?: boolean };
	sim.dispose();
	return state;
}

test('a deployed folding array in strong airflow breaks; folded, it survives', async () => {
	const broken = await fly(design('stock.solar-fold', true));
	expect(broken.broken).toBe(true);
	expect(broken.deployed).toBe(false);
	const folded = await fly(design('stock.solar-fold', false));
	expect(folded.broken).toBeUndefined();
});

test('a design with the old stack panel still resolves and flies', async () => {
	const state = await fly(design('stock.solar-panel', false));
	expect(state.deployed).toBe(false);
});
