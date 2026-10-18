/** Part reliability (plan 130, ADR 0156): no draws when off, the stated rate, replay, failures, repair. */
import { describe, expect, test } from 'bun:test';
import {
	LEGACY_SITE,
	legacyWorldInfo,
	trialChance,
	type CommandResult,
	type EntityId,
	type Plugin,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineFailureMode, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { rapier, stack, twoStage } from './helpers/vessels.ts';

const STAND = {
	id: 'b-stand',
	kind: 'stock.test-stand',
	cell: { i: 20, j: 20 },
	rotation: 0 as const,
	level: 0,
	state: 'active' as const
};

const world = (rules: Record<string, boolean | number | string>, stand = false): WorldInfo => ({
	...legacyWorldInfo(7),
	id: '3c9a1d2e-130a-4f6b-9e21-5a0c7d7f3e40',
	preset: 'stock.career',
	sites: [
		{ ...LEGACY_SITE, buildings: [...(LEGACY_SITE.buildings ?? []), ...(stand ? [STAND] : [])] }
	],
	rules: { 'stock.economy': false, ...rules }
});

/** A fixture whose modes always fail, to see what a failure does. */
const Always = definePlugin({
	meta: { id: 'always', version: '1.0.0', api: '^0.1' },
	setup(ctx) {
		ctx.failureModes.register(
			defineFailureMode({
				id: 'always.engine',
				label: 'Engine shutdown',
				module: 'stock.engine',
				trigger: 'stage',
				chance: 1,
				repairable: true
			})
		);
		ctx.failureModes.register(
			defineFailureMode({
				id: 'always.decoupler',
				label: 'Decoupler stuck',
				module: 'stock.decoupler',
				trigger: 'stage',
				chance: 1,
				repairable: false
			})
		);
	}
});

const make = (info: WorldInfo, plugins: Plugin[] = [Stock], resume?: unknown) =>
	createSim({
		plugins,
		backendFactory: rapier(16),
		...(resume ? { resume } : { world: info })
	} as never);

const made = (r: CommandResult): EntityId => {
	if (!r.ok) throw new Error(r.reason);
	return r.vessel as EntityId;
};
const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const orbit = {
	kind: 'state',
	body: 'stock.home',
	position: { x: 700_000, y: 0, z: 0 },
	velocity: { x: 0, y: 0, z: -2_246 }
};

describe('reliability off (ADR 0156 point 4)', () => {
	test('1 000 loads and stagings draw nothing and fail nothing', async () => {
		const sim = await make(world({ 'stock.reliability': false }));
		const failed: unknown[] = [];
		sim.events.on('part:failed', (e) => failed.push(e));
		for (let i = 0; i < 1_000; i++) {
			const id = made(
				sim.dispatch({ type: 'load-vessel', design: twoStage(), placement: orbit } as never)
			);
			sim.dispatch({ type: 'stage', vessel: id });
		}
		expect(failed).toEqual([]);
		expect(sim.save().reliability).toBeUndefined();
		expect(sim.snapshot().reliability).toBeUndefined();
		expect(sim.dispatch({ type: 'static-fire', part: 'stock.engine-lv' })).toEqual({
			ok: false,
			reason: 'this world has no part reliability'
		});
		sim.dispose();
	}, 120_000);
});

describe('reliability on', () => {
	test('2 000 static fires fail at the stated chance within 4 standard deviations, and experience lowers it', async () => {
		const sim = await make(world({ 'stock.reliability': true }, true));
		const mode = sim.registries.failureModes.get('stock.engine-shutdown')!;
		let expected = 0;
		let variance = 0;
		for (let k = 0; k < 2_000; k++) {
			const p = trialChance(mode, { experience: k });
			expected += p;
			variance += p * (1 - p);
			expect(sim.dispatch({ type: 'static-fire', part: 'stock.engine-lv' })).toEqual({ ok: true });
		}
		const reports = sim.snapshot().reliability!.reports.filter((r) => r.part === 'stock.engine-lv');
		expect(Math.abs(reports.length - expected)).toBeLessThan(4 * Math.sqrt(variance));
		const model = sim.snapshot().reliability!.models.find((m) => m.part === 'stock.engine-lv')!;
		expect(model.experience).toBe(2_000);
		expect(trialChance(mode, { experience: 10 })).toBeLessThan(
			trialChance(mode, { experience: 0 })
		);
		expect(model.reliability).toBeCloseTo(1 - trialChance(mode, { experience: 2_000 }), 12);
		sim.dispose();
	}, 120_000);

	test('without a test stand a static fire is refused', async () => {
		const sim = await make(world({ 'stock.reliability': true }));
		expect(sim.dispatch({ type: 'static-fire', part: 'stock.engine-lv' })).toEqual({
			ok: false,
			reason: 'build a test stand first'
		});
		sim.dispose();
	});

	test('the same save and commands give the same failures, across a save and resume', async () => {
		const script = (sim: Sim, from: number, to: number) => {
			for (let i = from; i < to; i++) {
				const id = made(
					sim.dispatch({ type: 'load-vessel', design: twoStage(), placement: orbit } as never)
				);
				sim.dispatch({ type: 'stage', vessel: id });
				sim.dispatch({ type: 'stage', vessel: id });
				sim.dispatch({ type: 'static-fire', part: 'stock.decoupler' });
			}
		};
		const info = world({ 'stock.reliability': true }, true);
		const a = await make(info);
		script(a, 0, 60);
		const all = a.snapshot().reliability!.reports.map((r) => `${r.part}/${r.mode}`);
		a.dispose();

		const b = await make(info);
		script(b, 0, 30);
		const saved = b.save();
		b.dispose();
		const c = await make(info, [Stock], saved);
		script(c, 30, 60);
		expect(c.snapshot().reliability!.reports.map((r) => `${r.part}/${r.mode}`)).toEqual(all);
		expect(all.length).toBeGreaterThan(0);
		c.dispose();
	}, 120_000);

	test('a failed engine gives no thrust; a stuck decoupler holds; the action says why', async () => {
		const sim = await make(world({ 'stock.reliability': true }), [Stock, Always]);
		const id = made(
			sim.dispatch({ type: 'load-vessel', design: twoStage(), placement: { kind: 'surface' } })
		);
		run(sim, 2);
		const r0 = sim.snapshot().vessels.find((v) => v.id === id)!.position;
		expect(sim.dispatch({ type: 'stage', vessel: id })).toEqual({ ok: true });
		run(sim, 3);
		const r1 = sim.snapshot().vessels.find((v) => v.id === id)!.position;
		// still on the pad (the pad turns with the planet; its height does not change): no thrust
		expect(Math.abs(Math.hypot(r1.x, r1.y, r1.z) - Math.hypot(r0.x, r0.y, r0.z))).toBeLessThan(1);
		const failed = sim.snapshot().reliability!.failed;
		expect(failed.map((f) => f.label)).toEqual(['Engine shutdown']);
		const engine = failed[0]!.part as EntityId;
		const ignite = sim.dispatch({
			type: 'action',
			vessel: id,
			part: engine,
			module: 'stock.engine',
			action: 'ignite'
		} as never);
		expect(ignite.ok).toBe(false);
		expect(sim.dispatch({ type: 'stage', vessel: id })).toEqual({ ok: true });
		run(sim, 1);
		expect(sim.snapshot().vessels.length).toBe(1); // the decoupler stuck: no split
		sim.dispose();
	}, 60_000);

	test('an engineer on EVA repairs the engine; a fix halves the mode chance', async () => {
		const sim = await make(world({ 'stock.reliability': true }), [Stock, Always]);
		expect(sim.dispatch({ type: 'crew-hire', profession: 'engineer' }).ok).toBe(true);
		const design = stack(
			'Hopper',
			['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'],
			[[2]]
		);
		const id = made(
			sim.dispatch({
				type: 'load-vessel',
				design,
				placement: { kind: 'surface' },
				crew: [{ member: 'c1', part: 0 }]
			} as never)
		);
		run(sim, 2);
		sim.dispatch({ type: 'stage', vessel: id });
		const engine = sim.snapshot().reliability!.failed[0]!.part as EntityId;
		const suit = made(sim.dispatch({ type: 'crew-eva', vessel: id, member: 'c1' }));
		run(sim, 2);
		expect(sim.dispatch({ type: 'repair', suit, vessel: id, part: engine })).toEqual({ ok: true });
		expect(sim.snapshot().reliability!.failed).toEqual([]);
		const report = sim.snapshot().reliability!.reports[0]!;
		const before = trialChance({ id: 'always.engine', chance: 0.4 }, { experience: 1 });
		expect(sim.dispatch({ type: 'fix-anomaly', report: report.id })).toEqual({ ok: true });
		const after = trialChance(
			{ id: 'always.engine', chance: 0.4 },
			{ experience: 1, fixes: { 'always.engine': 1 } }
		);
		expect(after).toBeCloseTo(before / 2, 12);
		expect(sim.dispatch({ type: 'fix-anomaly', report: report.id }).ok).toBe(false);
		sim.dispose();
	}, 60_000);
});
