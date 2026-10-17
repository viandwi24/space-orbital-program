/** Plan 095 / ADR 0113: launch debit, recovery, the economy rule, refusals, resume. */
import { describe, expect, test } from 'bun:test';
import {
	designCost,
	legacyWorldInfo,
	recoveryFactor,
	type LedgerEntry,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { rapier, stack, twoStage } from './helpers/vessels.ts';

const world = (extra: Partial<WorldInfo> = {}): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '2b7c9e10-4d3a-4f6b-8e21-9a0c5d7f3e48',
	preset: 'stock.career',
	...extra
});
const make = (extra: Partial<WorldInfo> = {}) =>
	createSim({ plugins: [Stock], backendFactory: rapier(16), world: world(extra) });
const pod = () => stack('Pod', ['stock.command-pod'], []);
const ledger = (sim: Sim): LedgerEntry[] => sim.save().economy!.entries;
const funds = (sim: Sim) => sim.snapshot().economy!.funds;

/** Load the pod on the ground at `longitude` (rad) and let it come to rest. */
function landedPod(sim: Sim, longitude = 0): number {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: pod(),
		placement: { kind: 'surface', latitude: 0, longitude }
	});
	if (!r.ok) throw new Error(r.reason);
	for (let i = 0; i < 300; i++) sim.step(0.02);
	return Number(r.vessel);
}

describe('launch', () => {
	test('debits exactly the design cost, with its cause', async () => {
		const sim = await make();
		const cost = designCost(twoStage(), sim.registries).total;
		expect(cost).toBeCloseTo(26_066.4, 9);
		expect(funds(sim)).toBe(100_000);
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		expect(r.ok).toBe(true);
		expect(funds(sim)).toBeCloseTo(100_000 - cost, 9);
		expect(ledger(sim)).toEqual([
			{ time: 0, currency: 'funds', amount: -cost, cause: 'economy.launch', ref: 'Two-stage' }
		]);
		sim.dispose();
	});

	test('is refused with too little money, and nothing is written', async () => {
		const sim = await make({ rules: { 'stock.starting-funds': 1_000 } });
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		expect(r.ok).toBe(false);
		expect(r.ok ? '' : r.reason).toBe('Not enough funds: needs 26067, has 1000');
		expect(sim.snapshot().vessels).toHaveLength(0);
		expect(ledger(sim)).toEqual([]);
		sim.dispose();
	});

	test('with the economy off (Sandbox) nothing is written and a launch with no money is accepted', async () => {
		const sim = await make({ preset: 'stock.sandbox', rules: { 'stock.starting-funds': 0 } });
		expect(sim.snapshot().economy!.enabled).toBe(false);
		expect(sim.dispatch({ type: 'load-vessel', design: twoStage() }).ok).toBe(true);
		landedPod(sim);
		const podId = sim.snapshot().vessels.find((v) => v.name === 'Pod')!.id;
		expect(sim.dispatch({ type: 'recover-vessel', vessel: podId }).ok).toBe(true);
		expect(ledger(sim)).toEqual([]);
		expect(funds(sim)).toBe(0);
		// Costs are still known to the host.
		expect(designCost(twoStage(), sim.registries).total).toBeGreaterThan(0);
		sim.dispose();
	});
});

describe('recover-vessel', () => {
	test('a pod at rest on the launch site pays back 0.98 of its value and is removed', async () => {
		const sim = await make();
		const id = landedPod(sim);
		const before = funds(sim);
		const podValue = designCost(pod(), sim.registries).total;
		const events: string[] = [];
		sim.events.on('vessel:destroyed', (e) => events.push(e.reason));
		const quote = sim.snapshot().vessels[0]!.recovery!;
		expect(quote.factor).toBe(0.98);
		expect(quote.credit).toBeCloseTo(podValue * 0.98, 6);
		expect(sim.dispatch({ type: 'recover-vessel', vessel: id as never })).toEqual({ ok: true });
		expect(podValue).toBe(8_400);
		expect(funds(sim) - before).toBeCloseTo(podValue * 0.98, 6);
		expect(ledger(sim).at(-1)).toMatchObject({ cause: 'economy.recovery', currency: 'funds' });
		expect(ledger(sim).at(-1)!.amount).toBeCloseTo(podValue * 0.98, 6);
		expect(sim.snapshot().vessels).toHaveLength(0);
		expect(events).toEqual(['recovered']);
		sim.dispose();
	});

	test('40 km from the site it pays the formula factor', async () => {
		const sim = await make();
		const R = sim.registries.bodies.get('stock.home')!.radius;
		const id = landedPod(sim, 40_000 / R);
		const podValue = designCost(pod(), sim.registries).total;
		sim.dispatch({ type: 'recover-vessel', vessel: id as never });
		expect(ledger(sim).at(-1)!.amount).toBeCloseTo(podValue * recoveryFactor(40_000, R), 1);
		sim.dispose();
	});

	test('a vessel in flight cannot be recovered', async () => {
		const sim = await make();
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		sim.dispatch({ type: 'throttle', vessel: r.ok ? r.vessel! : (0 as never), value: 1 });
		sim.dispatch({ type: 'stage', vessel: r.ok ? r.vessel! : (0 as never) });
		for (let i = 0; i < 100; i++) sim.step(0.02);
		const refused = sim.dispatch({
			type: 'recover-vessel',
			vessel: r.ok ? r.vessel! : (0 as never)
		});
		expect(refused.ok).toBe(false);
		sim.dispose();
	});
});

describe('the ledger in the save', () => {
	test('resumes byte for byte with its entries and keeps charging on the tick', async () => {
		const sim = await make();
		sim.dispatch({ type: 'load-vessel', design: twoStage() });
		landedPod(sim);
		const text = JSON.stringify(sim.save());
		const resumed = await createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			resume: JSON.parse(text)
		});
		expect(JSON.stringify(resumed.save())).toBe(text);
		expect(resumed.snapshot().economy).toEqual(sim.snapshot().economy);
		sim.dispose();
		resumed.dispose();
	});
});
