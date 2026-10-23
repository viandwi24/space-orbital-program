/** Plan 096 / ADR 0123: construction on the tick, upgrades, upkeep, the crew roster limit. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type WorldInfo } from '@orbital/core';
import Stock, { HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { rapier } from './helpers/vessels.ts';

const world = (preset: string): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '6a1f3c2e-8b4d-4e5f-9a7b-1c2d3e4f5a6b',
	preset
});
const DAY = tickDayLength([SunBody, HomeBody, MoonBody]);
const make = (preset = 'stock.career') =>
	createSim({ plugins: [Stock], backendFactory: rapier(8), world: world(preset) });
const legacy = (sim: Sim) => sim.snapshot().sites!.find((s) => s.id === 'legacy')!;
const building = (sim: Sim, id: string) => legacy(sim).buildings.find((b) => b.id === id)!;
const funds = (sim: Sim) => sim.snapshot().economy!.funds;
const dish = (id = 'd1') =>
	({
		type: 'place-building',
		site: 'legacy',
		kind: 'stock.tracking-dish',
		cell: { i: 10, j: -2 },
		rotation: 0,
		id
	}) as const;
const hangar = (id: string, i: number) =>
	({
		type: 'place-building',
		site: 'legacy',
		kind: 'stock.hangar',
		cell: { i, j: -12 },
		rotation: 0,
		id
	}) as const;

/** Advance whole days at warp 1e6, landing a little past the boundary. */
function days(sim: Sim, n: number): void {
	const day = DAY;
	sim.dispatch({ type: 'warp', factor: 1e4 });
	const at = sim.snapshot().t;
	const target = (Math.floor(at / day) + n) * day + 1;
	sim.step((target - at) / 1e4);
	sim.dispatch({ type: 'warp', factor: 1 });
}

describe('construction (ADR 0123 point 1)', () => {
	test('placing a Hangar debits its cost and it becomes ready exactly after its build time in game days', async () => {
		const sim = await make();
		const def = sim.registries.buildings.get('stock.hangar')!.levels[0]!;
		const before = funds(sim);
		// the day of the tick on which it was done: `building:ready` comes before that tick's `world:tick`
		let lastTick = sim.save().worldTick!.lastDay;
		const ready: number[] = [];
		sim.events.on('world:tick', (e) => (lastTick = e.day));
		sim.events.on('building:ready', (e) => {
			if (e.id === 'h2') ready.push(lastTick + 1);
		});
		const placedOn = lastTick;
		const r = sim.dispatch(hangar('h2', -30));
		expect(r.ok ? '' : r.reason).toBe('');
		expect(funds(sim)).toBe(before - def.cost);
		const placed = building(sim, 'h2');
		expect(placed.state).toBe('building');
		expect(sim.save().economy!.entries.at(-1)).toMatchObject({
			amount: -def.cost,
			cause: 'economy.construction',
			ref: 'h2'
		});
		days(sim, def.buildDays - 1);
		expect(building(sim, 'h2').state).toBe('building');
		expect(ready).toEqual([]);
		days(sim, 1);
		expect(building(sim, 'h2')).toMatchObject({ state: 'active', level: 0 });
		expect(building(sim, 'h2').readyDay).toBeUndefined();
		expect(ready.length).toBe(1);
		expect(placed.readyDay).toBe(placedOn + def.buildDays);
		expect(ready).toEqual([placedOn + def.buildDays]);
		sim.dispose();
	});

	test('not enough funds refuses with the shortfall; Sandbox builds for free at once', async () => {
		const sim = await make();
		expect(sim.dispatch(hangar('h2', -30)).ok).toBe(true);
		expect(sim.dispatch(hangar('h3', -50)).ok).toBe(true);
		const third = sim.dispatch(hangar('h4', -70));
		expect(third.ok ? '' : third.reason).toMatch(/^Not enough funds: needs 40000, has \d+$/);
		sim.dispose();
		const free = await make('stock.sandbox');
		expect(free.dispatch(hangar('h2', -30)).ok).toBe(true);
		expect(building(free, 'h2')).toMatchObject({ state: 'active', level: 0 });
		expect(free.save().economy?.entries ?? []).toEqual([]);
		free.dispose();
	});

	test('an upgrade debits the next level, keeps working at its level, and raises it on the ready day', async () => {
		const sim = await make();
		const levels = sim.registries.buildings.get('stock.hangar')!.levels;
		const before = funds(sim);
		const r = sim.dispatch({ type: 'upgrade-building', site: 'legacy', id: 'legacy-hangar' });
		expect(r.ok ? '' : r.reason).toBe('');
		expect(funds(sim)).toBe(before - levels[1]!.cost);
		expect(building(sim, 'legacy-hangar')).toMatchObject({ state: 'upgrading', level: 0 });
		const again = sim.dispatch({ type: 'upgrade-building', site: 'legacy', id: 'legacy-hangar' });
		expect(again.ok ? '' : again.reason).toBe('Hangar is upgrading');
		days(sim, levels[1]!.buildDays);
		expect(building(sim, 'legacy-hangar')).toMatchObject({ state: 'active', level: 1 });
		sim.dispose();
	});

	test('construction survives save and resume and finishes after it', async () => {
		const sim = await make();
		sim.dispatch(dish());
		expect(building(sim, 'd1').state).toBe('building');
		const save = sim.save();
		sim.dispose();
		const resumed = await createSim({ plugins: [Stock], backendFactory: rapier(8), resume: save });
		expect(building(resumed, 'd1')).toMatchObject({ state: 'building' });
		days(resumed, 2);
		expect(building(resumed, 'd1')).toMatchObject({ state: 'active' });
		resumed.dispose();
	});
});

describe('upkeep (ADR 0123 point 5)', () => {
	test('every 30th day each working building writes its upkeep with its id', async () => {
		const sim = await make();
		const at = sim.save().worldTick!.lastDay;
		const toUpkeep = 30 - (at % 30);
		days(sim, toUpkeep);
		const upkeep = sim.save().economy!.entries.filter((e) => e.cause === 'economy.upkeep');
		const level0 = (kind: string) => sim.registries.buildings.get(kind)!.levels[0]!.upkeep;
		expect(upkeep.map((e) => [e.ref, e.amount]).sort()).toEqual(
			[
				['legacy-administration', -level0('stock.administration')],
				['legacy-hangar', -level0('stock.hangar')],
				['legacy-mission-center', -level0('stock.mission-center')],
				['legacy-pad', -level0('stock.launchpad-s')]
			].sort()
		);
		sim.dispose();
	});
});

describe('the crew roster limit (ADR 0123 point 4)', () => {
	test('with an Astronaut Complex the roster stops at its capacity and names the upgrade', async () => {
		const sim = await make();
		const r = sim.dispatch({
			type: 'place-building',
			site: 'legacy',
			kind: 'stock.astronaut-complex',
			cell: { i: 10, j: 14 },
			rotation: 0,
			id: 'ac'
		});
		expect(r.ok ? '' : r.reason).toBe('');
		days(sim, sim.registries.buildings.get('stock.astronaut-complex')!.levels[0]!.buildDays);
		for (let k = 0; k < 5; k++)
			expect(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }).ok).toBe(true);
		const sixth = sim.dispatch({ type: 'crew-hire', profession: 'pilot' });
		expect(sixth.ok ? '' : sixth.reason).toBe(
			'The roster is full (5 crew); Astronaut Complex level 2: 12 crew'
		);
		sim.dispose();
	});
});

describe('the tour building (plan 377, ADR 0314 point 4)', () => {
	test('a tour building gives back its cost and its upgrade when removed; an ordinary one does not', async () => {
		const sim = await make();
		const def = sim.registries.buildings.get('stock.tracking-dish')!.levels;
		const before = funds(sim);
		expect(sim.dispatch({ ...dish('tour'), tour: true }).ok).toBe(true);
		expect(building(sim, 'tour').refund).toBe(def[0]!.cost);
		days(sim, def[0]!.buildDays);
		expect(sim.dispatch({ type: 'upgrade-building', site: 'legacy', id: 'tour' }).ok).toBe(true);
		expect(building(sim, 'tour').refund).toBe(def[0]!.cost + def[1]!.cost);
		const paid = before - funds(sim);
		expect(paid).toBeGreaterThanOrEqual(def[0]!.cost + def[1]!.cost);
		const upkeep = paid - def[0]!.cost - def[1]!.cost;
		expect(sim.dispatch({ type: 'remove-building', site: 'legacy', id: 'tour' }).ok).toBe(true);
		// only the upkeep of the days it stood is gone
		expect(before - funds(sim)).toBeCloseTo(upkeep, 6);
		expect(sim.save().economy!.entries.at(-1)).toMatchObject({
			amount: def[0]!.cost + def[1]!.cost,
			cause: 'economy.refund',
			ref: 'tour'
		});
		// an ordinary building: no refund kept, none given
		expect(sim.dispatch(dish('plain')).ok).toBe(true);
		expect(building(sim, 'plain').refund).toBeUndefined();
		const held = funds(sim);
		expect(sim.dispatch({ type: 'remove-building', site: 'legacy', id: 'plain' }).ok).toBe(true);
		expect(funds(sim)).toBe(held);
	});

	test('with the economy off the tour flag pays and gives back nothing', async () => {
		const sim = await make('stock.sandbox');
		expect(sim.dispatch({ ...dish('tour'), tour: true }).ok).toBe(true);
		expect(building(sim, 'tour')).toMatchObject({ state: 'active', refund: 0 });
		expect(sim.dispatch({ type: 'remove-building', site: 'legacy', id: 'tour' }).ok).toBe(true);
	});
});
