/** The world tick (plan 082, ADR 0171): day boundaries, order, streams, resume, background work. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type Plugin, type SystemDefinition, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePlugin, GRAVITATIONAL_CONSTANT, z } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier, stack } from './helpers/vessels.ts';

const DAY = 21_600; // stock home body rotation period, s
const BENCH_DAY = 10;
const HOME_MU = 3.5316e12;

const systemsPlugin = (id: string, systems: SystemDefinition[]): Plugin =>
	definePlugin({
		meta: { id, version: '1.0.0', api: '^0.1' },
		setup(ctx) {
			for (const s of systems) ctx.systems.register(s);
		}
	});

/** A world-tick system that records its day, time and one draw per tick. */
function recorder(id: string, order?: number) {
	const seen: Array<{ day: number; time: number; draw: number; dt: number }> = [];
	const system: SystemDefinition = {
		id,
		phase: 'world-tick',
		...(order === undefined ? {} : { order }),
		update(_world, dt, ctx) {
			const tick = ctx.tick!;
			seen.push({ day: tick.day, time: tick.time, draw: tick.rng.next(), dt });
		}
	};
	return { system, seen };
}

function sim(plugins: Plugin[], extra: { world?: WorldInfo; resume?: unknown } = {}): Promise<Sim> {
	return createSim({
		plugins: [Stock, ...plugins],
		backendFactory: rapier(),
		seed: 7,
		...extra
	});
}

const ticksOf = (s: Sim) => {
	const ticks: Array<{ day: number; time: number; at: number }> = [];
	s.events.on('world:tick', (e) => ticks.push({ ...e, at: s.time }));
	return ticks;
};

describe('world tick', () => {
	test('100 game days at warp 1e6 fire exactly 100 ticks, days 1..100, each at its boundary', async () => {
		const s = await sim([]);
		const ticks = ticksOf(s);
		expect(s.dispatch({ type: 'warp', factor: 1e6 }).ok).toBe(true);
		s.step((100 * DAY + 100) / 1e6); // 100 days and 100 s
		expect(ticks.map((t) => t.day)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
		for (const t of ticks) {
			expect(Math.abs(t.time - t.day * DAY)).toBeLessThan(1e-6);
			expect(Math.abs(t.at - t.time)).toBeLessThan(1e-6); // the rails chunk stopped at the boundary
		}
	});

	test('at warp 1 in flight the tick comes at the end of the step that crossed the boundary', async () => {
		// Epoch half a second before the end of an SI day (ADR 0114: the epoch is in SI days): that is
		// half a second before the end of stock day 3, so the boundary of day 4 is at t = 0.5 s.
		const world: WorldInfo = {
			...legacyWorldInfo(7),
			epoch: { day: 0, fraction: 1 - 0.5 / 86_400 }
		};
		const s = await sim([], { world });
		const r = s.dispatch({ type: 'load-vessel', design: stack('Pod', ['stock.command-pod'], []) });
		expect(r.ok).toBe(true);
		const ticks = ticksOf(s);
		for (let i = 0; i < 50; i++) s.step(0.02);
		expect(ticks).toHaveLength(1);
		const [t] = ticks;
		expect(t!.day).toBe(4);
		expect(t!.time).toBeCloseTo(0.5, 9);
		expect(t!.at).toBeGreaterThanOrEqual(0.5);
		expect(t!.at - 0.5).toBeLessThanOrEqual(0.02 + 1e-9);
	});

	test('a world system gets the day length as dt and its own stream; others do not change its draws', async () => {
		const run = async (plugins: (a: SystemDefinition, b: SystemDefinition) => Plugin[]) => {
			const a = recorder('test.alpha');
			const b = recorder('test.beta');
			const s = await sim(plugins(a.system, b.system));
			s.dispatch({ type: 'warp', factor: 1e6 });
			s.step((5 * DAY + 1) / 1e6);
			return a.seen;
		};
		const alone = await run((a) => [systemsPlugin('a', [a])]);
		const bFirst = await run((a, b) => [systemsPlugin('b', [b]), systemsPlugin('a', [a])]);
		const bAfter = await run((a, b) => [systemsPlugin('a', [a]), systemsPlugin('b', [b])]);
		expect(alone).toHaveLength(5);
		expect(alone.every((x) => x.dt === DAY)).toBe(true);
		expect(bFirst.map((x) => x.draw)).toEqual(alone.map((x) => x.draw));
		expect(bAfter.map((x) => x.draw)).toEqual(alone.map((x) => x.draw));
		// Two systems do not share a stream.
		const other = recorder('test.gamma');
		const s = await sim([systemsPlugin('a', [recorder('test.alpha').system, other.system])]);
		s.dispatch({ type: 'warp', factor: 1e6 });
		s.step((DAY + 1) / 1e6);
		expect(other.seen[0]!.draw).not.toBe(alone[0]!.draw);
	});

	test('order: declared order, then plugin boot order, then id', async () => {
		const calls: string[] = [];
		const sys = (id: string, order?: number): SystemDefinition => ({
			id,
			phase: 'world-tick',
			...(order === undefined ? {} : { order }),
			update: () => void calls.push(id)
		});
		const s = await sim([
			systemsPlugin('first', [sys('z.late', 5), sys('z.b'), sys('z.a')]),
			systemsPlugin('second', [sys('a.early', -1), sys('a.next')])
		]);
		s.dispatch({ type: 'warp', factor: 1e6 });
		s.step((DAY + 1) / 1e6);
		expect(calls).toEqual(['a.early', 'z.a', 'z.b', 'a.next', 'z.late']);
	});

	test('a save taken mid-day resumes with the same next tick, day and draws', async () => {
		const straight = recorder('test.alpha');
		const s1 = await sim([systemsPlugin('a', [straight.system])]);
		s1.dispatch({ type: 'warp', factor: 1e6 });
		s1.step((3 * DAY + 1) / 1e6);

		const first = recorder('test.alpha');
		const s2 = await sim([systemsPlugin('a', [first.system])]);
		s2.dispatch({ type: 'warp', factor: 1e6 });
		s2.step((1.5 * DAY) / 1e6); // mid-day 1
		const saved = JSON.parse(JSON.stringify(s2.save()));
		expect(saved.worldTick.lastDay).toBe(1);
		const second = recorder('test.alpha');
		const s3 = await sim([systemsPlugin('a', [second.system])], { resume: saved });
		const ticks = ticksOf(s3);
		s3.step((1.5 * DAY + 1) / 1e6);
		expect([...first.seen, ...second.seen]).toEqual(straight.seen);
		expect(ticks.map((t) => t.day)).toEqual([2, 3]);
		expect(ticks[0]!.time).toBe(straight.seen[1]!.time);
	});

	test('a format-5 save without worldTick fires no duplicate tick', async () => {
		const s = await sim([]);
		s.dispatch({ type: 'warp', factor: 1e6 });
		s.step((1.5 * DAY) / 1e6);
		const { worldTick: _drop, ...older } = JSON.parse(JSON.stringify(s.save()));
		const { simSaveChecksum } = await import('@orbital/core');
		const { checksum: _c, ...unsigned } = older;
		const resumed = await sim([], { resume: { ...unsigned, checksum: simSaveChecksum(unsigned) } });
		const ticks = ticksOf(resumed);
		resumed.step((DAY + 1) / 1e6);
		expect(ticks.map((t) => t.day)).toEqual([2]);
	});
});

// ---- background operations --------------------------------------------------------------------

const RATE = 2; // charge per second

/** A battery charged by a panel at `rate` while on rails, through `background` only. */
function batteryMod(calls: { background: number; onRails: number; counter: number }): Plugin {
	return definePlugin({
		meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
		depends: ['stock'],
		setup(ctx) {
			ctx.modules.register(
				defineModule({
					id: 'fix.battery',
					config: z.object({ rate: z.number() }),
					state: () => ({ charge: 0 }),
					background(c, dt) {
						calls.background++;
						c.state.charge += c.config.rate * dt;
					},
					updateOnRails() {
						calls.onRails++; // must not run: `background` replaces it
					},
					snapshot: (state) => state
				})
			);
			ctx.modules.register({
				id: 'fix.counter',
				state: () => ({ n: 0 }),
				updateOnRails() {
					calls.counter++;
				}
			});
			ctx.parts.register({
				id: 'fix.battery',
				title: 'Battery',
				mass: 20,
				shape: { kind: 'cylinder', radius: 0.5, height: 0.2 },
				attach: {
					top: { pos: [0, 0.1, 0], dir: [0, 1, 0] },
					bottom: { pos: [0, -0.1, 0], dir: [0, -1, 0] }
				},
				modules: [
					['fix.battery', { rate: RATE }],
					['fix.counter', undefined]
				]
			});
		}
	});
}

const charge = (s: Sim): number =>
	(
		s.snapshot().vessels[0]!.parts.find((p) => p.definition === 'fix.battery')!.modules[
			'fix.battery'
		] as {
			charge: number;
		}
	).charge;

describe('background operations', () => {
	test('rate × elapsed time on ticks, before a save and on wake; updateOnRails is not called for it', async () => {
		const calls = { background: 0, onRails: 0, counter: 0 };
		const s = await sim([batteryMod(calls)]);
		expect(s.dispatch({ type: 'warp', factor: 1_000 }).ok).toBe(true); // loads straight onto rails
		const r = s.dispatch({
			type: 'load-vessel',
			design: stack('Battery probe', ['stock.command-pod', 'fix.battery'], []),
			placement: { kind: 'state', ...orbitState(s, 100_000) }
		});
		if (!r.ok) throw new Error(r.reason);
		expect(s.snapshot().vessels[0]!.mode).toBe('on-rails');
		const t0 = s.time; // the first evaluation starts counting here

		s.dispatch({ type: 'warp', factor: 1e5 });
		s.step((DAY + 50 - s.time) / 1e5); // past the first tick
		expect(charge(s)).toBeCloseTo(RATE * (DAY - t0), 6); // brought up to the tick, not further
		expect(calls.onRails).toBe(0);
		expect(calls.counter).toBeGreaterThan(0); // a module without `background` keeps updateOnRails

		const saved = s.save();
		expect(charge(s)).toBeCloseTo(RATE * (s.time - t0), 6); // a save brings it up to now
		expect(JSON.stringify(saved)).toContain('backgroundAt');

		s.dispatch({ type: 'warp', factor: 1 });
		s.step(0); // settle the warp change
		const before = s.time;
		s.step(1);
		expect(s.dispatch({ type: 'throttle', vessel: r.vessel!, value: 0.5 }).ok).toBe(true); // wakes it
		expect(s.snapshot().vessels[0]!.mode).toBe('flight');
		expect(charge(s)).toBeCloseTo(RATE * (s.time - t0), 6);
		expect(s.time).toBeGreaterThan(before);
	});

	test('benchmark: 1 000 ticks with stock and 50 vessels on rails average under 0.5 ms (M5; indicative elsewhere)', async () => {
		const calls = { background: 0, onRails: 0, counter: 0 };
		// A tick runs right after the rails chunk that stops at the boundary; a post-physics system
		// marks the end of that chunk, and the `world:tick` event (emitted last) ends the tick.
		let s!: Sim;
		let start = -1;
		let spent = 0;
		let count = 0;
		const mark: SystemDefinition = {
			id: 'bench.mark',
			phase: 'post-physics',
			update: () => {
				const t = s.time;
				if (t > 0 && Math.abs(t - Math.round(t / BENCH_DAY) * BENCH_DAY) < 1e-6)
					start = performance.now();
			}
		};
		// A root body like stock's home planet but with a 10 s day, so 1 000 ticks need 1 000 rails
		// chunks rather than 2.16 million: the tick is what is timed, not the rails propagation.
		const bench = definePlugin({
			meta: { id: 'bench', version: '1.0.0', api: '^0.1' },
			setup(ctx) {
				ctx.bodies.register({
					id: 'bench.home',
					mass: HOME_MU / GRAVITATIONAL_CONSTANT,
					radius: 600_000,
					rotationPeriod: BENCH_DAY
				});
				ctx.systems.register(mark);
				ctx.systems.register(recorder('bench.world').system);
			}
		});
		s = await createSim({
			plugins: [Stock, batteryMod(calls), bench],
			backendFactory: rapier(),
			seed: 7,
			body: 'bench.home'
		});
		s.dispatch({ type: 'warp', factor: 2 });
		for (let i = 0; i < 50; i++) {
			const r = s.dispatch({
				type: 'load-vessel',
				design: stack(`Probe ${i}`, ['stock.command-pod', 'fix.battery'], []),
				placement: { kind: 'state', ...orbitState(s, 100_000 + i * 1_000) }
			});
			if (!r.ok) throw new Error(r.reason);
		}
		s.events.on('world:tick', () => {
			if (start >= 0) {
				spent += performance.now() - start;
				count++;
			}
			start = -1;
		});
		s.dispatch({ type: 'warp', factor: 1e6 });
		const before = calls.background;
		s.step((1000 * BENCH_DAY + 1) / 1e6);
		expect(count).toBe(1000);
		expect(calls.background - before).toBe(50 * 1000);
		const perTick = spent / count;
		console.log(
			`1000 ticks, 50 vessels on rails with background: ${perTick.toFixed(4)} ms per tick on average`
		);
		expect(perTick).toBeLessThan(0.5);
	});
});
