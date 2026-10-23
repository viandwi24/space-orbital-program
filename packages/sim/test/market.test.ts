/** Plan 097 / ADR 0124: production into site storage, launch fuel, trades, resume. */
import { describe, expect, test } from 'bun:test';
import { designContents, legacyWorldInfo, type WorldInfo } from '@orbital/core';
import Stock, { HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { rapier, twoStage } from './helpers/vessels.ts';

const DAY = tickDayLength([SunBody, HomeBody, MoonBody]);
const world = (rules: WorldInfo['rules'] = {}): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '7c2e9a14-3b5d-4f6e-8a1b-2c3d4e5f6a7b',
	preset: 'stock.career',
	rules: { ...legacyWorldInfo(1).rules, ...rules }
});
const make = (rules: WorldInfo['rules'] = {}) =>
	createSim({ plugins: [Stock], backendFactory: rapier(8), world: world(rules) });
const funds = (sim: Sim) => sim.snapshot().economy!.funds;
const stored = (sim: Sim, commodity: string) =>
	sim.snapshot().economy!.storage?.find((s) => s.site === 'legacy')?.items[commodity] ?? 0;
const LF = 'stock.liquid-fuel';
const OX = 'stock.oxidizer';

/** Advance whole days at warp 1e6, landing a little past the boundary. */
function days(sim: Sim, n: number): void {
	sim.dispatch({ type: 'warp', factor: 1e4 });
	const at = sim.snapshot().t;
	const target = (Math.floor(at / DAY) + n) * DAY + 1;
	sim.step((target - at) / 1e4);
	sim.dispatch({ type: 'warp', factor: 1 });
}

/** A propellant plant on the Legacy site, built (10 days at level 1). */
function plant(sim: Sim): void {
	const r = sim.dispatch({
		type: 'place-building',
		site: 'legacy',
		kind: 'stock.propellant-plant',
		cell: { i: 20, j: -12 },
		rotation: 0,
		id: 'plant'
	});
	if (!r.ok) throw new Error(r.reason);
	days(sim, sim.registries.buildings.get('stock.propellant-plant')!.levels[0]!.buildDays);
	const b = sim.snapshot().sites![0]!.buildings.find((x) => x.id === 'plant')!;
	expect(b.state).toBe('active');
}

describe('production (ADR 0124 point 5)', () => {
	test('a level 1 plant adds 200 u of fuel and 245 u of oxidizer a day, up to the storage capacity', async () => {
		const sim = await make();
		plant(sim);
		const lf0 = stored(sim, LF);
		const ox0 = stored(sim, OX);
		days(sim, 10);
		expect(stored(sim, LF) - lf0).toBe(2_000);
		expect(stored(sim, OX) - ox0).toBe(2_450);
		days(sim, 60);
		const capacity = sim.snapshot().economy!.storage!.find((s) => s.site === 'legacy')!.capacity;
		expect(capacity).toBe(20_000);
		expect(stored(sim, LF) + stored(sim, OX)).toBe(capacity);
		sim.dispose();
	});

	test('a day that ends in debt makes nothing', async () => {
		// a company with the plant built and 1 000 left; its month nets 0 (services +6 000, operations
		// −3 200, upkeep −2 800; ADRs 0322 and 0324), so a 2 000 debit (debug) puts it in debt until a loan
		const sim = await make({ 'stock.agency-type': 'company', 'stock.starting-funds': 81_000 });
		plant(sim);
		expect(sim.dispatch({ type: 'debug-mode', on: true }).ok).toBe(true);
		expect(sim.dispatch({ type: 'debug-grant', funds: -2_000 }).ok).toBe(true);
		expect(funds(sim)).toBe(-1_000);
		const made: Array<{ funds: number; lf: number }> = [];
		sim.events.on('world:tick', () => made.push({ funds: funds(sim), lf: stored(sim, LF) }));
		days(sim, 20);
		expect(sim.dispatch({ type: 'loan-take', amount: 25_000 }).ok).toBe(true);
		days(sim, 20);
		// days in debt make nothing; once the loan clears the debt, production resumes
		expect(made.some((d) => d.funds < 0)).toBe(true);
		expect(made.some((d) => d.funds >= 0)).toBe(true);
		for (let i = 1; i < made.length; i++) {
			const step = made[i]!.lf - made[i - 1]!.lf;
			expect(step).toBe(made[i]!.funds < 0 ? 0 : 200);
		}
		sim.dispose();
	});
});

describe('launch fuel (ADR 0124 point 6)', () => {
	test('fuel comes from site storage first and the rest is bought at today’s price; the entries add up', async () => {
		const sim = await make({ 'stock.starting-funds': 200_000 });
		plant(sim);
		days(sim, 1); // a plant runs on its ready day too: 400 u of fuel and 490 u of oxidizer in storage
		const need = designContents(twoStage(), sim.registries);
		const lfHeld = stored(sim, LF);
		expect(lfHeld).toBeLessThan(need.get(LF)!);
		const price = sim.snapshot().economy!.markets!.find((m) => m.id === LF)!.price;
		const before = funds(sim);
		const count = sim.save().economy!.entries.length;
		expect(sim.dispatch({ type: 'load-vessel', design: twoStage() }).ok).toBe(true);
		const entries = sim.save().economy!.entries.slice(count);
		expect(entries.map((e) => e.cause)).toEqual([
			'economy.launch',
			'stock.market-buy',
			'stock.market-buy'
		]);
		const fuel = entries.find((e) => e.ref?.startsWith(LF))!;
		expect(fuel.amount).toBeCloseTo(-(need.get(LF)! - lfHeld) * price, 9);
		expect(stored(sim, LF)).toBe(0);
		expect(entries.reduce((t, e) => t + e.amount, 0)).toBeCloseTo(funds(sim) - before, 9);
		sim.dispose();
	});
});

describe('trades (ADR 0124 point 7)', () => {
	test('buying needs storage and funds; selling needs the units; fixed services are not traded', async () => {
		const sim = await make();
		const noRoom = sim.dispatch({ type: 'market-buy', commodity: LF, amount: 10, site: 'legacy' });
		expect(noRoom.ok ? '' : noRoom.reason).toBe('not enough storage at the site: room for 0 u');
		plant(sim);
		expect(
			sim.dispatch({ type: 'market-buy', commodity: LF, amount: 1_000, site: 'legacy' }).ok
		).toBe(true);
		const tooMuch = sim.dispatch({
			type: 'market-sell',
			commodity: OX,
			amount: 1e6,
			site: 'legacy'
		});
		expect(tooMuch.ok ? '' : tooMuch.reason).toMatch(/^the site holds \d+ u of Oxidizer$/);
		const fixed = sim.dispatch({
			type: 'market-buy',
			commodity: 'stock.data',
			amount: 1,
			site: 'legacy'
		});
		expect(fixed.ok ? '' : fixed.reason).toBe('Data has a fixed price and is not traded yet');
		const before = funds(sim);
		expect(
			sim.dispatch({ type: 'market-sell', commodity: LF, amount: 500, site: 'legacy' }).ok
		).toBe(true);
		expect(funds(sim)).toBeGreaterThan(before);
		sim.dispose();
	});
});

describe('resume (ADR 0124 point 2)', () => {
	test('markets and storage resume byte for byte after 30 days of trades', async () => {
		const sim = await make();
		plant(sim);
		for (let d = 0; d < 30; d++) {
			sim.dispatch({ type: 'market-sell', commodity: LF, amount: 150, site: 'legacy' });
			days(sim, 1);
		}
		const save = sim.save();
		expect(Object.keys(save.economy!.markets!)).toEqual([LF, 'stock.oxidizer']);
		const resumed = await createSim({ plugins: [Stock], backendFactory: rapier(8), resume: save });
		expect(JSON.stringify(resumed.save().economy)).toBe(JSON.stringify(save.economy));
		for (const s of [sim, resumed]) {
			s.dispatch({ type: 'market-sell', commodity: LF, amount: 150, site: 'legacy' });
			days(s, 5);
		}
		expect(JSON.stringify(resumed.save().economy)).toBe(JSON.stringify(sim.save().economy));
		sim.dispose();
		resumed.dispose();
	});
});

describe('recovered fuel goes to the site, not to funds (system audit D2)', () => {
	test('a full rocket recovered on the pad: its fuel lands in storage, its hardware pays funds', async () => {
		const sim = await make({ 'stock.starting-funds': 500_000 });
		plant(sim); // the site's storage
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage(), crew: [] });
		if (!r.ok) throw new Error(r.reason);
		for (let i = 0; i < 200; i++) sim.step(0.02);
		const quote = sim.snapshot().vessels.find((v) => v.id === r.vessel)!.recovery!;
		expect(quote.factor).toBe(1);
		expect(quote.site).toBe('legacy');
		const lf = quote.stored!.find((x) => x.commodity === LF)!.amount;
		expect(lf).toBeGreaterThan(0);
		// the funds are the hardware alone: the value less the fuel's static price
		expect(quote.credit).toBeLessThan(quote.value);
		const f0 = funds(sim);
		const lf0 = stored(sim, LF);
		expect(sim.dispatch({ type: 'recover-vessel', vessel: r.vessel! }).ok).toBe(true);
		expect(stored(sim, LF) - lf0).toBeCloseTo(lf, 6);
		expect(funds(sim) - f0).toBeCloseTo(quote.credit, 6);
		sim.dispose();
	});

	test("without storage room the fuel is sold at today's price, as market-sell would", async () => {
		const sim = await make();
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage(), crew: [] });
		if (!r.ok) throw new Error(r.reason);
		for (let i = 0; i < 200; i++) sim.step(0.02);
		const quote = sim.snapshot().vessels.find((v) => v.id === r.vessel)!.recovery!;
		const f0 = funds(sim);
		expect(sim.dispatch({ type: 'recover-vessel', vessel: r.vessel! }).ok).toBe(true);
		const sales = sim
			.save()
			.economy!.entries.filter((e) => e.cause === 'stock.market-sell')
			.reduce((n, e) => n + e.amount, 0);
		expect(sales).toBeGreaterThan(0);
		expect(funds(sim) - f0).toBeCloseTo(quote.credit + sales, 6);
		sim.dispose();
	});
});
