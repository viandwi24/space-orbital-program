/** Crew simulation (plan 107, ADR 0181): life support, shortages, resume, morale, fatigue, g-load. */
import { openTree } from './helpers/tech.ts';
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type EntityId, type Plugin, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePlugin, z } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier, stack } from './helpers/vessels.ts';

const DAY = 21_600; // the stock home day

/** A 3-seat cabin holding `days` days of everything for three, and a thruster for g-load. */
const fixture = (days: number): Plugin =>
	definePlugin({
		meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
		depends: ['stock'],
		setup(ctx) {
			const shape = { kind: 'cylinder' as const, radius: 0.625, height: 1 };
			const attach = {
				top: {
					pos: [0, 0.5, 0] as [number, number, number],
					dir: [0, 1, 0] as [number, number, number]
				},
				bottom: {
					pos: [0, -0.5, 0] as [number, number, number],
					dir: [0, -1, 0] as [number, number, number]
				}
			};
			const amount = 3 * days;
			ctx.parts.register({
				id: 'fix.cabin',
				title: 'Cabin',
				mass: 1_000,
				crewCapacity: 3,
				shape,
				attach,
				modules: [
					['stock.command', undefined],
					[
						'stock.resource-container',
						{
							contents: {
								'stock.supplies': { capacity: amount },
								'stock.oxygen': { capacity: amount },
								'stock.water': { capacity: amount },
								'stock.food': { capacity: amount },
								'stock.electric-charge': { capacity: 1_000 }
							}
						}
					]
				]
			});
			ctx.modules.register(
				defineModule({
					id: 'fix.thruster',
					config: z.object({ force: z.number() }).optional(),
					state: () => ({ on: false }),
					update: (c) => {
						if (c.state.on) c.vessel.applyForce({ x: 0, y: 300_000, z: 0 });
					},
					actions: {
						fire: (c) => {
							c.state.on = true;
						}
					}
				})
			);
			ctx.parts.register({
				id: 'fix.thruster',
				title: 'Thruster',
				mass: 1,
				shape: { kind: 'cylinder', radius: 0.625, height: 0.2 },
				attach: {
					top: { pos: [0, 0.1, 0], dir: [0, 1, 0] },
					bottom: { pos: [0, -0.1, 0], dir: [0, -1, 0] }
				},
				modules: [['fix.thruster', undefined]]
			});
		}
	});

const world = (
	preset: string,
	rules: Record<string, boolean | number | string> = {}
): WorldInfo => {
	const base = legacyWorldInfo(1);
	return {
		...base,
		id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
		preset,
		rules: { ...base.rules, ...rules }
	};
};

async function make(days: number, preset = 'stock.career', resume?: unknown): Promise<Sim> {
	const sim = await createSim({
		plugins: [Stock, fixture(days), openTree],
		backendFactory: rapier(16),
		world: world(preset),
		...(resume ? { resume } : {})
	});
	if (!resume) for (let i = 0; i < 3; i++) sim.dispatch({ type: 'crew-hire', profession: 'pilot' });
	return sim;
}

/** Three crew in the cabin, on a stable orbit (on rails) or with the thruster (in flight). */
function launch(sim: Sim, parts = ['fix.cabin'], placement?: unknown): EntityId {
	const crew = sim.snapshot().crew!.map((m, k) => ({ member: m.id, part: 0, k }));
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('Cabin', parts, []),
		placement: (placement ?? { kind: 'state', ...orbitState(sim, 200_000) }) as never,
		crew: crew.map(({ member, part }) => ({ member, part }))
	});
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
}

const life = (sim: Sim, id: EntityId) =>
	sim.snapshot().vessels.find((v) => v.id === id)!.lifeSupport;

describe('life support (ADR 0181 points 1 to 3)', () => {
	test('time left is the closed form and the shortage comes then, at warp 1', async () => {
		const sim = await make(0.01); // 216 s for three
		const id = launch(sim);
		const t0 = sim.snapshot().t;
		const supplies = life(sim, id)!.consumables.find((c) => c.resource === 'stock.supplies')!;
		expect(supplies.timeLeft / (0.01 * DAY)).toBeCloseTo(1, 2);
		const shortages: Array<{ member: string; time: number }> = [];
		sim.events.on('crew:shortage', (e) => shortages.push(e));
		for (let i = 0; i < 12_000 && shortages.length === 0; i++) sim.step(0.02);
		expect(shortages).toHaveLength(3);
		expect(Math.abs(shortages[0]!.time - (t0 + 0.01 * DAY)) / (0.01 * DAY)).toBeLessThan(0.01);
		sim.dispose();
	});

	test('under warp 1e5 the shortage is dated exactly, and the crew is lost after the grace', async () => {
		const sim = await make(2); // 2 days for three
		const id = launch(sim);
		const t0 = sim.snapshot().t;
		const shortages: number[] = [];
		const lost: string[] = [];
		sim.events.on('crew:shortage', (e) => shortages.push(e.time));
		sim.events.on('crew:lost', (e) => lost.push(e.status));
		expect(sim.dispatch({ type: 'warp', factor: 100_000 }).ok).toBe(true);
		while (sim.snapshot().t < t0 + 2 * DAY + 100) sim.step(0.02);
		expect(Math.abs(shortages[0]! - (t0 + 2 * DAY)) / (2 * DAY)).toBeLessThan(0.01);
		expect(lost).toEqual([]);
		while (sim.snapshot().t < t0 + 5 * DAY + 100) sim.step(0.02); // grace: 3 days
		expect(lost).toEqual(['lost', 'lost', 'lost']);
		expect(life(sim, id)).toBeUndefined();
		sim.dispose();
	});

	test('with life support off nothing is consumed; "full" without scrubbers is a co2 shortage', async () => {
		const sandbox = await make(1, 'stock.sandbox');
		const a = launch(sandbox);
		sandbox.dispatch({ type: 'warp', factor: 100_000 });
		for (let i = 0; i < 20; i++) sandbox.step(0.02);
		expect(life(sandbox, a)).toBeUndefined();
		const cabin = sandbox.snapshot().vessels.find((v) => v.id === a)!.parts[0]!;
		expect(
			(cabin.modules['stock.resource-container'] as { amounts: Record<string, number> }).amounts[
				'stock.supplies'
			]
		).toBe(3);
		sandbox.dispose();

		const full = await make(1);
		full.dispatch({ type: 'debug-mode', on: true }); // a harder rule needs debug mode (plan 230)
		expect(full.dispatch({ type: 'set-rule', rule: 'stock.life-support', value: 'full' }).ok).toBe(
			true
		);
		const b = launch(full);
		const resources: string[] = [];
		full.events.on('crew:shortage', (e) => resources.push(e.resource));
		full.step(0.02);
		expect(resources).toEqual(['co2', 'co2', 'co2']);
		expect(life(full, b)!.consumables.map((c) => c.resource)).toEqual([
			'stock.oxygen',
			'stock.water',
			'stock.food',
			'co2'
		]);
		full.dispose();

		const scrubbed = await make(1);
		scrubbed.dispatch({ type: 'debug-mode', on: true });
		scrubbed.dispatch({ type: 'set-rule', rule: 'stock.life-support', value: 'full' });
		const c = launch(scrubbed, ['fix.cabin', 'stock.scrubber']);
		const none: string[] = [];
		scrubbed.events.on('crew:shortage', (e) => none.push(e.resource));
		for (let i = 0; i < 50; i++) scrubbed.step(0.02);
		expect(none).toEqual([]);
		// 3 served × 10 EC per day out of 1 000 EC
		const co2 = life(scrubbed, c)!.consumables.find((x) => x.resource === 'co2')!;
		expect(co2.timeLeft / ((1_000 / 30) * DAY)).toBeCloseTo(1, 2);
		scrubbed.dispose();
	});

	test('a save taken mid-shortage resumes with the same "since", and the grace still ends then', async () => {
		const sim = await make(0.5);
		launch(sim);
		const t0 = sim.snapshot().t;
		sim.dispatch({ type: 'warp', factor: 100_000 });
		while (sim.snapshot().t < t0 + 1 * DAY) sim.step(0.02);
		const save = sim.save();
		const since = save.crew!.members[0]!.shortages![0]!.since;
		expect(Math.abs(since - (t0 + 0.5 * DAY))).toBeLessThan(1);
		sim.dispose();
		const again = await make(0.5, 'stock.career', save);
		expect(again.save().crew!.members[0]!.shortages).toEqual([
			{ resource: 'stock.supplies', since }
		]);
		const lost: number[] = [];
		again.events.on('crew:lost', () => lost.push(again.snapshot().t));
		again.dispatch({ type: 'warp', factor: 100_000 });
		while (again.snapshot().t < since + 3 * DAY + 2_100) again.step(0.02);
		expect(lost).toHaveLength(3);
		expect(lost[0]!).toBeGreaterThanOrEqual(since + 3 * DAY);
		again.dispose();
	});
});

describe('condition (ADR 0181 points 4 to 7)', () => {
	test('morale and fatigue follow the closed forms; a hard burn blacks the crew out', async () => {
		const sim = await make(10);
		sim.dispatch({ type: 'debug-mode', on: true }); // a harder rule needs debug mode (plan 230)
		sim.dispatch({ type: 'set-rule', rule: 'stock.crew-rest', value: true });
		const id = launch(sim, ['fix.cabin', 'fix.thruster'], {
			kind: 'state',
			position: orbitState(sim, 200_000).position,
			velocity: { x: 0, y: 0, z: -1_000 } // not a stable orbit: in flight
		});
		const T = 60;
		for (let i = 0; i < T / 0.02; i++) sim.step(0.02);
		const crew = sim.snapshot().vessels.find((v) => v.id === id)!.crew!;
		// fatigue: 1.5 per day while working (in flight)
		expect(crew[0]!.fatigue!).toBeCloseTo((1.5 * T) / DAY, 6);
		// morale: target 1 - 0.01 days - 0.3 (1 - 0.5) ≈ 0.85, time constant one day
		const target = 1 - 0.01 * (T / 2 / DAY) - 0.15;
		expect(crew[0]!.morale!).toBeCloseTo(target + (1 - target) * Math.exp(-T / DAY), 4);
		expect(crew[0]!.performance!).toBeCloseTo(
			(0.6 + 0.4 * crew[0]!.morale!) * (1 - 0.4 * crew[0]!.fatigue!),
			9
		);
		expect(crew[0]!.dose!).toBeCloseTo(1e-5 * T, 6);

		const glocs: string[] = [];
		sim.events.on('crew:g-loc', (e) => glocs.push(e.member));
		const thruster = sim.snapshot().vessels.find((v) => v.id === id)!.parts[1]!.id;
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: thruster,
			module: 'fix.thruster',
			action: 'fire'
		});
		for (let i = 0; i < 30; i++) sim.step(0.02);
		expect(glocs).toHaveLength(3);
		sim.dispose();
	});
});
