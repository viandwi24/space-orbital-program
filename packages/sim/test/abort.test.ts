/**
 * Plan 276: the Abort group of a capsule stack (the Kronos V's: the tower's motor and the capsule's
 * separation from the service module). Fired on a coasting stack it carries the capsule well clear.
 */
import { expect, test } from 'bun:test';
import { ABORT_SLOT, customGroupId, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';
import { pilotFor } from './helpers/crew.ts';

// from the pod up: neck, port, cover, tower; from the pod down: heat shield, separator, tank, engine
const PARTS: Array<[string, number, 'top' | 'bottom']> = [
	['stock.pod-3', -1, 'top'],
	['stock.adapter-small', 0, 'top'],
	['stock.docking-port-small', 1, 'top'],
	['stock.boost-cover', 2, 'top'],
	['stock.escape-tower', 3, 'top'],
	['stock.heat-shield-wide', 0, 'bottom'],
	['stock.decoupler-wide', 5, 'bottom'],
	['stock.tank-wide-short', 6, 'bottom'],
	['stock.engine-wide', 7, 'bottom']
];

const stackDesign = (): VesselDesign => ({
	formatVersion: 3,
	name: 'Abort stack',
	parts: PARTS.map(([part, parent, node], index) => ({
		index,
		part: partId(part),
		parent:
			parent < 0
				? null
				: { index: parent, parentNode: node, node: node === 'top' ? 'bottom' : 'top' },
		...(part === 'stock.escape-tower' ? { settings: { 'stock.decoupler': { staged: false } } } : {})
	})),
	stages: [],
	groups: [
		{
			slot: ABORT_SLOT,
			label: 'Abort',
			members: [
				{ part: 4, module: 'stock.engine', action: 'setActive' },
				{ part: 6, module: 'stock.decoupler', action: 'decouple' }
			]
		}
	]
});

test('firing Abort carries the capsule at least 500 m from the stack', async () => {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 3 });
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stackDesign(),
		placement: { kind: 'state', ...orbitState(sim, 200_000) },
		...pilotFor(sim)
	});
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel!;
	sim.step(0.5);
	expect(
		sim.dispatch({ type: 'action-group', vessel: id, group: customGroupId(ABORT_SLOT) }).ok
	).toBe(true);
	for (let i = 0; i < 600; i++) sim.step(0.02);
	const vessels = sim.snapshot().vessels;
	const podVessel = vessels.find((v) => v.parts.some((p) => p.definition === 'stock.pod-3'))!;
	const stackVessel = vessels.find((v) =>
		v.parts.some((p) => p.definition === 'stock.engine-wide')
	)!;
	expect(podVessel.id).not.toBe(stackVessel.id);
	const d = Math.hypot(
		podVessel.position.x - stackVessel.position.x,
		podVessel.position.y - stackVessel.position.y,
		podVessel.position.z - stackVessel.position.z
	);
	expect(d).toBeGreaterThan(500);
	sim.dispose();
}, 60_000);
