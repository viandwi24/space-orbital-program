/**
 * Plan 284 (ADR 0264): cargo and deployed stations. An engineer takes a battery off a hull and fixes
 * it to another side, and it keeps its charge; a station of a control unit, a panel, an antenna and
 * an experiment yields science each day, and none without power.
 */
import { describe, expect, test } from 'bun:test';
import {
	legacyWorldInfo,
	partId,
	type CommandResult,
	type EntityId,
	type VesselDesign,
	type VesselSnapshot
} from '@orbital/core';
import Stock, { HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { rapier } from './helpers/vessels.ts';

const DAY = tickDayLength([SunBody, HomeBody, MoonBody]);
const world = () => ({
	...legacyWorldInfo(1),
	id: '9d4c2b1a-6e5f-4a3b-8c7d-0e1f2a3b4c5d',
	preset: 'stock.career',
	rules: {
		...legacyWorldInfo(1).rules,
		'stock.tech-tree': false,
		'stock.life-support': 'off'
	}
});
const made = (r: CommandResult): EntityId => {
	if (!r.ok) throw new Error(r.reason);
	return r.vessel as EntityId;
};
const vessel = (sim: Sim, id: EntityId): VesselSnapshot =>
	sim.snapshot().vessels.find((v) => v.id === id)!;
const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
function days(sim: Sim, n: number): void {
	sim.dispatch({ type: 'warp', factor: 1e4 });
	const at = sim.snapshot().t;
	sim.step(((Math.floor(at / DAY) + n) * DAY + 1 - at) / 1e4);
	sim.dispatch({ type: 'warp', factor: 1 });
}

/** A pod with `parts` hung round its side, an engineer aboard, and the engineer outside. */
async function outside(parts: string[]) {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(8), world: world() });
	expect(sim.dispatch({ type: 'crew-hire', profession: 'engineer' }).ok).toBe(true);
	const design: VesselDesign = {
		formatVersion: 3,
		name: 'Depot',
		parts: [
			{ index: 0, part: partId('stock.command-pod'), parent: null },
			...parts.map((part, k) => ({
				index: k + 1,
				part: partId(part),
				parent: {
					index: 0,
					parentNode: 'surface',
					node: 'radial',
					radial: { angle: 0.8 + k * 1.1, y: 0 }
				}
			}))
		],
		stages: []
	};
	const member = sim.snapshot().crew!.find((c) => c.profession === 'engineer')!.id;
	const ship = made(
		sim.dispatch({
			type: 'load-vessel',
			design,
			placement: { kind: 'surface' },
			crew: [{ member, part: 0 }]
		})
	);
	run(sim, 3);
	const suit = made(sim.dispatch({ type: 'crew-eva', vessel: ship, member }));
	run(sim, 2);
	const partOf = (definition: string) =>
		vessel(sim, ship).parts.find((p) => String(p.definition) === definition)!.id;
	return { sim, ship, suit, partOf };
}

describe('cargo (plan 284)', () => {
	test('an engineer takes a battery off a hull and fixes it on another side; it keeps its charge', async () => {
		const { sim, ship, suit, partOf } = await outside(['stock.battery-radial']);
		const battery = partOf('stock.battery-radial');
		const charge = () =>
			(
				vessel(sim, ship).parts.find((p) => String(p.definition) === 'stock.battery-radial')!
					.modules['stock.resource-container'] as { amounts: Record<string, number> }
			).amounts['stock.electric-charge'];
		const before = charge();
		expect(before ?? 0).toBeGreaterThan(0);
		const detached = sim.dispatch({ type: 'cargo-detach', suit, part: battery });
		expect(detached.ok ? '' : detached.reason).toBe('');
		expect(vessel(sim, ship).parts.map((p) => String(p.definition))).toEqual(['stock.command-pod']);
		expect(vessel(sim, suit).parts[0]!.modules['stock.inventory']).toEqual({
			items: ['stock.battery-radial']
		});
		const pod = vessel(sim, ship).parts[0]!.id;
		const attached = sim.dispatch({
			type: 'cargo-attach',
			suit,
			host: pod,
			index: 0,
			angle: Math.PI,
			y: 0
		});
		expect(attached.ok ? '' : attached.reason).toBe('');
		expect(vessel(sim, ship).parts.map((p) => String(p.definition))).toEqual([
			'stock.command-pod',
			'stock.battery-radial'
		]);
		expect(charge()).toBeCloseTo(before!, 6);
		run(sim, 2);
		expect(charge()).toBeCloseTo(before!, 6);
		sim.dispose();
	}, 60_000);

	test('a part that is not cargo stays, and a pilot cannot attach', async () => {
		const { sim, suit, ship } = await outside([]);
		const pod = vessel(sim, ship).parts[0]!.id;
		expect(sim.dispatch({ type: 'cargo-detach', suit, part: pod }).ok).toBe(false);
		sim.dispose();
	}, 60_000);
});

describe('a deployed station (plan 284)', () => {
	async function station(items: string[]) {
		const o = await outside(items);
		for (const item of items) {
			const d = o.sim.dispatch({ type: 'cargo-detach', suit: o.suit, part: o.partOf(item) });
			expect(d.ok ? '' : d.reason).toBe('');
			const p = o.sim.dispatch({ type: 'cargo-place', suit: o.suit, index: 0 });
			expect(p.ok ? '' : p.reason).toBe('');
			run(o.sim, 1);
		}
		// the items come to rest on the ground, which is where their situation is landed
		run(o.sim, 8);
		return o;
	}
	const science = (sim: Sim) => (sim.snapshot().science ?? []).reduce((s, x) => s + x.credited, 0);

	test('a control unit, a panel and an RTG, an antenna and an experiment yield science each day', async () => {
		const { sim } = await station([
			'stock.station-control',
			'stock.station-rtg',
			'stock.station-antenna',
			'stock.station-goo'
		]);
		const reports = sim.snapshot().stations ?? [];
		expect(reports).toHaveLength(1);
		expect(reports[0]!.working).toBe(true);
		const before = science(sim);
		days(sim, 2);
		expect(science(sim)).toBeGreaterThan(before);
		sim.dispose();
	}, 120_000);

	test('without power it yields none', async () => {
		const { sim } = await station([
			'stock.station-control',
			'stock.station-antenna',
			'stock.station-goo'
		]);
		const report = (sim.snapshot().stations ?? [])[0]!;
		expect(report.working).toBe(false);
		expect(report.reason).toContain('power');
		const before = science(sim);
		days(sim, 2);
		expect(science(sim)).toBe(before);
		sim.dispose();
	}, 120_000);
});
