/** Plan 090 / ADR 0115: place-building and remove-building in the sim; save and resume. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { rapier } from './helpers/vessels.ts';

const make = () =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(8),
		world: { ...legacyWorldInfo(1), id: 'bld' }
	});
const legacy = (s: Awaited<ReturnType<typeof make>>) =>
	s.snapshot().sites!.find((x) => x.id === 'legacy')!;

describe('buildings on the Legacy site', () => {
	test('the snapshot shows the Legacy layout and the start buildings before anything is built', async () => {
		const sim = await make();
		// the Astronaut Complex and R&D join the Legacy layout in every world (ADR 0322)
		expect(legacy(sim).buildings.map((b) => b.kind)).toEqual([
			'stock.launchpad-s',
			'stock.hangar',
			'stock.mission-center',
			'stock.administration',
			'stock.astronaut-complex',
			'stock.research'
		]);
		// the start's building writes the implicit Legacy site into the world, as a first build does
		expect(sim.worldInfo.sites.map((x) => x.id)).toEqual(['legacy']);
		sim.dispose();
	});

	test('an invalid cell is refused with the reason canPlace gives', async () => {
		const sim = await make();
		const onPad = sim.dispatch({
			type: 'place-building',
			site: 'legacy',
			kind: 'stock.tracking-dish',
			cell: { i: 0, j: 0 },
			rotation: 0,
			id: 'd1'
		});
		expect(onPad.ok).toBe(false);
		expect(onPad.ok ? '' : onPad.reason).toContain('overlaps building legacy-pad');
		const unknown = sim.dispatch({
			type: 'place-building',
			site: 'nowhere',
			kind: 'stock.tracking-dish',
			cell: { i: 0, j: 0 },
			rotation: 0,
			id: 'd1'
		});
		expect(unknown.ok ? '' : unknown.reason).toBe('unknown site "nowhere"');
		sim.dispose();
	});

	test('a valid building appears with its roads, survives save and resume, and can be removed', async () => {
		const sim = await make();
		const r = sim.dispatch({
			type: 'place-building',
			site: 'legacy',
			kind: 'stock.tracking-dish',
			cell: { i: 10, j: -2 },
			rotation: 0,
			id: 'dish-1'
		});
		expect(r).toEqual({ ok: true });
		const site = legacy(sim);
		expect(site.buildings.at(-1)).toEqual({
			id: 'dish-1',
			kind: 'stock.tracking-dish',
			cell: { i: 10, j: -2 },
			rotation: 0,
			level: 0,
			state: 'active'
		});
		expect(sim.worldInfo.sites).toHaveLength(1); // the implicit Legacy site was written
		const text = JSON.stringify(sim.save());
		const resumed = await createSim({
			plugins: [Stock],
			backendFactory: rapier(8),
			resume: JSON.parse(text)
		});
		expect(JSON.stringify(resumed.save())).toBe(text);
		expect(legacy(resumed).buildings.map((b) => b.id)).toContain('dish-1');
		expect(resumed.dispatch({ type: 'remove-building', site: 'legacy', id: 'dish-1' })).toEqual({
			ok: true
		});
		expect(legacy(resumed).buildings.map((b) => b.id)).not.toContain('dish-1');
		sim.dispose();
		resumed.dispose();
	});
});
