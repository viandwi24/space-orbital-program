/**
 * The boost cover (system audit D6): the escape tower on Apollo's Boost Protective Cover over the
 * capsule's docking port. Firing the tower's stage takes the cover and the tower off together; the
 * port stays on the capsule with nothing on its face, and nothing is lost.
 */
import { describe, expect, test } from 'bun:test';
import { partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';
import { pilotFor } from './helpers/crew.ts';

const NAMES = [
	'stock.pod-3',
	'stock.adapter-small',
	'stock.docking-port-small',
	'stock.boost-cover',
	'stock.escape-tower'
];
const capsule = (): VesselDesign => ({
	formatVersion: 3,
	name: 'Capsule',
	parts: NAMES.map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'top', node: 'bottom' },
		// the tower's own joint stays shut: the cover's takes both off
		...(part === 'stock.escape-tower' ? { settings: { 'stock.decoupler': { staged: false } } } : {})
	})),
	stages: [[4, 3]]
});

describe('the boost cover', () => {
	test("the tower's stage takes the cover and the tower off together; the port stays on the capsule", async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 3 });
		const r = sim.dispatch({
			type: 'load-vessel',
			design: capsule(),
			placement: { kind: 'state', ...orbitState(sim, 200_000) },
			...pilotFor(sim)
		});
		if (!r.ok) throw new Error(r.reason);
		for (let i = 0; i < 10; i++) sim.step(0.02);
		const staged = sim.dispatch({ type: 'stage', vessel: r.vessel! });
		expect(staged.ok ? '' : staged.reason).toBe('');
		const partsOf = (v: { parts: Array<{ definition: unknown }> }) =>
			v.parts.map((p) => String(p.definition)).sort();
		for (let i = 0; i < 150; i++) sim.step(0.02);
		const s = sim.snapshot();
		expect(s.vessels).toHaveLength(2);
		const ship = s.vessels.find((v) => v.id === r.vessel)!;
		const off = s.vessels.find((v) => v.id !== r.vessel)!;
		expect(partsOf(ship)).toEqual(
			['stock.adapter-small', 'stock.docking-port-small', 'stock.pod-3'].sort()
		);
		expect(partsOf(off)).toEqual(['stock.boost-cover', 'stock.escape-tower'].sort());
		// the tower's motor pulls the pair clear: tens of metres after three seconds, not a tangle
		const d = Math.hypot(
			off.position.x - ship.position.x,
			off.position.y - ship.position.y,
			off.position.z - ship.position.z
		);
		expect(d).toBeGreaterThan(20);
		sim.dispose();
	});
});
