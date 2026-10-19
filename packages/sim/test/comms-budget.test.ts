/** Comms tier 2 (plan 116, ADR 0185): the link budget in the sim, the comms scale, the inspector. */
import { describe, expect, test } from 'bun:test';
import { RATE_LADDER, type EntityId, type Snapshot, type Vec3 } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { bestBudget } from '../src/comms.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

const make = () => createSim({ plugins: [Stock, openTree], backendFactory: rapier(16) });

/** A probe core (its built-in whip: S band, 2 dBi, 5 W) `d` m straight above the first station. */
function above(sim: Sim, d: number): EntityId {
	const snap = sim.snapshot();
	const station = snap.network!.stations[0]!;
	const home = snap.bodies.find((b) => String(b.id) === station.body)!.position;
	const rel: Vec3 = {
		x: station.position.x - home.x,
		y: station.position.y - home.y,
		z: station.position.z - home.z
	};
	const r = Math.hypot(rel.x, rel.y, rel.z);
	const k = (r + d) / r;
	const r0 = sim.dispatch({
		type: 'load-vessel',
		design: stack('Probe', ['stock.probe-core'], []),
		placement: {
			kind: 'state',
			body: station.body,
			position: { x: rel.x * k, y: rel.y * k, z: rel.z * k },
			velocity: { x: 0, y: 0, z: 0 }
		} as never
	});
	if (!r0.ok) throw new Error(r0.reason);
	return r0.vessel!;
}

const link = (snap: Snapshot, id: EntityId) => snap.network!.vessels.find((v) => v.vessel === id)!;

describe('the link budget in the sim', () => {
	test('doubling the distance lowers the margin by 6.02 dB and steps the rate down at 10 dB marks', async () => {
		const sim = await make();
		const near = above(sim, 2e6);
		const far = above(sim, 4e6);
		const snap = sim.snapshot();
		const a = link(snap, near);
		const b = link(snap, far);
		expect(a.to).toBe(b.to);
		expect(a.margin! - b.margin!).toBeCloseTo(20 * Math.log10(2), 2);
		// the margins straddle the 60 dB mark: 1 Gbit/s near, 100 Mbit/s twice as far
		expect(a.margin!).toBeGreaterThan(60);
		expect(b.margin!).toBeLessThan(60);
		expect(a.rate).toBe(1e9);
		expect(b.rate).toBe(1e8);
		// every rate is the ladder step of floor(margin / 10)
		for (const l of [a, b])
			expect(l.rate).toBe(RATE_LADDER[Math.min(6, Math.floor(l.margin! / 10))]!);
		sim.dispose();
	});

	test('the comms scale divides the distance: scale 2 gains 6.02 dB', async () => {
		const sim = await make();
		const id = above(sim, 4e6);
		const before = link(sim.snapshot(), id).margin!;
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.comms-scale', value: 2 }).ok).toBe(true);
		const after = link(sim.snapshot(), id).margin!;
		expect(after - before).toBeCloseTo(20 * Math.log10(2), 2);
		sim.dispose();
	});

	test('comms-inspect carries the full budget of one vessel; null drops it', async () => {
		const sim = await make();
		const id = above(sim, 2e6);
		expect(sim.snapshot().network!.inspector).toBeUndefined();
		expect(sim.dispatch({ type: 'comms-inspect', vessel: id }).ok).toBe(true);
		sim.step(1.5);
		const inspector = sim.snapshot().network!.inspector!;
		expect(inspector.vessel).toBe(id);
		const budget = inspector.budget!;
		expect(budget.band).toBe('stock.s');
		expect(budget.txGain).toBe(2);
		expect(budget.txPower).toBeCloseTo(10 * Math.log10(5), 9);
		// a tier-1 site receives with a 9 m dish (plan 234): 44.85 dBi of a 10 m dish less 20 log 0.9
		expect(budget.rxGain).toBeCloseTo(44.85 + 20 * Math.log10(0.9), 2);
		expect(budget.received).toBeCloseTo(
			budget.txPower + budget.txGain + budget.rxGain - budget.pathLoss,
			9
		);
		expect(budget.rate).toBe(link(sim.snapshot(), id).rate!);
		expect(sim.dispatch({ type: 'comms-inspect', vessel: null }).ok).toBe(true);
		expect(sim.snapshot().network!.inspector).toBeUndefined();
		sim.dispose();
	});

	test('an antenna without a known band, or two vessels without a common one, have no budget', async () => {
		const sim = await make();
		const core = { registries: sim.registries } as never;
		const whip = sim.registries.antennas.get('stock.whip')!;
		const dish = sim.registries.antennas.get('stock.dish')!;
		const bandless = { ...whip, band: undefined };
		const unknown = { ...whip, band: 'test.nothing' };
		expect(
			bestBudget(core, { antennas: [bandless, unknown] }, { aperture: 10 }, 1e6, 1)
		).toBeNull();
		// S band to X band only: no common band
		expect(bestBudget(core, { antennas: [whip] }, { antennas: [dish] }, 1e6, 1)).toBeNull();
		// the best pair wins: the dish's X band beats the whip's S band to a station
		expect(bestBudget(core, { antennas: [whip, dish] }, { aperture: 10 }, 1e6, 1)!.band).toBe(
			'stock.x'
		);
		sim.dispose();
	});
});
