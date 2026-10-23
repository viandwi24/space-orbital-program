/** Plan 322, ADR 0303: one script per vessel at the same time (a real sim, the real runner, in-process script Workers). */
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createScriptRunner } from '@orbital/scripting';
import { createSim, type Sim } from '@orbital/sim';
import type { Command } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import type { WorkerMessage } from './messages';
import { createInProcessScriptWorker } from './script-worker-core';
import { createSimHost } from './sim-host';

const HOME_RADIUS = 600_000;
const HOME_MU = 3.5316e12;

type Status = Extract<WorkerMessage, { kind: 'script-status' }>;

/** A host over a real sim with two vessels in the same circular orbit, on opposite sides. */
async function setup() {
	const posted: WorkerMessage[] = [];
	const dispatched: Command[] = [];
	let skew = 0;
	let sim: Sim | undefined;
	const hostNow = () => performance.now() + skew;
	const host = createSimHost({
		createSim: async () => {
			sim = await createSim({
				plugins: [Stock],
				backendFactory: () => createRapierBackend({ solverIterations: 16 }),
				maxFlightFrames: 2
			});
			const dispatch = sim.dispatch.bind(sim);
			sim.dispatch = (command, options) => {
				const type = (command as { type?: string }).type ?? '';
				if (!type.startsWith('script-')) dispatched.push(command as Command);
				return dispatch(command, options);
			};
			return sim;
		},
		scriptBudgetMs: 5_000,
		scriptFirstTickBudgetMs: 5_000,
		scriptFuelPolls: Infinity,
		spawnScriptWorker: () => createInProcessScriptWorker(createScriptRunner, hostNow),
		post: (m) => void posted.push(m),
		now: hostNow
	});
	await host.start();
	const r = HOME_RADIUS + 100_000;
	const speed = Math.sqrt(HOME_MU / r);
	const load = (id: number, side: 1 | -1): number => {
		host.handle({
			kind: 'command',
			id,
			command: {
				type: 'load-vessel',
				design: referenceTwoStage(),
				placement: {
					kind: 'state',
					position: { x: side * r, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: -side * speed }
				}
			}
		});
		const m = posted.find((p) => p.kind === 'result' && p.id === id);
		if (m?.kind !== 'result' || !m.result.ok) throw new Error('vessel not loaded');
		return Number(m.result.vessel);
	};
	const a = load(1, 1);
	const b = load(2, -1);
	dispatched.length = 0;
	let nextId = 100;
	const t = {
		host,
		posted,
		dispatched,
		a,
		b,
		sim: () => sim!,
		mode: (v: number) => sim!.snapshot().vessels.find((x) => Number(x.id) === v)?.mode,
		tick: (n = 1) => {
			for (let i = 0; i < n; i++) {
				skew += 20;
				host.tick();
			}
		},
		statuses: (v: number) =>
			posted.filter((m): m is Status => m.kind === 'script-status' && m.vessel === v),
		lines: (v: number) =>
			posted.flatMap((m) => (m.kind === 'script-log' && m.vessel === v ? m.lines : [])),
		pageWarp: (factor: number) => {
			const id = nextId++;
			host.handle({ kind: 'command', id, command: { type: 'warp', factor } });
			return () => {
				const m = posted.find((p) => p.kind === 'result' && p.id === id);
				return m?.kind === 'result' ? m.result : undefined;
			};
		},
		async run(source: string, vessel: number) {
			host.handle({ kind: 'script-start', source, vessel });
			for (let i = 0; i < 500 && !t.statuses(vessel).some((s) => s.status === 'running'); i++)
				await new Promise((res) => setTimeout(res, 10));
			expect(t.statuses(vessel).some((s) => s.status === 'running')).toBe(true);
		}
	};
	return t;
}

const WIGGLE = `let n = 0; while (true) { ship.attitude = { pitch: 0.001 + 1e-6 * n++ }; await nextTick(); }`;

describe('several scripts at once (plan 322)', () => {
	it('two vessels each run a script and each script commands only its own vessel', async () => {
		const t = await setup();
		await t.run(`print("A"); ship.sas = 'prograde'; while (true) await nextTick();`, t.a);
		await t.run(`print("B"); ship.sas = 'retrograde'; while (true) await nextTick();`, t.b);
		t.tick(3);
		expect(t.lines(t.a)).toEqual(['A']);
		expect(t.lines(t.b)).toEqual(['B']);
		const sas = t.dispatched.filter((c) => c.type === 'sas') as Array<{
			vessel: number;
			mode: string;
		}>;
		expect(sas.map((c) => [Number(c.vessel), c.mode]).sort()).toEqual(
			[
				[t.a, 'prograde'],
				[t.b, 'retrograde']
			].sort()
		);
		expect(t.statuses(t.a).at(-1)?.status).toBe('running');
		expect(t.statuses(t.b).at(-1)?.status).toBe('running');
		t.host.dispose();
	});

	it('stopping one script leaves the other running', async () => {
		const t = await setup();
		await t.run(`while (true) { print("a"); await nextTick(); }`, t.a);
		await t.run(`while (true) { print("b"); await nextTick(); }`, t.b);
		t.tick(2);
		t.host.handle({ kind: 'script-stop', vessel: t.a });
		expect(t.statuses(t.a).at(-1)?.status).toBe('stopped');
		const bBefore = t.lines(t.b).length;
		const aBefore = t.lines(t.a).length;
		t.tick(4);
		expect(t.lines(t.b).length).toBeGreaterThan(bBefore);
		expect(t.lines(t.a).length).toBe(aBefore);
		expect(t.statuses(t.b).at(-1)?.status).toBe('running');
		// a stop without a vessel ends every script
		t.host.handle({ kind: 'script-stop' });
		expect(t.statuses(t.b).at(-1)?.status).toBe('stopped');
		t.host.dispose();
	});

	it('a Run replaces the script of its own vessel only', async () => {
		const t = await setup();
		await t.run(`print("a1"); while (true) await nextTick();`, t.a);
		await t.run(`print("b1"); while (true) await nextTick();`, t.b);
		t.tick(2);
		await t.run(`print("a2"); while (true) await nextTick();`, t.a);
		// the earlier 'running' is still in the log: wait for the new script's own output
		for (let i = 0; i < 100 && !t.lines(t.a).includes('a2'); i++) {
			t.tick();
			await new Promise((r) => setTimeout(r, 10));
		}
		expect(t.lines(t.a)).toEqual(['a1', 'a2']);
		expect(t.lines(t.b)).toEqual(['b1']);
		expect(t.statuses(t.b).at(-1)?.status).toBe('running');
		t.host.dispose();
	});

	it('the programs list stop (script-detach) ends that script and no other', async () => {
		const t = await setup();
		await t.run(`while (true) await nextTick();`, t.a);
		await t.run(`while (true) await nextTick();`, t.b);
		t.tick(2);
		t.host.handle({
			kind: 'command',
			id: 50,
			command: {
				type: 'script-detach',
				vessel: t.a as never,
				reason: 'stopped from the programs list'
			}
		});
		expect(t.statuses(t.a).at(-1)?.status).toBe('stopped');
		expect(t.statuses(t.b).at(-1)?.status).toBe('running');
		t.host.dispose();
	});

	it('a warp request holds both scripted vessels and is granted once both are on rails', async () => {
		const t = await setup();
		await t.run(WIGGLE, t.a);
		await t.run(WIGGLE, t.b);
		t.tick(20);
		expect(t.mode(t.a)).toBe('flight');
		expect(t.mode(t.b)).toBe('flight');
		const answer = t.pageWarp(50);
		expect(answer()).toBeUndefined(); // pending: both are still in flight
		for (let i = 0; i < 600 && answer() === undefined; i++) t.tick();
		expect(answer()).toEqual({ ok: true, granted: 50 });
		expect(t.mode(t.a)).toBe('on-rails');
		expect(t.mode(t.b)).toBe('on-rails');
		// neither vessel saw a non-zero attitude after the request
		const after = t.dispatched.slice(t.dispatched.findIndex((c) => c.type === 'warp'));
		expect(after.filter((c) => c.type === 'attitude' && c.pitch !== 0)).toEqual([]);
		t.host.dispose();
	});
});
