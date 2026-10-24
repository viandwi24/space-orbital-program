/** Plan 128 / ADR 0125: a base kit founds a site on the moon, outposts drill, supply routes deliver. */
import { describe, expect, test } from 'bun:test';
import {
	createBodyTerrainField,
	latLonDirection,
	legacyWorldInfo,
	moonHeight,
	type EntityId,
	type WorldInfo
} from '@orbital/core';
import Stock, { HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { buildBodies } from '../src/bodies.ts';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { rapier, stack } from './helpers/vessels.ts';
import { pilotFor } from './helpers/crew.ts';

const DAY = tickDayLength([SunBody, HomeBody, MoonBody]);
const MOON = MoonBody.id;
const world = (rules: WorldInfo['rules'] = {}): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '9d4c2b1a-6e5f-4a3b-8c7d-0e1f2a3b4c5d',
	preset: 'stock.career',
	rules: {
		...legacyWorldInfo(1).rules,
		'stock.starting-funds': 500_000,
		// the tree is off here: the base kit sits in tier 5 (its pacing is mods/stock's test)
		'stock.tech-tree': false,
		// the pods' pilots sit through days of base ticks (plan 200: a pod controls only with crew)
		'stock.life-support': 'off',
		...rules
	}
});
const make = () => createSim({ plugins: [Stock], backendFactory: rapier(8), world: world() });
const resume = async (sim: Sim) =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(8),
		resume: JSON.parse(JSON.stringify(sim.save()))
	});

/** Land `parts` on the moon at (lat, lon) and wait until it is at rest. */
function landOnMoon(
	sim: Sim,
	parts: string[],
	latitude = 0.02,
	longitude = 0.03,
	stages: number[][] = []
): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('Lander', parts, stages),
		placement: { kind: 'surface', body: MOON, latitude, longitude },
		...(parts[0] === 'stock.command-pod' ? pilotFor(sim) : {})
	});
	if (!r.ok) throw new Error(r.reason);
	for (let i = 0; i < 600; i++) sim.step(0.02);
	return r.vessel!;
}

function days(sim: Sim, n: number): void {
	sim.dispatch({ type: 'warp', factor: 1e4 });
	const at = sim.snapshot().t;
	sim.step(((Math.floor(at / DAY) + n) * DAY + 1 - at) / 1e4);
	sim.dispatch({ type: 'warp', factor: 1 });
}
const held = (sim: Sim, site: string, commodity: string) =>
	sim.snapshot().economy!.storage?.find((s) => s.site === site)?.items[commodity] ?? 0;

describe('the base kit (ADR 0125 points 1 and 2)', () => {
	test("a deployed kit on the moon founds a base whose flat zone is in the moon's height function", async () => {
		const sim = await make();
		const kit = landOnMoon(sim, ['stock.command-pod', 'stock.base-kit']);
		const r = sim.dispatch({
			type: 'deploy-base',
			vessel: kit,
			id: 'tranquility',
			name: 'Tranquility'
		});
		expect(r.ok ? '' : r.reason).toBe('');
		const site = sim.worldInfo.sites.find((s) => s.id === 'tranquility')!;
		expect(site).toMatchObject({ body: MOON, kind: 'base' });
		expect(site.buildings!.map((b) => b.kind)).toEqual(['stock.base-hub']);
		expect(sim.snapshot().vessels.some((v) => v.id === kit)).toBe(false);
		// from the next load the moon's ground is flat round the base at its centre's own height
		const again = await resume(sim);
		const bodies = buildBodies(
			again.registries.bodies.list(),
			again.home,
			(def, w) => createBodyTerrainField(def, w),
			again.worldInfo
		);
		const moon = bodies.get(MOON)!;
		const centre = latLonDirection(site.latitude, site.longitude);
		const h0 = moonHeight(
			centre,
			MoonBody.radius,
			MoonBody.terrain?.kind === 'craters' ? (MoonBody.terrain.seed ?? 0) : 0
		);
		for (const arc of [0, 1_000, 3_000, 4_900]) {
			const d = latLonDirection(site.latitude + arc / MoonBody.radius, site.longitude);
			expect(moon.terrain!.heightAt(d)).toBeCloseTo(h0, 9);
		}
		sim.dispose();
		again.dispose();
	});

	test('the home buildings stay home and the base buildings stay off-world', async () => {
		const sim = await make();
		const homeIsru = sim.dispatch({
			type: 'place-building',
			site: 'legacy',
			kind: 'stock.isru-plant',
			cell: { i: 20, j: -12 },
			rotation: 0,
			id: 'i1'
		});
		expect(homeIsru.ok ? '' : homeIsru.reason).toBe('ISRU plant is built on other bodies only');
		// a kit on the home planet does not deploy
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack('Kit', ['stock.command-pod', 'stock.base-kit'], []),
			placement: { kind: 'surface', latitude: 0.3, longitude: 0.3 }
		});
		for (let i = 0; i < 400; i++) sim.step(0.02);
		if (!r.ok) throw new Error(r.reason);
		const home = sim.dispatch({ type: 'deploy-base', vessel: r.vessel!, id: 'x', name: 'X' });
		expect(home.ok ? '' : home.reason).toBe(
			'a base kit is for other bodies; build on the home planet in the Space Center'
		);
		sim.dispose();
	});
});

describe('outposts (ADR 0125 points 4 and 5)', () => {
	test('a landed vessel made an outpost runs its drill on the world tick and stops when it drives off', async () => {
		const first = await make();
		const kit = landOnMoon(first, ['stock.command-pod', 'stock.base-kit']);
		expect(first.dispatch({ type: 'deploy-base', vessel: kit, id: 'b', name: 'B' }).ok).toBe(true);
		const sim = await resume(first); // the zone and the base take vessels from the next load
		first.dispose();
		const site = sim.worldInfo.sites.find((s) => s.id === 'b')!;
		const rig = landOnMoon(
			sim,
			['stock.command-pod', 'stock.drill', 'stock.tank-small', 'stock.engine-lv'],
			site.latitude,
			site.longitude + 400 / MoonBody.radius,
			[[3]]
		);
		const r = sim.dispatch({ type: 'join-site', vessel: rig, site: 'b' });
		expect(r.ok ? '' : r.reason).toBe('');
		days(sim, 3);
		expect(held(sim, 'b', 'stock.ice')).toBe(150);
		// it leaves: lifts off on its engine just before a day boundary, so the tick finds it in flight
		const left: string[] = [];
		sim.events.on('site:left', (e) => left.push(e.site));
		const boundary = (Math.floor(sim.snapshot().t / DAY) + 1) * DAY;
		expect(sim.dispatch({ type: 'warp-to', time: boundary - 4, factor: 1e4 }).ok).toBe(true);
		for (let g = 0; g < 1e5 && (sim.time < boundary - 4 - 1e-6 || sim.warp !== 1); g++) sim.step(1);
		expect(sim.dispatch({ type: 'stage', vessel: rig }).ok).toBe(true);
		expect(sim.dispatch({ type: 'throttle', vessel: rig, value: 1 }).ok).toBe(true);
		for (let k = 0; k < 400; k++) sim.step(0.02);
		expect(left).toEqual(['b']);
		expect(sim.worldInfo.sites.find((s) => s.id === 'b')!.members ?? []).toEqual([]);
		const ice = held(sim, 'b', 'stock.ice');
		sim.dispatch({ type: 'throttle', vessel: rig, value: 0 });
		for (let k = 0; k < 2_000; k++) sim.step(0.02);
		days(sim, 2);
		expect(held(sim, 'b', 'stock.ice')).toBe(ice);
		sim.dispose();
	});

	test('the ISRU plant turns stored ice into propellant and stops when the ice runs out', async () => {
		const first = await make();
		const kit = landOnMoon(first, ['stock.command-pod', 'stock.base-kit']);
		expect(first.dispatch({ type: 'deploy-base', vessel: kit, id: 'b', name: 'B' }).ok).toBe(true);
		const sim = await resume(first);
		first.dispose();
		const site = sim.worldInfo.sites.find((s) => s.id === 'b')!;
		const r = sim.dispatch({
			type: 'place-building',
			site: 'b',
			kind: 'stock.isru-plant',
			cell: { i: 5, j: -2 },
			rotation: 0,
			id: 'isru'
		});
		expect(r.ok ? '' : r.reason).toBe('');
		const rig = landOnMoon(
			sim,
			['stock.command-pod', 'stock.drill', 'stock.drill'],
			site.latitude,
			site.longitude + 400 / MoonBody.radius
		);
		expect(sim.dispatch({ type: 'join-site', vessel: rig, site: 'b' }).ok).toBe(true);
		days(sim, 8); // the plant is built in 8 days; the drills fill the hub with 100 u a day
		const ice = held(sim, 'b', 'stock.ice');
		days(sim, 1); // the plant runs: 100 u of ice in, 40 + 49 u out
		expect(held(sim, 'b', 'stock.ice')).toBeCloseTo(ice + 100 - 100, 9);
		expect(held(sim, 'b', 'stock.liquid-fuel')).toBeGreaterThan(0);
		sim.dispose();
	});
});

describe('supply routes (ADR 0125 point 6)', () => {
	test('a route needs a proven flight, then delivers its cargo on each window and books its cost', async () => {
		const first = await make();
		const kit = landOnMoon(first, ['stock.command-pod', 'stock.base-kit']);
		expect(first.dispatch({ type: 'deploy-base', vessel: kit, id: 'b', name: 'B' }).ok).toBe(true);
		const sim = await resume(first);
		first.dispose();
		const route = {
			type: 'create-route',
			id: 'r1',
			from: 'legacy',
			to: 'b',
			commodity: 'stock.liquid-fuel',
			amount: 1_000
		} as const;
		const proven = sim
			.save()
			.milestones?.records.some((r) => r.kind === 'landing' && r.body === MOON);
		expect(proven).toBe(true);
		const r = sim.dispatch(route);
		expect(r.ok ? '' : r.reason).toBe('');
		const next = sim.snapshot().economy!.routes![0]!.nextDay;
		const window = next - sim.save().worldTick!.lastDay;
		// the moon's orbital period in tick days
		expect(window).toBeGreaterThan(5);
		const delivered: number[] = [];
		sim.events.on('route:delivered', (e) => delivered.push(e.amount));
		days(sim, window);
		expect(delivered).toEqual([1_000]);
		expect(held(sim, 'b', 'stock.liquid-fuel')).toBe(1_000);
		const entry = sim.save().economy!.entries.findLast((e) => e.cause === 'stock.supply-route')!;
		const price = 0.8; // bought at the market on the home site (it holds none)
		expect(entry.amount).toBeLessThan(-30_000);
		expect(entry.amount).toBeGreaterThan(-30_000 - 1_000 * price * 1.2);
		days(sim, window);
		expect(delivered).toEqual([1_000, 1_000]);
		sim.dispose();
	});
});

describe('refuelling from site storage (plan 386, ADR 0352)', () => {
	/** A lander with empty tanks, landed within the base's flat zone. */
	function emptyLander(sim: Sim, site: { latitude: number; longitude: number }): EntityId {
		const design = stack(
			'Lander',
			['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'],
			[[2]]
		);
		design.parts[1] = {
			...design.parts[1]!,
			settings: {
				'stock.resource-container': {
					contents: {
						'stock.liquid-fuel': { amount: 0, capacity: 400 },
						'stock.oxidizer': { amount: 0, capacity: 490 }
					}
				}
			}
		} as never;
		const r = sim.dispatch({
			type: 'load-vessel',
			design,
			placement: {
				kind: 'surface',
				body: MOON,
				latitude: site.latitude,
				longitude: site.longitude + 400 / MoonBody.radius
			},
			...pilotFor(sim)
		});
		if (!r.ok) throw new Error(r.reason);
		for (let i = 0; i < 600; i++) sim.step(0.02);
		return r.vessel!;
	}
	const tank = (sim: Sim, id: EntityId, resource: string) =>
		sim
			.snapshot()
			.vessels.find((v) => v.id === id)!
			.resources!.find((x) => x.resource === resource)?.amount ?? 0;

	test('a member takes the stored propellant up to what its tanks hold, and only a member can', async () => {
		const first = await make();
		const kit = landOnMoon(first, ['stock.command-pod', 'stock.base-kit']);
		expect(first.dispatch({ type: 'deploy-base', vessel: kit, id: 'b', name: 'B' }).ok).toBe(true);
		const sim = await resume(first);
		first.dispose();
		const site = sim.worldInfo.sites.find((s) => s.id === 'b')!;
		const lander = emptyLander(sim, site);
		expect(tank(sim, lander, 'stock.liquid-fuel')).toBe(0);
		const stranger = sim.dispatch({ type: 'refuel', vessel: lander, site: 'b' });
		expect(stranger.ok ? '' : stranger.reason).toContain('join the site first');
		expect(sim.dispatch({ type: 'join-site', vessel: lander, site: 'b' }).ok).toBe(true);
		const empty = sim.dispatch({ type: 'refuel', vessel: lander, site: 'b' });
		expect(empty.ok ? '' : empty.reason).toBe('the site stores no propellant yet');
		for (const commodity of ['stock.liquid-fuel', 'stock.oxidizer'])
			expect(sim.dispatch({ type: 'market-buy', commodity, amount: 1_000, site: 'b' }).ok).toBe(
				true
			);
		const moved: Array<Record<string, number>> = [];
		sim.events.on('site:refuelled', (e) => moved.push(e.moved));
		const r = sim.dispatch({ type: 'refuel', vessel: lander, site: 'b' });
		expect(r.ok ? '' : r.reason).toBe('');
		// the small tank holds 400 u of fuel and 490 u of oxidizer; the rest stays in storage
		expect(tank(sim, lander, 'stock.liquid-fuel')).toBeCloseTo(400, 6);
		expect(tank(sim, lander, 'stock.oxidizer')).toBeCloseTo(490, 6);
		expect(held(sim, 'b', 'stock.liquid-fuel')).toBeCloseTo(600, 6);
		expect(held(sim, 'b', 'stock.oxidizer')).toBeCloseTo(510, 6);
		expect(moved).toEqual([{ 'stock.liquid-fuel': 400, 'stock.oxidizer': 490 }]);
		const full = sim.dispatch({ type: 'refuel', vessel: lander, site: 'b' });
		expect(full.ok ? '' : full.reason).toBe('the vessel has no room for the propellant in storage');
		sim.dispose();
	}, 120_000);

	test('the refuelled lander lifts off on the propellant it took', async () => {
		const first = await make();
		const kit = landOnMoon(first, ['stock.command-pod', 'stock.base-kit']);
		expect(first.dispatch({ type: 'deploy-base', vessel: kit, id: 'b', name: 'B' }).ok).toBe(true);
		const sim = await resume(first);
		first.dispose();
		const site = sim.worldInfo.sites.find((s) => s.id === 'b')!;
		const lander = emptyLander(sim, site);
		sim.dispatch({ type: 'join-site', vessel: lander, site: 'b' });
		for (const commodity of ['stock.liquid-fuel', 'stock.oxidizer'])
			sim.dispatch({ type: 'market-buy', commodity, amount: 500, site: 'b' });
		expect(sim.dispatch({ type: 'refuel', vessel: lander, site: 'b' }).ok).toBe(true);
		const alt = () => {
			const v = sim.snapshot().vessels.find((x) => x.id === lander)!;
			return Math.hypot(v.position.x, v.position.y, v.position.z) - MoonBody.radius;
		};
		const before = alt();
		expect(sim.dispatch({ type: 'stage', vessel: lander }).ok).toBe(true);
		expect(sim.dispatch({ type: 'throttle', vessel: lander, value: 1 }).ok).toBe(true);
		for (let k = 0; k < 500; k++) sim.step(0.02);
		expect(alt() - before).toBeGreaterThan(20);
		sim.dispose();
	}, 120_000);
});

describe('the base offers of a landed vessel (plan 386)', () => {
	const offer = (sim: Sim, id: EntityId) =>
		sim.snapshot().vessels.find((v) => v.id === id)!.baseOffer;

	test('a kit offers to found a base, a lander in the flat zone to join, a member to refuel', async () => {
		const first = await make();
		const kit = landOnMoon(first, ['stock.command-pod', 'stock.base-kit']);
		// the kit on the Moon may found a base at its spot; the spot's facts are the sim's
		expect(offer(first, kit)?.found).toMatchObject({ body: MOON });
		expect(offer(first, kit)?.found?.refusal).toBeUndefined();
		expect(first.dispatch({ type: 'deploy-base', vessel: kit, id: 'b', name: 'B' }).ok).toBe(true);
		const sim = await resume(first);
		first.dispose();
		const site = sim.worldInfo.sites.find((s) => s.id === 'b')!;
		const lander = landOnMoon(
			sim,
			['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'],
			site.latitude,
			site.longitude + 400 / MoonBody.radius,
			[[2]]
		);
		// inside the flat zone: join, and nothing to refuel before it is a member
		expect(offer(sim, lander)).toEqual({ join: { site: 'b', name: 'B' } });
		expect(sim.dispatch({ type: 'join-site', vessel: lander, site: 'b' }).ok).toBe(true);
		sim.step(0.02);
		// a member of a site with nothing stored: no offer
		expect(offer(sim, lander)).toBeUndefined();
		expect(
			sim.dispatch({ type: 'market-buy', commodity: 'stock.liquid-fuel', amount: 50, site: 'b' }).ok
		).toBe(true);
		expect(offer(sim, lander)?.refuel).toEqual({
			site: 'b',
			name: 'B',
			stored: { 'stock.liquid-fuel': 50 }
		});
		sim.dispose();
	}, 120_000);
});
