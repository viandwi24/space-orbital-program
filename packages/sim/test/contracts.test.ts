/** Procedural contracts (plan 099, ADR 0186): the generator, slots, rewards, penalties, the save. */
import { describe, expect, test } from 'bun:test';
import {
	CONTRACT_COOLDOWN_DAYS,
	CONTRACT_OFFER_CAP,
	GRAVITATIONAL_CONSTANT,
	legacyWorldInfo,
	type Plugin,
	type Snapshot
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';
import { defineContractTemplate, definePlugin } from '@orbital/sdk';

const career = (seed: number) => ({
	...legacyWorldInfo(seed),
	id: `contracts-${seed}`,
	preset: 'stock.career'
});
const make = (seed = 3, resume?: unknown, extra: Plugin[] = []) =>
	createSim({
		plugins: [Stock, openTree, ...extra],
		backendFactory: rapier(8),
		world: career(seed),
		...(resume ? { resume } : {})
	});

const day = (sim: Sim) => tickDayLength(sim.registries.bodies.list());

/** Runs to the start of `n` days later on rails (as the career bot does). */
function warpDays(sim: Sim, n: number): void {
	const to = sim.time + n * day(sim);
	const r = sim.dispatch({ type: 'warp-to', time: to, factor: 1e4 });
	if (!r.ok) throw new Error(r.reason);
	for (let g = 0; (sim.time < to - 1e-6 || sim.warp !== 1) && g < 1e5; g++) sim.step(10);
}

const contracts = (sim: Sim) => sim.snapshot().contracts!;
const funds = (snap: Snapshot) => snap.economy!.funds;

describe('the offer generator', () => {
	test('the same seed gives the same offers; offers never exceed the cap', async () => {
		const run = async () => {
			const sim = await make(3);
			const seen: string[] = [];
			let most = 0;
			sim.events.on('world:tick', () => {
				const c = sim.snapshot().contracts!;
				most = Math.max(most, c.offers.length);
				for (const o of c.offers)
					if (!seen.includes(`${o.id} ${o.key}`)) seen.push(`${o.id} ${o.key}`);
			});
			warpDays(sim, 40);
			sim.dispose();
			return { seen, most };
		};
		const a = await run();
		const b = await run();
		expect(a.seen.length).toBeGreaterThan(5);
		expect(a.seen).toEqual(b.seen);
		// at reputation 0 only tier 1 is open: two altitude records and one orbit at most
		expect(a.most).toBe(3);
		// another seed, other offers
		const other = await make(4);
		warpDays(other, 40);
		const keys = contracts(other).offers.map((o) => o.key);
		expect(keys).not.toEqual(a.seen.slice(-keys.length).map((s) => s.split(' ')[1]));
		other.dispose();
	});

	test('a declined offer does not come back during its cooldown', async () => {
		const sim = await make(5);
		warpDays(sim, 6);
		const offer = contracts(sim).offers[0]!;
		expect(sim.dispatch({ type: 'contract-decline', offer: offer.id }).ok).toBe(true);
		expect(contracts(sim).offers.some((o) => o.id === offer.id)).toBe(false);
		const keys = new Set<string>();
		sim.events.on('world:tick', () => {
			for (const o of sim.snapshot().contracts!.offers) keys.add(o.key);
		});
		warpDays(sim, CONTRACT_COOLDOWN_DAYS - 1);
		expect(keys.has(offer.key)).toBe(false);
		expect(sim.save().contracts!.cooldowns.some((c) => c.key === offer.key)).toBe(true);
		sim.dispose();
	});

	test('offers carry an advance, a reward, a penalty, a deadline and their expected value', async () => {
		const sim = await make(3);
		warpDays(sim, 12);
		const c = contracts(sim);
		expect(c.enabled).toBe(true);
		for (const o of c.offers) {
			const reward = o.reward.find((e) => e.currency === 'funds')!.amount;
			expect(o.advance[0]!.amount).toBeGreaterThan(0);
			expect(o.penalty[0]!.amount).toBeLessThan(0);
			expect(o.deadline).toBeGreaterThan(day(sim));
			expect(o.estimate.cost).toBeGreaterThan(0);
			expect(o.value).toBe(o.advance[0]!.amount + reward - o.estimate.cost);
			expect(o.value).toBeGreaterThan(0);
		}
		sim.dispose();
	});
});

/** Warps until an offer from `template` is on the board, and returns its id. */
function waitFor(sim: Sim, template: string): string {
	for (let i = 0; i < 200; i++) {
		const o = contracts(sim).offers.find((x) => x.template === template);
		if (o) return o.id;
		warpDays(sim, 1);
	}
	throw new Error(`no ${template} offer in 200 days`);
}

describe('accepted contracts', () => {
	test('accepting pays the advance; completing books the reward', async () => {
		const sim = await make(3);
		const id = waitFor(sim, 'stock.contract-orbit');
		const offer = contracts(sim).offers.find((o) => o.id === id)!;
		const before = funds(sim.snapshot());
		expect(sim.dispatch({ type: 'contract-accept', offer: id }).ok).toBe(true);
		expect(funds(sim.snapshot()) - before).toBe(offer.advance[0]!.amount);
		expect(contracts(sim).used).toBe(1);
		// a probe on the orbit the contract asks for: circular between its two altitudes
		const p = offer.objectives as { params: { minPeriapsis: number; maxApoapsis: number } };
		const home = sim.registries.bodies.get('stock.home')!;
		const r = home.radius + (p.params.minPeriapsis + p.params.maxApoapsis) / 2;
		const v = Math.sqrt((GRAVITATIONAL_CONSTANT * home.mass) / r);
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: stack('Probe', ['stock.probe-core'], []),
			placement: { kind: 'state', position: { x: r, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -v } }
		});
		expect(placed.ok).toBe(true);
		const mid = funds(sim.snapshot());
		sim.step(0.1);
		const entries = sim.save().economy!.entries.filter((e) => e.cause === id);
		expect(entries.map((e) => e.currency).sort()).toEqual(['funds', 'reputation']);
		const reward = offer.reward.find((e) => e.currency === 'funds')!.amount;
		expect(funds(sim.snapshot()) - mid).toBeCloseTo(reward, 6);
		const done = contracts(sim).contracts.find((c) => c.id === id)!;
		expect(done.status).toBe('done');
		expect(contracts(sim).used).toBe(0);
		sim.dispose();
	});

	test('missing the deadline books the penalty; cancelling books it too', async () => {
		const sim = await make(3);
		const id = waitFor(sim, 'stock.contract-altitude');
		const offer = contracts(sim).offers.find((o) => o.id === id)!;
		expect(sim.dispatch({ type: 'contract-accept', offer: id }).ok).toBe(true);
		warpDays(sim, Math.ceil(offer.deadline / day(sim)) + 1);
		const booked = sim.save().economy!.entries.filter((e) => e.cause === id);
		expect(booked).toEqual(
			offer.penalty.map((p) => expect.objectContaining({ currency: p.currency, amount: p.amount }))
		);
		expect(contracts(sim).contracts.find((c) => c.id === id)!.status).toBe('failed');

		const next = waitFor(sim, 'stock.contract-orbit');
		expect(sim.dispatch({ type: 'contract-accept', offer: next }).ok).toBe(true);
		const before = funds(sim.snapshot());
		expect(sim.dispatch({ type: 'contract-cancel', contract: next }).ok).toBe(true);
		const penalty = contracts(sim).contracts.find((c) => c.id === next)!.penalty[0]!.amount;
		expect(funds(sim.snapshot()) - before).toBe(penalty);
		expect(sim.dispatch({ type: 'contract-cancel', contract: next }).ok).toBe(false);
		sim.dispose();
	});

	test('slots are the Mission Center capacity; a full board says which upgrade lifts it', async () => {
		const sim = await make(3);
		const slots = contracts(sim).slots;
		expect(slots).not.toBeNull();
		let accepted = 0;
		for (let guard = 0; accepted < slots! && guard < 300; guard++) {
			const o = contracts(sim).offers[0];
			if (o && sim.dispatch({ type: 'contract-accept', offer: o.id }).ok) accepted++;
			else warpDays(sim, 1);
		}
		expect(contracts(sim).used).toBe(slots!);
		warpDays(sim, 1);
		const extra = contracts(sim).offers[0]!;
		const r = sim.dispatch({ type: 'contract-accept', offer: extra.id });
		expect(r.ok).toBe(false);
		expect((r as { reason: string }).reason).toMatch(
			/contract slots are in use; Mission Center level \d/
		);
		sim.dispose();
	});

	test('a save resumes the board, the accepted contracts and the stream', async () => {
		const sim = await make(3);
		const id = waitFor(sim, 'stock.contract-orbit');
		sim.dispatch({ type: 'contract-accept', offer: id });
		const resumed = await make(3, sim.save());
		expect(resumed.snapshot().contracts).toEqual(sim.snapshot().contracts);
		warpDays(sim, 10);
		warpDays(resumed, 10);
		expect(resumed.snapshot().contracts).toEqual(sim.snapshot().contracts);
		sim.dispose();
		resumed.dispose();
	});

	test('with the rule off there are no offers', async () => {
		const sim = await make(3);
		sim.dispatch({ type: 'debug-mode', on: true }); // a rule fixed at creation (plan 230)
		sim.dispatch({ type: 'set-rule', rule: 'stock.contracts', value: false });
		warpDays(sim, 10);
		expect(sim.snapshot().contracts).toBeUndefined();
		sim.dispose();
	});

	test('a template with room for many still stops at the cap, one new offer a day', async () => {
		const many = definePlugin({
			meta: { id: 'test-many', version: '1.0.0', api: '^0.1' },
			depends: ['stock'],
			setup(ctx) {
				ctx.contractTemplates.register(
					defineContractTemplate({
						id: 'test-many.hop',
						label: 'Hop',
						tier: 1,
						weight: 100,
						maxOffers: 50,
						generate: (c) => {
							const h = 1_000 + Math.floor(c.random() * 1e6);
							return {
								key: `hop:${h}`,
								title: `Hop to ${h} m`,
								brief: '',
								objectives: { objective: 'stock.reach-altitude', params: { min: h } },
								advance: [{ currency: 'funds', amount: 100 }],
								reward: [{ currency: 'funds', amount: 1_000 }],
								penalty: [{ currency: 'funds', amount: -500 }],
								deadline: 10 * c.dayLength,
								deltaV: 100
							};
						}
					})
				);
			}
		});
		const sim = await make(3, undefined, [many]);
		const counts: number[] = [];
		sim.events.on('world:tick', () => counts.push(sim.snapshot().contracts!.offers.length));
		warpDays(sim, 20);
		expect(Math.max(...counts)).toBe(CONTRACT_OFFER_CAP);
		for (let i = 1; i < counts.length; i++)
			expect(counts[i]! - counts[i - 1]!).toBeLessThanOrEqual(1);
		sim.dispose();
	});

	test('only vessels launched after the acceptance count', async () => {
		const sim = await make(3);
		const id = waitFor(sim, 'stock.contract-orbit');
		const offer = contracts(sim).offers.find((o) => o.id === id)!;
		const p = offer.objectives as { params: { minPeriapsis: number; maxApoapsis: number } };
		const home = sim.registries.bodies.get('stock.home')!;
		const r = home.radius + (p.params.minPeriapsis + p.params.maxApoapsis) / 2;
		const v = Math.sqrt((GRAVITATIONAL_CONSTANT * home.mass) / r);
		const probe = () =>
			sim.dispatch({
				type: 'load-vessel',
				design: stack('Probe', ['stock.probe-core'], []),
				placement: {
					kind: 'state',
					position: { x: r, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: -v }
				}
			});
		expect(probe().ok).toBe(true); // already up there
		sim.step(0.1);
		expect(sim.dispatch({ type: 'contract-accept', offer: id }).ok).toBe(true);
		sim.step(0.1);
		const status = () => contracts(sim).contracts.find((c) => c.id === id)!.status;
		expect(status()).toBe('active');
		expect(probe().ok).toBe(true); // a new launch
		sim.step(0.1);
		expect(status()).toBe('done');
		sim.dispose();
	});
});
