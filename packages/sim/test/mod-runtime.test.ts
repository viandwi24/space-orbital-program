/** Plan 343, ADR 0292: the mod World API in the sim (world query, commands, stores, events, keys). */
import { describe, expect, test } from 'bun:test';
import {
	legacyWorldInfo,
	type EntityId,
	type Plugin,
	type SystemContext,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import {
	defineAutopilot,
	defineKeybinding,
	definePlugin,
	defineStore,
	defineSystem,
	z
} from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { probe, rapier, twoStage } from './helpers/vessels.ts';

const HOME_RADIUS = 600_000;

const counter = defineStore({
	id: 'test.counter',
	schema: z.object({ steps: z.int().min(0), names: z.array(z.string()) }),
	initial: { steps: 0, names: [] as string[] }
});

/** What the test systems saw, by name. */
const seen: Record<string, unknown> = {};

const mod: Plugin = definePlugin({
	meta: { id: 'test', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.stores.register(counter);
		ctx.keybindings.register(
			defineKeybinding({ id: 'test.ping', label: 'Ping', defaults: ['KeyK'] })
		);
		ctx.systems.register(
			defineSystem({
				id: 'test.watcher',
				phase: 'post-physics',
				update(_world, _dt, c) {
					seen.ctx = c;
					const store = c.store(counter);
					const names = c.world.vessels({ noDebris: true }).map((v) => v.name);
					store.update((s) => ({ steps: s.steps + 1, names }));
				},
				on: {
					'stage:activated': (e, c) => c.notify('Staged', { vessel: e.vessel, tone: 'success' }),
					'mod:key': (e, c) => {
						seen.key = e.key;
						if (e.vessel !== undefined) c.commands.focus(e.vessel);
					},
					'vessel:situation-changed': (e) => {
						((seen.situations ??= []) as unknown[]).push([e.from, e.to]);
					}
				}
			})
		);
		ctx.autopilots.register(
			defineAutopilot<{ others: number }>({
				id: 'test.census',
				title: 'Census',
				start: (ctrl, _params, c) => ({
					others: c.world.vessels({ except: ctrl.vessel.id }).length
				}),
				step: (_ctrl, m, _dt, c) => {
					seen.census = m.others;
					seen.store = c.store(counter).get().steps > 0;
					return { phase: 'count', done: true };
				}
			})
		);
	}
});

/** A second plugin that tries to write the first one's store. */
const intruder: Plugin = definePlugin({
	meta: { id: 'other', version: '1.0.0', api: '^0.1' },
	depends: ['test'],
	setup(ctx) {
		ctx.systems.register(
			defineSystem({
				id: 'other.poke',
				phase: 'post-physics',
				update(_world, _dt, c) {
					try {
						c.store(counter).set({ steps: 0, names: [] });
						seen.poke = 'wrote';
					} catch (e) {
						seen.poke = (e as Error).message;
					}
					seen.read = c.world.store('test.counter') !== undefined;
				}
			})
		);
	}
});

const world = (preset: string): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '6f0c2a54-3b1d-4e8f-9a27-1c5d7e9b0a34',
	preset
});

async function make(preset = 'stock.sandbox', plugins: Plugin[] = [Stock, mod]): Promise<Sim> {
	return createSim({ plugins, backendFactory: rapier(16), world: world(preset), seed: 3 });
}

const inOrbit = (sim: Sim, name: string, alt = 120_000): EntityId => {
	const s = orbitState(sim, alt);
	const r = sim.dispatch({
		type: 'load-vessel',
		design: { ...probe(), name },
		placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
	});
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};

/** The test plugin's system context, as its system got it in the last step. */
function contextOf(sim: Sim): SystemContext {
	seen.ctx = undefined;
	sim.step(0.02);
	const ctx = seen.ctx as SystemContext | undefined;
	if (!ctx) throw new Error('no context');
	return ctx;
}

describe('world query and commands (plan 343)', () => {
	test('a system sees every vessel and keeps it in its store; the snapshot carries the store', async () => {
		const sim = await make();
		inOrbit(sim, 'Alpha');
		inOrbit(sim, 'Beta', 150_000);
		run(sim, 0.1);
		const s = sim.snapshot();
		expect(s.stores?.['test.counter']).toMatchObject({ names: ['Alpha', 'Beta'] });
		expect(s.vessels.map((v) => v.situation)).toEqual(['orbiting', 'orbiting']);
		sim.dispose();
	}, 60_000);

	test('commands: target, stage (with its notice), warp; refusals carry the reason', async () => {
		const sim = await make();
		const a = inOrbit(sim, 'Alpha');
		const b = inOrbit(sim, 'Beta', 121_000);
		const ctx = contextOf(sim);
		expect(ctx.plugin).toBe('test');
		expect(ctx.world.vessels().length).toBe(2);
		expect(ctx.world.nearest(a)?.name).toBe('Beta');
		expect(ctx.commands.setTarget(a, { kind: 'vessel', id: b })).toMatchObject({ ok: true });
		expect(sim.snapshot().vessels.find((v) => v.id === a)?.target).toMatchObject({
			kind: 'vessel',
			id: b
		});
		// the query is rebuilt after a command
		expect(ctx.world.vessel(a)?.target).toMatchObject({ id: b });

		const notices: unknown[] = [];
		sim.events.on('mod:notice', (n) => notices.push(n));
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		const rocket = r.ok ? r.vessel! : (undefined as never);
		expect(ctx.commands.stage(rocket)).toMatchObject({ ok: true });
		expect(notices).toEqual([{ plugin: 'test', text: 'Staged', tone: 'success', vessel: rocket }]);

		expect(ctx.commands.send({ type: 'crew-hire', profession: 'pilot' } as never)).toEqual({
			ok: false,
			reason: 'a mod may not send "crew-hire" (ADR 0292 point 3)'
		});
		expect(
			ctx.commands.send({ type: 'set-rule', rule: 'stock.economy', value: true })
		).toMatchObject({ ok: false });
		expect(ctx.commands.focus(99_999 as EntityId)).toMatchObject({ ok: false });
		sim.dispose();
	}, 60_000);

	test('spawn and terminate only while debug tools are allowed', async () => {
		const career = await make('stock.career');
		const c = contextOf(career);
		const refused = c.commands.spawn(probe());
		expect(refused.ok).toBe(false);
		expect(refused.ok ? '' : refused.reason).toContain('only while debug tools are allowed');
		career.dispose();

		const sandbox = await make();
		const s = contextOf(sandbox);
		const spawned = s.commands.spawn({ ...probe(), name: 'Spawned' });
		expect(spawned).toMatchObject({ ok: true });
		const id = spawned.ok ? spawned.vessel! : (undefined as never);
		expect(s.world.findVessel('Spawned')?.id).toBe(id);
		expect(s.commands.terminate(id)).toMatchObject({ ok: true });
		expect(s.world.vessel(id)).toBeNull();
		sandbox.dispose();
	}, 60_000);
});

describe('stores (plan 343)', () => {
	test('valid values survive save and resume; invalid ones and other plugins are refused', async () => {
		const sim = await make('stock.sandbox', [Stock, mod, intruder]);
		inOrbit(sim, 'Alpha');
		run(sim, 0.1);
		const ctx = contextOf(sim);
		const store = ctx.store(counter);
		expect(() => store.set({ steps: -1, names: [] })).toThrow(/steps/);
		expect(() => ctx.store('test.nope')).toThrow(/not registered/);
		const steps = store.get().steps;
		expect(steps).toBeGreaterThan(0);
		const save = JSON.parse(JSON.stringify(sim.save()));
		expect(save.stores['test.counter'].steps).toBe(steps);
		const resumed = await createSim({
			plugins: [Stock, mod, intruder],
			backendFactory: rapier(16),
			resume: save
		});
		expect(resumed.snapshot().stores?.['test.counter']).toMatchObject({ steps });
		// a save edited into an invalid value falls back to the initial value
		save.stores['test.counter'] = { steps: 'many' };
		save.checksum = (await import('@orbital/core')).simSaveChecksum({
			...save,
			checksum: undefined
		});
		const fallback = await createSim({
			plugins: [Stock, mod, intruder],
			backendFactory: rapier(16),
			resume: save
		});
		expect(fallback.snapshot().stores).toBeUndefined();
		// another plugin reads it but cannot write it
		run(resumed, 0.1);
		expect(String(seen.poke)).toContain('belongs to "test"');
		expect(seen.read).toBe(true);
		for (const s of [sim, resumed, fallback]) s.dispose();
	}, 60_000);
});

describe('events and keys (plan 343)', () => {
	test('situation changes: orbit to the ground and back', async () => {
		const sim = await make();
		const id = inOrbit(sim, 'Alpha');
		seen.situations = [];
		run(sim, 0.1);
		expect(
			sim.dispatch({
				type: 'debug-set-location',
				vessel: id,
				location: { kind: 'surface', latitude: 0.1, longitude: 0.2 }
			})
		).toMatchObject({ ok: true });
		run(sim, 1);
		expect(
			sim.dispatch({
				type: 'debug-set-orbit',
				vessel: id,
				orbit: { body: 'stock.home', a: HOME_RADIUS + 200_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0 }
			})
		).toMatchObject({ ok: true });
		run(sim, 1);
		const changes = seen.situations as string[][];
		expect(changes[0]?.[0]).toBe('orbiting');
		expect(['landed', 'prelaunch']).toContain(changes[0]?.[1] ?? '');
		expect(changes.at(-1)?.[1]).toBe('orbiting');
		sim.dispose();
	}, 60_000);

	test('a key without a command reaches systems as mod:key; focus asks the page', async () => {
		const sim = await make();
		const id = inOrbit(sim, 'Alpha');
		const focus: unknown[] = [];
		sim.events.on('mod:focus', (e) => focus.push(e));
		expect(sim.dispatch({ type: 'mod-key', key: 'test.ping', vessel: id })).toMatchObject({
			ok: true
		});
		expect(seen.key).toBe('test.ping');
		expect(focus).toEqual([{ plugin: 'test', vessel: id }]);
		expect(sim.dispatch({ type: 'mod-key', key: 'test.nope' })).toMatchObject({ ok: false });
		sim.dispose();
	}, 60_000);

	test('an autopilot gets the world and its plugin store', async () => {
		const sim = await make();
		const a = inOrbit(sim, 'Alpha');
		inOrbit(sim, 'Beta', 150_000);
		inOrbit(sim, 'Gamma', 180_000);
		run(sim, 0.1);
		expect(
			sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'test.census' })
		).toMatchObject({ ok: true });
		run(sim, 0.3);
		expect(seen.census).toBe(2);
		expect(seen.store).toBe(true);
		sim.dispose();
	}, 60_000);
});
