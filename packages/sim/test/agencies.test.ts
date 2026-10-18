/** AI agencies (plan 126, ADR 0190): the daily machine, owned objects, rental, refusals, the save. */
import { describe, expect, test } from 'bun:test';
import {
	GRAVITATIONAL_CONSTANT,
	legacyWorldInfo,
	type EntityId,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineAgency, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

const make = (seed = 11, resume?: unknown) =>
	createSim({
		plugins: [Stock, openTree],
		backendFactory: rapier(8),
		world: { ...legacyWorldInfo(seed), id: `agencies-${seed}`, preset: 'stock.career' },
		...(resume ? { resume } : {})
	});
const day = (sim: Sim) => tickDayLength(sim.registries.bodies.list());

function warp(sim: Sim, seconds: number): void {
	const to = sim.time + seconds;
	const r = sim.dispatch({ type: 'warp-to', time: to, factor: 1e4 });
	if (!r.ok) throw new Error(r.reason);
	for (let g = 0; (sim.time < to - 1e-6 || sim.warp !== 1) && g < 1e5; g++) sim.step(10);
}

const MERIDIAN = 'stock.meridian';
const relayOf = (snap: Snapshot) =>
	snap.agencies?.agencies.find((a) => a.id === MERIDIAN)?.objects.find((o) => o.kind === 'relay');

/** Days until Meridian's first relay, and that relay. */
function firstRelay(sim: Sim): { day: number; vessel: EntityId } {
	for (let d = 1; d <= 400; d++) {
		warp(sim, day(sim));
		const relay = relayOf(sim.snapshot());
		if (relay) return { day: d, vessel: relay.vessel as EntityId };
	}
	throw new Error('no relay in 400 days');
}

describe('agencies', () => {
	test('with a fixed seed the first relay flies on the same day, on rails, owned by its agency', async () => {
		const runs = [];
		for (let k = 0; k < 2; k++) {
			const sim = await make(11);
			const first = firstRelay(sim);
			const v = sim.snapshot().vessels.find((x) => x.id === first.vessel)!;
			runs.push({ day: first.day, owner: v.owner, mode: v.mode, name: v.name });
			sim.dispose();
		}
		expect(runs[0]).toEqual(runs[1]);
		expect(runs[0]).toMatchObject({
			owner: MERIDIAN,
			mode: 'on-rails',
			name: 'Meridian Space Authority relay'
		});
		const sandbox = await createSim({
			plugins: [Stock],
			backendFactory: rapier(8),
			world: { ...legacyWorldInfo(11), id: 'agencies-sandbox', preset: 'stock.sandbox' }
		});
		warp(sandbox, 100 * day(sandbox));
		expect(sandbox.snapshot().agencies).toBeUndefined();
		sandbox.dispose();
	}, 60_000);

	test("an agency's vessel takes no orders; it is saved and goes on after a resume", async () => {
		const sim = await make(11);
		const { vessel } = firstRelay(sim);
		const r = sim.dispatch({ type: 'throttle', vessel, value: 1 });
		expect((r as { reason: string }).reason).toBe('owned by Meridian Space Authority');
		expect(sim.dispatch({ type: 'recover-vessel', vessel }).ok).toBe(false);
		const resumed = await make(11, sim.save());
		expect(resumed.snapshot().agencies).toEqual(sim.snapshot().agencies);
		warp(sim, 30 * day(sim));
		warp(resumed, 30 * day(resumed));
		expect(resumed.snapshot().agencies).toEqual(sim.snapshot().agencies);
		sim.dispose();
		resumed.dispose();
	}, 60_000);

	test('renting a rival relay routes a link through it and books the rent each day', async () => {
		const sim = await make(11);
		const { vessel: relay } = firstRelay(sim);
		expect(sim.dispatch({ type: 'relay-rent', vessel: relay }).ok).toBe(true);
		// wait until the relay, seen from home, is 20° to 60° from the station
		const home = sim.registries.bodies.get('stock.home')!;
		const geometry = () => {
			const snap = sim.snapshot();
			const station = snap.network!.stations[0]!;
			const centre = snap.bodies.find((b) => String(b.id) === 'stock.home')!.position;
			const s = { x: station.position.x - centre.x, y: 0, z: station.position.z - centre.z };
			const r = snap.vessels.find((v) => v.id === relay)!.position;
			const angle = Math.atan2(s.x * r.z - s.z * r.x, s.x * r.x + s.z * r.z);
			return {
				s,
				angle,
				linked: (snap.network!.vessels.find((v) => v.vessel === relay)?.route.length ?? 0) > 0
			};
		};
		let g = geometry();
		for (
			let i = 0;
			i < 400 && !(g.linked && Math.abs(g.angle) > 0.35 && Math.abs(g.angle) < 1.05);
			i++
		) {
			warp(sim, 120);
			g = geometry();
		}
		expect(g.linked).toBe(true);
		// a probe 150 km up, 50° from the station on the relay's side: below the station's horizon
		const phi = Math.atan2(-g.s.z, g.s.x) - (Math.sign(g.angle) * (50 * Math.PI)) / 180;
		const rad = home.radius + 150_000;
		const speed = Math.sqrt((GRAVITATIONAL_CONSTANT * home.mass) / rad);
		const position: Vec3 = { x: rad * Math.cos(phi), y: 0, z: -rad * Math.sin(phi) };
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: stack('Probe', ['stock.probe-core'], []),
			placement: {
				kind: 'state',
				position,
				velocity: { x: speed * Math.sin(phi), y: 0, z: speed * Math.cos(phi) }
			}
		});
		if (!placed.ok) throw new Error(placed.reason);
		const probe = placed.vessel!;
		sim.step(0.02);
		const route = sim.snapshot().network!.vessels.find((v) => v.vessel === probe)!.route;
		expect(route[0]).toBe(`vessel:${relay}`);
		// without the rental there is no route at all
		expect(sim.dispatch({ type: 'relay-end-rent', vessel: relay }).ok).toBe(true);
		sim.step(0.02);
		expect(sim.snapshot().network!.vessels.find((v) => v.vessel === probe)!.to).toBeNull();
		expect(sim.dispatch({ type: 'relay-rent', vessel: relay }).ok).toBe(true);
		// the rent: one entry a day, paid to Meridian
		const before = sim.save().economy!.entries.filter((e) => e.cause === 'agency.rent').length;
		const funds = sim.snapshot().agencies!.agencies.find((a) => a.id === MERIDIAN)!.funds;
		sim.step(0.02);
		for (
			let i = 0;
			i < 1e5 &&
			sim.save().economy!.entries.filter((e) => e.cause === 'agency.rent').length < before + 2;
			i++
		)
			sim.step(1);
		const rents = sim
			.save()
			.economy!.entries.filter((e) => e.cause === 'agency.rent')
			.slice(before);
		expect(rents.map((e) => [e.amount, e.ref])).toEqual([
			[-400, MERIDIAN],
			[-400, MERIDIAN]
		]);
		expect(sim.snapshot().agencies!.agencies.find((a) => a.id === MERIDIAN)!.funds).toBeGreaterThan(
			funds
		);
		sim.dispose();
	}, 60_000);

	test('a failed relay is news and a reactive contract offer', async () => {
		// a plugin booted before stock registers the first agency: with a count of 1 only it runs
		const reckless = definePlugin({
			meta: { id: 'test-reckless', version: '1.0.0', api: '^0.1' },
			setup(ctx) {
				ctx.agencies.register(
					defineAgency({
						id: 'test-reckless.yolo',
						name: 'Reckless Rocketry',
						personality: { aggressiveness: 1, risk: 1 },
						budget: { start: 1e6, monthly: 1e5 },
						programme: [
							{
								id: 'r',
								kind: 'relay',
								altitude: 2_000_000,
								cost: 1_000,
								success: 1,
								prepDays: 4,
								lifeDays: 5,
								rent: 100
							}
						]
					})
				);
			}
		});
		const base = legacyWorldInfo(5);
		const sim = await createSim({
			plugins: [reckless, Stock, openTree],
			backendFactory: rapier(8),
			world: {
				...base,
				id: 'agencies-reckless',
				preset: 'stock.career',
				rules: { ...base.rules, 'stock.agency-count': 1 }
			}
		});
		expect(sim.registries.agencies.list()[0]!.id).toBe('test-reckless.yolo');
		const offers = new Set<string>();
		sim.events.on('world:tick', () => {
			for (const o of sim.snapshot().contracts?.offers ?? [])
				if (o.template.startsWith('agency.')) offers.add(o.title);
		});
		warp(sim, 150 * day(sim));
		const news = sim.snapshot().agencies!.news.map((n) => n.text);
		expect(news.some((t) => t.startsWith('Reckless Rocketry lost a relay'))).toBe(true);
		expect([...offers]).toEqual(["Restore Reckless Rocketry's relay orbit"]);
		expect(sim.snapshot().agencies!.agencies.map((a) => a.id)).toEqual(['test-reckless.yolo']);
		sim.dispose();
	}, 60_000);
});
