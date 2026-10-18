/** Science core (plan 103, ADR 0178): the value curve, credit by transmission and recovery, states. */
import { openTree } from './helpers/tech.ts';
import { describe, expect, test } from 'bun:test';
import {
	legacyWorldInfo,
	regionAt,
	terrainSeedOf,
	type EntityId,
	type Plugin,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineExperiment, defineModule, definePlugin, z } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier, stack } from './helpers/vessels.ts';

/** An instant experiment with a low cap, and a module that asks for the situation every step. */
const fixture: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.experiments.register(
			defineExperiment({
				id: 'fix.capped',
				label: 'Capped',
				kind: 'data',
				situations: ['stock.landed'],
				baseValue: 10,
				repeatFactor: 0.5,
				capFactor: 1.2,
				duration: 0,
				bits: 8,
				transmitFactor: 1
			})
		);
		ctx.experiments.register(
			defineExperiment({
				id: 'fix.anywhere',
				label: 'Anywhere',
				kind: 'data',
				situations: [
					'stock.landed',
					'stock.splashed',
					'stock.flying-low',
					'stock.flying-high',
					'stock.space-low',
					'stock.space-high'
				],
				baseValue: 10,
				repeatFactor: 0.5,
				duration: 0,
				bits: 8,
				transmitFactor: 1
			})
		);
		const shape = { kind: 'cylinder' as const, radius: 0.625, height: 0.2 };
		const attach = {
			top: {
				pos: [0, 0.1, 0] as [number, number, number],
				dir: [0, 1, 0] as [number, number, number]
			},
			bottom: {
				pos: [0, -0.1, 0] as [number, number, number],
				dir: [0, -1, 0] as [number, number, number]
			}
		};
		ctx.parts.register({
			id: 'fix.anywhere',
			title: 'Anywhere',
			mass: 10,
			shape,
			attach,
			modules: [['stock.experiment', { experiment: 'fix.anywhere' }]]
		});
		ctx.parts.register({
			id: 'fix.capped',
			title: 'Capped',
			mass: 10,
			shape,
			attach,
			modules: [['stock.experiment', { experiment: 'fix.capped' }]]
		});
		ctx.modules.register(
			defineModule({
				id: 'fix.asker',
				config: z.object({ ask: z.boolean() }),
				updateOnRails: (c) => {
					if (c.config.ask) c.vessel.situation();
				}
			})
		);
		for (const ask of [true, false]) {
			ctx.parts.register({
				id: ask ? 'fix.asker' : 'fix.silent',
				title: 'Asker',
				mass: 10,
				shape,
				attach,
				modules: [['fix.asker', { ask }]]
			});
		}
	}
});

const world = (preset = 'stock.career'): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '6f1c2a90-3b4d-4e5f-8a7b-1c2d3e4f5a6b',
	preset
});
const make = (preset?: string, resume?: unknown) =>
	createSim({
		// the tree stays on for science credit; every part is open (plan 105)
		plugins: [Stock, fixture, openTree],
		backendFactory: rapier(16),
		world: world(preset),
		...(resume ? { resume } : {})
	});

const PARTS = [
	'stock.command-pod',
	'stock.thermometer',
	'stock.surface-sampler',
	'stock.seismometer',
	'fix.capped',
	'stock.data-drive'
];

function load(sim: Sim, parts: string[], placement: unknown): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('Lab', parts, []),
		placement: placement as never
	});
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
}

/** On the ground at the site, at rest. */
function landed(sim: Sim, parts = PARTS): EntityId {
	const id = load(sim, parts, { kind: 'surface', latitude: 0, longitude: 0 });
	for (let i = 0; i < 300; i++) sim.step(0.02);
	return id;
}

const vessel = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
const partOf = (sim: Sim, id: EntityId, definition: string) =>
	vessel(sim, id).parts.find((p) => p.definition === definition)!.id;
const experiment = (sim: Sim, id: EntityId, part: EntityId) =>
	vessel(sim, id).science!.experiments.find((e) => e.part === part)!;

function run(sim: Sim, id: EntityId, part: EntityId) {
	const r = sim.dispatch({
		type: 'action',
		vessel: id,
		part,
		module: 'stock.experiment',
		action: 'run'
	});
	expect(r).toEqual({ ok: true });
}

/** Runs to the end (or `seconds`) in 0.02 s steps. */
function runFor(sim: Sim, id: EntityId, part: EntityId, seconds = 30): void {
	run(sim, id, part);
	for (let t = 0; t < seconds && experiment(sim, id, part).state === 'RUNNING'; t += 0.02) {
		sim.step(0.02);
	}
}

const scienceEntries = (sim: Sim) =>
	sim.save().economy!.entries.filter((e) => e.currency === 'science');
const items = (sim: Sim, id: EntityId) => {
	const drive = vessel(sim, id).parts.find((p) => p.definition === 'stock.data-drive')!;
	return (
		drive.modules['stock.data-storage'] as {
			items: Array<{ id: string; value: number; subject?: string }>;
		}
	).items;
};

describe('the value curve (ADR 0178 point 4)', () => {
	test('three runs in one subject give base × r^0, r^1, r^2, fixed when made', async () => {
		const sim = await make();
		const id = landed(sim);
		const thermo = partOf(sim, id, 'stock.thermometer');
		expect(vessel(sim, id).science!.situation).toBe('stock.landed');
		for (let n = 0; n < 3; n++) runFor(sim, id, thermo);
		const subject = 'stock.temperature@stock.home:stock.landed:grass';
		expect(items(sim, id).map((i) => i.value)).toEqual([8, 4, 2]);
		expect(items(sim, id).every((i) => i.subject === subject)).toBe(true);
		expect(sim.snapshot().science).toEqual([
			{ id: subject, count: 3, produced: 14, credited: 0, cap: 24 }
		]);
		sim.dispose();
	});

	test('a fourth run never takes the subject past its cap', async () => {
		const sim = await make();
		const id = landed(sim);
		const capped = partOf(sim, id, 'fix.capped');
		for (let n = 0; n < 4; n++) runFor(sim, id, capped);
		// cap 12: 10, then min(2, 5), then nothing
		expect(items(sim, id).map((i) => i.value)).toEqual([10, 2, 0, 0]);
		const s = sim.snapshot().science!.find((x) => x.id.startsWith('fix.capped@'))!;
		expect(s.produced).toBe(12);
		expect(s.produced).toBeLessThanOrEqual(s.cap);
		sim.dispose();
	});
});

describe('regions (plan 104, ADR 0180 point 3)', () => {
	test('the same experiment landed in two regions gives two subjects', async () => {
		const sim = await make();
		const home = sim.registries.bodies.get('stock.home')!;
		// a dry spot in another biome than the site's grass, far from it
		let spot: { latitude: number; longitude: number; region: string } | undefined;
		for (let k = 0; k < 400 && !spot; k++) {
			const latitude = -0.6 + (k % 20) * 0.06;
			const longitude = 0.8 + Math.floor(k / 20) * 0.11;
			const d = {
				x: Math.cos(latitude) * Math.cos(longitude),
				y: Math.sin(latitude),
				z: -Math.cos(latitude) * Math.sin(longitude)
			};
			const region = regionAt(home, d, { seed: terrainSeedOf(world()) });
			if (region === 'forest' || region === 'desert') spot = { latitude, longitude, region };
		}
		expect(spot).toBeDefined();
		const a = landed(sim, ['stock.command-pod', 'fix.anywhere']);
		const b = load(sim, ['stock.command-pod', 'fix.anywhere'], {
			kind: 'surface',
			latitude: spot!.latitude,
			longitude: spot!.longitude
		});
		for (let i = 0; i < 300; i++) sim.step(0.02);
		expect(vessel(sim, a).science!.region).toBe('grass');
		expect(vessel(sim, b).science).toMatchObject({
			situation: 'stock.landed',
			region: spot!.region
		});
		runFor(sim, a, partOf(sim, a, 'fix.anywhere'));
		runFor(sim, b, partOf(sim, b, 'fix.anywhere'));
		const subjects = sim.snapshot().science!.map((x) => x.id);
		expect(subjects).toEqual([
			'fix.anywhere@stock.home:stock.landed:grass',
			`fix.anywhere@stock.home:stock.landed:${spot!.region}`
		]);
		// a desert result is worth 1.5 times: its cap is too
		const capOf = (id: string) => sim.snapshot().science!.find((x) => x.id === id)!.cap;
		if (spot!.region === 'desert') expect(capOf(subjects[1]!)).toBe(45);
		expect(capOf(subjects[0]!)).toBe(30);
		sim.dispose();
	});

	test('a space-high result is global', async () => {
		const sim = await make();
		const id = load(sim, ['stock.command-pod', 'fix.anywhere'], {
			kind: 'state',
			...orbitState(sim, 400_000)
		});
		sim.step(0.02);
		expect(vessel(sim, id).science!.situation).toBe('stock.space-high');
		runFor(sim, id, partOf(sim, id, 'fix.anywhere'));
		expect(sim.snapshot().science!.map((x) => x.id)).toEqual([
			'fix.anywhere@stock.home:stock.space-high:global'
		]);
		sim.dispose();
	});
});

describe('credit (ADR 0178 point 7)', () => {
	test('transmitting credits value × factor (× the multiplier rule) and removes the item', async () => {
		const sim = await make();
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.science-multiplier', value: 2 }).ok).toBe(
			true
		);
		const id = landed(sim);
		runFor(sim, id, partOf(sim, id, 'stock.thermometer'));
		const [item] = items(sim, id);
		const credited: unknown[] = [];
		sim.events.on('science:credited', (e) => credited.push(e));
		expect(sim.dispatch({ type: 'transmit-data', vessel: id, item: item!.id })).toEqual({
			ok: true
		});
		expect(items(sim, id)).toEqual([]);
		// value 8 × transmitFactor 0.5 = 4 to the subject; × 2 in the ledger
		expect(credited).toEqual([{ subject: item!.subject, value: 4, how: 'transmitted' }]);
		expect(scienceEntries(sim)).toEqual([
			{
				time: expect.any(Number),
				currency: 'science',
				amount: 8,
				cause: 'science.stock.temperature',
				ref: item!.subject
			}
		]);
		expect(sim.snapshot().economy!.science).toBe(8);
		expect(sim.dispatch({ type: 'transmit-data', vessel: id, item: item!.id }).ok).toBe(false);
		sim.dispose();
	});

	test('a sample is credited only on recovery, with the data aboard at full value', async () => {
		const sim = await make();
		const id = landed(sim);
		const sampler = partOf(sim, id, 'stock.surface-sampler');
		runFor(sim, id, sampler);
		runFor(sim, id, partOf(sim, id, 'stock.thermometer'));
		expect(experiment(sim, id, sampler)).toMatchObject({
			state: 'INVALID',
			reason: 'holds a sample'
		});
		// a second run is refused while the sample is held
		run(sim, id, sampler);
		expect(
			sim.snapshot().science!.find((s) => s.id.startsWith('stock.surface-sample@'))!.count
		).toBe(1);
		expect(scienceEntries(sim)).toEqual([]);
		for (let i = 0; i < 300; i++) sim.step(0.02); // at rest again after the actions
		expect(sim.dispatch({ type: 'recover-vessel', vessel: id })).toEqual({ ok: true });
		expect(scienceEntries(sim).map((e) => [e.cause, e.amount])).toEqual([
			['science.stock.temperature', 8],
			['science.stock.surface-sample', 30]
		]);
		sim.dispose();
	});

	test('in Sandbox (no tech tree) subjects count but no science is written', async () => {
		const sim = await make('stock.sandbox');
		const id = landed(sim);
		runFor(sim, id, partOf(sim, id, 'stock.thermometer'));
		sim.dispatch({ type: 'transmit-data', vessel: id, item: items(sim, id)[0]!.id });
		expect(scienceEntries(sim)).toEqual([]);
		expect(sim.snapshot().science![0]!.credited).toBe(4);
		sim.dispose();
	});
});

describe('experiment states (ADR 0178 point 5)', () => {
	test('started in a wrong situation it is INVALID, with the current situation in the reason', async () => {
		const sim = await make();
		const id = load(sim, PARTS, { kind: 'state', ...orbitState(sim, 100_000) });
		sim.step(0.02);
		const seismo = partOf(sim, id, 'stock.seismometer');
		run(sim, id, seismo);
		expect(experiment(sim, id, seismo)).toEqual({
			part: seismo,
			experiment: 'stock.seismic',
			state: 'INVALID',
			reason: 'not in an allowed situation: stock.space-low; needs stock.landed',
			progress: 0
		});
		sim.dispose();
	});

	test('without electric charge it is PAUSED', async () => {
		const sim = await make();
		const id = landed(sim, ['stock.thermometer', 'stock.data-drive']);
		const thermo = partOf(sim, id, 'stock.thermometer');
		run(sim, id, thermo);
		sim.step(0.1);
		expect(experiment(sim, id, thermo)).toMatchObject({
			state: 'PAUSED',
			reason: 'no electric charge'
		});
		sim.dispose();
	});

	test('subjects save and resume: the curve goes on where it was', async () => {
		const sim = await make();
		const id = landed(sim);
		runFor(sim, id, partOf(sim, id, 'stock.thermometer'));
		const save = sim.save();
		expect(save.science!.subjects).toHaveLength(1);
		sim.dispose();
		const again = await make(undefined, save);
		const thermo = partOf(again, id, 'stock.thermometer');
		runFor(again, id, thermo);
		expect(items(again, id).map((i) => i.value)).toEqual([8, 4]);
		again.dispose();
	});
});

describe('benchmark', () => {
	test('situation checks add under 0.05 ms per step for 10 vessels', async () => {
		const STEPS = 2_000;
		const time = async (part: string): Promise<number> => {
			const sim = await make();
			for (let i = 0; i < 10; i++) {
				load(sim, [part], { kind: 'state', ...orbitState(sim, 100_000 + 1_000 * i) });
			}
			for (let i = 0; i < 200; i++) sim.step(0.02); // warm up; everything on rails
			const t0 = performance.now();
			for (let i = 0; i < STEPS; i++) sim.step(0.02);
			const ms = (performance.now() - t0) / STEPS;
			sim.dispose();
			return ms;
		};
		const samples: number[] = [];
		for (let k = 0; k < 3; k++)
			samples.push((await time('fix.asker')) - (await time('fix.silent')));
		const added = samples.sort((a, b) => a - b)[1]!;
		console.log(`situation checks: ${(added * 1000).toFixed(1)} µs per step for 10 vessels`);
		expect(added).toBeLessThan(0.05);
	}, 120_000);
});
