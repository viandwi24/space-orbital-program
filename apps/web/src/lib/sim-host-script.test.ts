import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createScriptRunner } from '@orbital/scripting';
import { createSim, type Sim } from '@orbital/sim';
import type { Command } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import type { WorkerMessage } from './messages';
import { createInProcessScriptWorker } from './script-worker-core';
import {
	createSimHost,
	SCRIPT_BUDGET_MS,
	SCRIPT_FIRST_TICK_BUDGET_MS,
	SCRIPT_FUEL_POLLS
} from './sim-host';

type Status = Extract<WorkerMessage, { kind: 'script-status' }>;

/** A host over a real headless sim and the real runner; wall clock plus a skew the test advances per tick. */
async function setup(
	budgets: { budgetMs?: number; firstTickBudgetMs?: number; orbitAltitude?: number } = {}
) {
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
				maxFlightFrames: 1
			});
			const dispatch = sim.dispatch.bind(sim);
			sim.dispatch = (command) => {
				dispatched.push(command as Command);
				return dispatch(command);
			};
			return sim;
		},
		// Plumbing tests use generous budgets: they must not depend on machine speed. The runaway
		// test passes none and so gets the shipped ones.
		scriptBudgetMs: budgets.budgetMs ?? 5_000,
		scriptFirstTickBudgetMs: budgets.firstTickBudgetMs ?? 5_000,
		spawnScriptWorker: () => createInProcessScriptWorker(createScriptRunner, hostNow),
		post: (m) => void posted.push(m),
		now: hostNow
	});
	await host.start();
	// An orbit placement (plans 035, 045: SAS, nodes, targets and warp-to need the vessel on rails).
	const home = sim!.registries.bodies.get(sim!.home)!;
	const radius = home.radius + (budgets.orbitAltitude ?? 0);
	const speed = Math.sqrt((6.6743e-11 * home.mass) / radius);
	host.handle({
		kind: 'command',
		id: 1,
		command: {
			type: 'load-vessel',
			design: referenceTwoStage(),
			...(budgets.orbitAltitude === undefined
				? {}
				: {
						placement: {
							kind: 'state' as const,
							position: { x: radius, y: 0, z: 0 },
							velocity: { x: 0, y: 0, z: -speed }
						}
					})
		}
	});
	const loaded = posted.find((m) => m.kind === 'result');
	const vessel = loaded?.kind === 'result' && loaded.result.ok ? loaded.result.vessel : undefined;
	if (vessel === undefined) throw new Error('vessel not loaded');
	dispatched.length = 0;
	return {
		host,
		posted,
		dispatched,
		vessel: Number(vessel),
		sim: () => sim!,
		/** One host tick with 20 ms of wall time since the previous one. */
		tick: () => {
			skew += 20;
			host.tick();
		},
		statuses: () => posted.filter((m): m is Status => m.kind === 'script-status'),
		lines: () => posted.flatMap((m) => (m.kind === 'script-log' ? m.lines : []))
	};
}

async function until(cond: () => boolean): Promise<void> {
	for (let i = 0; i < 500 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
	expect(cond()).toBe(true);
}

describe('sim host: scripts (plan 015)', () => {
	it('script-start boots a runner: starting then running, print output and commands reach the sim', async () => {
		const t = await setup();
		t.host.handle({
			kind: 'script-start',
			source: 'print("hello", 1 + 1); ship.throttle = 0.5;',
			vessel: t.vessel
		});
		expect(t.statuses().map((s) => s.status)).toEqual(['starting']);
		await until(() => t.statuses().some((s) => s.status === 'running'));
		t.tick();
		expect(t.lines()).toEqual(['hello 2']);
		expect(t.dispatched).toEqual([{ type: 'throttle', vessel: t.vessel, value: 0.5 }]);
		// the sim accepted it: no refusal line was logged
		expect(t.lines().some((l) => l.startsWith('!'))).toBe(false);
		t.host.dispose();
	});

	it("a script that stages makes the host post the sim's stage event (plan 017), a page command too", async () => {
		const t = await setup();
		const stages = () => t.posted.filter((m) => m.kind === 'stage');
		t.host.handle({ kind: 'script-start', source: 'stage();', vessel: t.vessel });
		await until(() => t.statuses().some((s) => s.status === 'running'));
		expect(stages()).toEqual([]);
		t.tick();
		expect(stages()).toEqual([{ kind: 'stage', vessel: t.vessel, stage: 0 }]);
		t.host.handle({
			kind: 'command',
			id: 9,
			command: { type: 'stage', vessel: t.vessel }
		});
		expect(stages().at(-1)).toEqual({ kind: 'stage', vessel: t.vessel, stage: 1 });
		t.host.dispose();
	});

	it('a script error reaches the page with its script line (plan 030)', async () => {
		const t = await setup();
		t.host.handle({
			kind: 'script-start',
			source: 'print(1);\nprint(2);\nnull.x;',
			vessel: t.vessel
		});
		await until(() => t.statuses().some((s) => s.status === 'running'));
		t.tick();
		const failed = t.statuses().at(-1);
		expect(failed).toMatchObject({ status: 'failed', errorLine: 3 });
		expect(failed?.error).toContain('line 3:');
		t.host.dispose();
	});

	it('a channel port the page sent is closed when the Run is refused (no vessel, no sim)', async () => {
		const t = await setup();
		const { port1, port2 } = new MessageChannel();
		let closed = false;
		const spy = {
			postMessage: port1.postMessage.bind(port1),
			onmessage: null,
			close: () => {
				closed = true;
				port1.close();
			}
		};
		t.host.handle({ kind: 'script-start', source: 'x', vessel: 999, port: spy });
		expect(closed).toBe(true);
		expect(t.statuses().at(-1)).toMatchObject({ status: 'failed' });
		port2.close();
		t.host.dispose();
	});

	it('a finished script posts finished and stops ticking', async () => {
		const t = await setup();
		t.host.handle({ kind: 'script-start', source: 'print("done")', vessel: t.vessel });
		await until(() => t.statuses().some((s) => s.status === 'running'));
		t.tick();
		expect(t.statuses().at(-1)).toMatchObject({ status: 'finished' });
		const count = t.statuses().length;
		t.tick();
		expect(t.statuses()).toHaveLength(count);
		t.host.dispose();
	});

	it('a script error is reported as failed with the message', async () => {
		const t = await setup();
		t.host.handle({ kind: 'script-start', source: 'throw new Error("boom")', vessel: t.vessel });
		await until(() => t.statuses().some((s) => s.status === 'running'));
		t.tick();
		expect(t.statuses().at(-1)).toMatchObject({ status: 'failed' });
		expect(t.statuses().at(-1)?.error).toContain('boom');
		t.host.dispose();
	});

	it('script-stop ends a running script and no more commands are issued', async () => {
		const t = await setup();
		t.host.handle({
			kind: 'script-start',
			source: 'for (;;) { ship.attitude = { pitch: Math.random() }; await nextTick(); }',
			vessel: t.vessel
		});
		await until(() => t.statuses().some((s) => s.status === 'running'));
		t.tick();
		t.tick();
		expect(t.dispatched.length).toBeGreaterThan(0);
		t.host.handle({ kind: 'script-stop' });
		expect(t.statuses().at(-1)).toMatchObject({ status: 'stopped' });
		const issued = t.dispatched.length;
		t.tick();
		expect(t.dispatched).toHaveLength(issued);
		t.host.dispose();
	});

	it('a stop that arrives while the runner is still booting discards it', async () => {
		const t = await setup();
		t.host.handle({ kind: 'script-start', source: 'print("late")', vessel: t.vessel });
		t.host.handle({ kind: 'script-stop' });
		await new Promise((r) => setTimeout(r, 100));
		t.tick();
		expect(t.statuses().map((s) => s.status)).toEqual(['starting', 'stopped']);
		expect(t.lines()).toEqual([]);
		t.host.dispose();
	});

	it('refuses to start for a vessel that does not exist', async () => {
		const t = await setup();
		t.host.handle({ kind: 'script-start', source: 'print(1)', vessel: 999 });
		expect(t.statuses().at(-1)).toMatchObject({ status: 'failed' });
		t.host.dispose();
	});

	it('logs a sim refusal once instead of every tick', async () => {
		const t = await setup();
		// The reference design has two stages; staging a third time is refused by the sim.
		t.host.handle({
			kind: 'script-start',
			source: 'for (;;) { stage(); await nextTick(); }',
			vessel: t.vessel
		});
		await until(() => t.statuses().some((s) => s.status === 'running'));
		for (let i = 0; i < 6; i++) t.tick();
		const refusals = t.lines().filter((l) => l.startsWith('! stage'));
		expect(refusals).toHaveLength(1);
		t.host.dispose();
	});

	it('a runaway script is terminated within the first-tick budget and snapshots keep flowing', async () => {
		const t = await setup({
			budgetMs: SCRIPT_BUDGET_MS,
			firstTickBudgetMs: SCRIPT_FIRST_TICK_BUDGET_MS
		});
		t.host.handle({ kind: 'script-start', source: 'while (true) {}', vessel: t.vessel });
		await until(() => t.statuses().some((s) => s.status === 'running'));
		const before = t.sim().time;
		const began = performance.now();
		t.tick();
		const wall = performance.now() - began;
		const stopped = t.statuses().at(-1);
		expect(stopped).toMatchObject({ status: 'terminated' });
		expect(stopped?.error).toMatch(/(time|work) budget exceeded/);
		// The in-process double blocks the host for the script's first-tick allowance; the real
		// arrangement does not (sim-host-script-worker.test.ts). What is asserted is the mechanism
		// (terminated, the budget named in the message, the sim moving on); the wall bound is a hang
		// detector far above the allowance, not a performance claim.
		expect(SCRIPT_BUDGET_MS).toBe(200);
		expect(SCRIPT_FIRST_TICK_BUDGET_MS).toBe(300);
		expect(stopped?.error).toContain(
			stopped?.error?.startsWith('work')
				? `${SCRIPT_FUEL_POLLS} interrupt polls per tick`
				: `${SCRIPT_FIRST_TICK_BUDGET_MS} ms per tick`
		);
		expect(wall).toBeLessThan(10_000);
		const snapshots = t.posted.filter((m) => m.kind === 'snapshot').length;
		for (let i = 0; i < 10; i++) t.tick();
		expect(t.posted.filter((m) => m.kind === 'snapshot').length).toBe(snapshots + 10);
		expect(t.sim().time).toBeGreaterThan(before + 0.1);
		t.host.dispose();
	});

	it('answers script-start with failed when the host has no runner factory', async () => {
		const posted: WorkerMessage[] = [];
		const host = createSimHost({
			createSim: () =>
				createSim({
					plugins: [Stock],
					backendFactory: () => createRapierBackend({ solverIterations: 16 }),
					maxFlightFrames: 1
				}),
			post: (m) => void posted.push(m),
			now: () => 0
		});
		await host.start();
		host.handle({ kind: 'script-start', source: '', vessel: 0 });
		expect(posted.at(-1)).toMatchObject({ kind: 'script-status', status: 'failed' });
		host.dispose();
	});

	it('a script reaches the sim with SAS, maneuver nodes, the target and warp-to; the hold ends when the warp does (plans 042, 045, 035)', async () => {
		const t = await setup({ orbitAltitude: 150_000 });
		// A second vessel ahead on a higher orbit: something to target.
		const home = t.sim().registries.bodies.get(t.sim().home)!;
		const radius = home.radius + 165_000;
		const speed = Math.sqrt((6.6743e-11 * home.mass) / radius);
		const phase = 0.4;
		t.host.handle({
			kind: 'command',
			id: 2,
			command: {
				type: 'load-vessel',
				design: referenceTwoStage(),
				placement: {
					kind: 'state',
					position: { x: radius * Math.cos(phase), y: 0, z: -radius * Math.sin(phase) },
					velocity: { x: -speed * Math.sin(phase), y: 0, z: -speed * Math.cos(phase) }
				}
			}
		});
		t.host.handle({
			kind: 'script-start',
			source: `
				const other = ship.targets.find((t) => t.kind === 'vessel');
				print('target ' + JSON.stringify(await setTarget(other)));
				await nextTick();
				ship.sas = 'target';
				print('node ' + JSON.stringify(await addNode({ time: time() + 600, prograde: 50 })));
				await nextTick();
				print('seen ' + ship.nodes.length + ' ' + (ship.target !== null) + ' ' + (ship.target.approach !== null));
				const goal = time() + 300;
				print('warp ' + JSON.stringify(await warpTo(goal, 1000)));
				await waitUntil(() => time() >= goal);
				print('arrived');
				ship.attitude = { pitch: 0.2, yaw: 0, roll: 0 };
			`,
			vessel: t.vessel
		});
		await until(() => t.statuses().some((s) => s.status === 'running'));
		// A warp-to closes on its time by a fixed fraction of what is left per frame: a few hundred ticks.
		for (let i = 0; i < 900 && !t.lines().includes('arrived'); i++) t.tick();
		t.tick();
		t.tick();
		const lines = t.lines();
		expect(lines.filter((l) => l.startsWith('!'))).toEqual([]);
		expect(lines).toContain('target {"ok":true}');
		expect(lines.find((l) => l.startsWith('node '))).toContain('"ok":true');
		expect(lines).toContain('seen 1 true true');
		expect(lines).toContain('warp {"ok":true}');
		expect(lines).toContain('arrived');
		const self = t
			.sim()
			.snapshot()
			.vessels.find((v) => Number(v.id) === t.vessel)!;
		expect(self.sas!.mode).toBe('target');
		expect(self.target?.kind).toBe('vessel');
		expect(t.sim().warp).toBe(1);
		// The warp is over, so the script's attitude demand is no longer held back from the sim.
		expect(t.dispatched.some((c) => c.type === 'attitude' && c.pitch === 0.2)).toBe(true);
		expect(lines.some((l) => l.includes('held while time warp'))).toBe(false);
		t.host.dispose();
	});
});
