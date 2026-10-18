/** Discovery science (plan 129, ADR 0192): seeded facts, measurements, lab levels, claims, review. */
import { describe, expect, test } from 'bun:test';
import {
	DISCOVERY_PROCESS_DAYS,
	factValue,
	legacyWorldInfo,
	loadPlugins,
	reviewScore,
	type EntityId,
	type WorldInfo
} from '@orbital/core';
import Stock, { FactMagneticField, FactPolarIce } from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

const SEED = 11; // the home planet has polar ice and a magnetic field
const world = (depth: 'classic' | 'discovery', seed = SEED): WorldInfo => {
	const base = legacyWorldInfo(seed);
	return {
		...base,
		id: `discovery-${depth}-${seed}`,
		preset: 'stock.career',
		rules: { ...base.rules, 'stock.science-depth': depth }
	};
};
const make = (depth: 'classic' | 'discovery', resume?: unknown) =>
	createSim({
		plugins: [Stock, openTree],
		backendFactory: rapier(16),
		world: world(depth),
		...(resume ? { resume } : {})
	});
const day = (sim: Sim) => tickDayLength(sim.registries.bodies.list());

function warpTo(sim: Sim, to: number): void {
	const r = sim.dispatch({ type: 'warp-to', time: to, factor: 1e6 });
	if (!r.ok) throw new Error(r.reason);
	for (let g = 0; (sim.time < to - 1e-6 || sim.warp !== 1) && g < 1e5; g++) sim.step(10);
}

const vessel = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
const partOf = (sim: Sim, id: EntityId, definition: string) =>
	vessel(sim, id).parts.find((p) => p.definition === definition)!.id;
type Item = { id: string; value: number };
const items = (sim: Sim, id: EntityId): Item[] =>
	(
		vessel(sim, id).parts.find((p) => p.definition === 'stock.data-drive')!.modules[
			'stock.data-storage'
		] as { items: Item[] }
	).items;

/** A landed thermometer: one temperature result, transmitted with comms off (ADR 0099 point 2). */
function measureOnce(sim: Sim): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('Lab', ['stock.command-pod', 'stock.thermometer', 'stock.data-drive'], []),
		placement: { kind: 'surface', latitude: 0, longitude: 0 } as never
	});
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel!;
	for (let i = 0; i < 300; i++) sim.step(0.02);
	const part = partOf(sim, id, 'stock.thermometer');
	const run = sim.dispatch({
		type: 'action',
		vessel: id,
		part,
		module: 'stock.experiment',
		action: 'run'
	});
	expect(run.ok).toBe(true);
	for (let t = 0; t < 10; t += 0.02) sim.step(0.02);
	return id;
}

function transmitAll(sim: Sim, id: EntityId): void {
	sim.dispatch({ type: 'set-rule', rule: 'stock.comms', value: false });
	for (const item of items(sim, id)) {
		expect(sim.dispatch({ type: 'transmit-data', vessel: id, item: item.id }).ok).toBe(true);
	}
}

const truth = (body: string, fact: typeof FactPolarIce, seed = SEED) => factValue(seed, body, fact);
const reviewEntries = (sim: Sim) =>
	sim.save().economy!.entries.filter((e) => e.cause === 'discovery.review');

describe('facts from the world seed (ADR 0192 point 2)', () => {
	test('the same seed gives the same facts on every body; another seed gives others', () => {
		const { registries } = loadPlugins([Stock]);
		const bodies = registries.bodies
			.list()
			.filter((b) => b.star !== true)
			.map((b) => String(b.id));
		const kinds = registries.discoveryFacts.list();
		expect(kinds.length).toBeGreaterThanOrEqual(3);
		const facts = (seed: number) =>
			bodies.flatMap((b) => kinds.map((k) => `${b}/${k.id}=${factValue(seed, b, k)}`));
		expect(facts(SEED)).toEqual(facts(SEED));
		expect(facts(SEED + 1)).not.toEqual(facts(SEED));
		// both present and absent facts occur, and a present one is within its range
		const values = bodies.flatMap((b) => kinds.map((k) => ({ k, v: factValue(SEED, b, k) })));
		expect(values.some((x) => x.v === 0)).toBe(true);
		const present = values.filter((x) => x.v > 0);
		expect(present.length).toBeGreaterThan(0);
		for (const { k, v } of present) {
			expect(v).toBeGreaterThanOrEqual(k.range[0]);
			expect(v).toBeLessThanOrEqual(k.range[1]);
		}
	});
});

describe('measurements and data levels (ADR 0192 points 3 to 5)', () => {
	test('the error shrinks raw → calibrated → derived, each after its stated time', async () => {
		const sim = await make('discovery');
		const id = measureOnce(sim);
		// the item carries one measurement per fact the thermometer measures
		expect(JSON.stringify(sim.save())).toContain('"discovery:stock.polar-ice"');
		expect(JSON.stringify(sim.save())).toContain('"discovery:stock.magnetic-field"');
		transmitAll(sim, id);
		const data = () => sim.snapshot().discovery!.data;
		const ice = () => data().find((d) => d.fact === 'stock.polar-ice' && d.body === 'stock.home')!;
		expect(data()).toHaveLength(2);
		expect(ice()).toMatchObject({ level: 'raw', sigma: FactPolarIce.resolution });
		const t = truth('stock.home', FactPolarIce);
		const raw = Math.abs(ice().value - t);
		expect(raw).toBeGreaterThan(0);

		const start = sim.time;
		expect(sim.dispatch({ type: 'discovery-process', dataset: ice().id })).toEqual({ ok: true });
		expect(sim.dispatch({ type: 'discovery-process', dataset: ice().id }).ok).toBe(false);
		const until = ice().processing!.until;
		expect(until).toBeCloseTo(start + DISCOVERY_PROCESS_DAYS.calibrated * day(sim), 6);
		warpTo(sim, until - day(sim) / 2);
		expect(ice().level).toBe('raw');
		warpTo(sim, until + day(sim));
		expect(ice().level).toBe('calibrated');
		expect(ice().sigma).toBe(FactPolarIce.resolution * 0.5);
		const calibrated = Math.abs(ice().value - t);
		expect(calibrated).toBeCloseTo(raw * 0.5, 9);

		// the save keeps datasets in the lab and the stream
		expect(sim.dispatch({ type: 'discovery-process', dataset: ice().id }).ok).toBe(true);
		const resumed = await make('discovery', sim.save());
		expect(resumed.snapshot().discovery).toEqual(sim.snapshot().discovery!);
		sim.dispose();
		const until2 = resumed.snapshot().discovery!.data.find((d) => d.fact === 'stock.polar-ice')!
			.processing!.until;
		warpTo(resumed, until2 + day(resumed));
		const derived = resumed.snapshot().discovery!.data.find((d) => d.fact === 'stock.polar-ice')!;
		expect(derived.level).toBe('derived');
		expect(Math.abs(derived.value - t)).toBeCloseTo(raw * 0.25, 9);
		expect(resumed.dispatch({ type: 'discovery-process', dataset: derived.id }).ok).toBe(false);
		resumed.dispose();
	}, 60_000);
});

describe('claims and peer review (ADR 0192 point 6)', () => {
	test('overclaiming loses; confidence pays when right; priority goes to the first', async () => {
		const sim = await make('discovery');
		const home = 'stock.home';
		const other = sim.registries.bodies.list().find((b) => b.star !== true && b.id !== home)!
			.id as string;
		const claim = (body: string, fact: typeof FactPolarIce, value: number, confidence: number) =>
			sim.dispatch({ type: 'discovery-claim', body, fact: fact.id, value, confidence });
		expect(claim(home, FactPolarIce, truth(home, FactPolarIce), 0.9)).toEqual({ ok: true });
		// one open claim per fact; confidence below 0.5 is refused
		expect(claim(home, FactPolarIce, 0, 0.9).ok).toBe(false);
		expect(claim(other, FactPolarIce, truth(other, FactPolarIce), 0.4).ok).toBe(false);
		expect(claim(other, FactPolarIce, truth(other, FactPolarIce), 0.6)).toEqual({ ok: true });
		const wrong = truth(home, FactMagneticField) + 10 * FactMagneticField.tolerance;
		expect(claim(home, FactMagneticField, wrong, 0.9)).toEqual({ ok: true });
		const before = sim.snapshot().economy!.reputation;
		warpTo(sim, sim.time + 4 * day(sim));

		const claims = sim.snapshot().discovery!.claims;
		const of = (body: string, fact: string) =>
			claims.find((c) => c.body === body && c.fact === fact)!;
		const high = of(home, FactPolarIce.id);
		const low = of(other, FactPolarIce.id);
		const over = of(home, FactMagneticField.id);
		expect(high).toMatchObject({ verdict: 'accepted', priority: true });
		expect(low).toMatchObject({ verdict: 'accepted', priority: true });
		expect(over.verdict).toBe('rejected');
		expect(over.reputation!).toBeLessThan(0);
		expect(high.reputation!).toBeGreaterThan(low.reputation!);
		expect(high.reputation).toBeCloseTo(reviewScore(true, 0.9, true), 9);
		expect(
			reviewEntries(sim)
				.map((e) => e.ref)
				.sort()
		).toEqual([high.id, low.id, over.id].sort());
		const after = sim.snapshot().economy!.reputation;
		expect(after - before).toBeCloseTo(high.reputation! + low.reputation! + over.reputation!, 0);
		// settled facts show the accepted value; open ones never show a value
		const facts = sim.snapshot().discovery!.facts;
		expect(facts.find((f) => f.body === home && f.fact === FactPolarIce.id)).toMatchObject({
			status: 'settled',
			value: truth(home, FactPolarIce)
		});
		expect(facts.find((f) => f.body === home && f.fact === FactMagneticField.id)).toEqual(
			expect.not.objectContaining({ value: expect.anything() })
		);

		// the same correct claim again gains less: priority is taken
		expect(claim(home, FactPolarIce, truth(home, FactPolarIce), 0.9)).toEqual({ ok: true });
		warpTo(sim, sim.time + 4 * day(sim));
		const second = sim.snapshot().discovery!.claims.at(-1)!;
		expect(second.verdict).toBe('accepted');
		expect(second.priority).toBeUndefined();
		expect(second.reputation!).toBeGreaterThan(0);
		expect(second.reputation!).toBeLessThan(high.reputation!);
		sim.dispose();
	}, 60_000);
});

describe('classic (ADR 0192 point 9)', () => {
	test('nothing of discovery runs, and classic points are the same in both depths', async () => {
		const classic = await make('classic');
		const a = measureOnce(classic);
		expect(items(classic, a)).toHaveLength(1);
		expect(JSON.stringify(classic.save())).not.toContain('discovery:');
		transmitAll(classic, a);
		expect(classic.snapshot().discovery).toBeUndefined();
		expect(
			classic.dispatch({
				type: 'discovery-claim',
				body: 'stock.home',
				fact: FactPolarIce.id,
				value: 1,
				confidence: 0.9
			}).ok
		).toBe(false);
		expect(classic.save().discovery).toBeUndefined();

		const discovery = await make('discovery');
		transmitAll(discovery, measureOnce(discovery));
		expect(discovery.snapshot().science).toEqual(classic.snapshot().science!);
		const science = (sim: Sim) =>
			sim.save().economy!.entries.filter((e) => e.currency === 'science');
		expect(science(discovery)).toEqual(science(classic));
		expect(science(classic).length).toBeGreaterThan(0);
		classic.dispose();
		discovery.dispose();
	}, 60_000);
});
