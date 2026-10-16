import { Worker } from 'node:worker_threads';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import type { Command } from '@orbital/core';
import { createSim, type Sim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import type { WorkerMessage } from './messages';
import type { ScriptWorkerLike } from './script-protocol';
import { createSimHost } from './sim-host';

/** ADR 0031: the script runs in a real thread; these tests block or kill that thread on purpose. */

/** Wraps a `node:worker_threads` Worker in the `ScriptWorkerLike` shape. */
function adapt(worker: Worker): ScriptWorkerLike {
	const like: ScriptWorkerLike = {
		onmessage: null,
		onerror: null,
		postMessage: (message) => worker.postMessage(message),
		terminate: () => void worker.terminate()
	};
	worker.on('message', (data: unknown) => like.onmessage?.({ data }));
	worker.on('error', (e: Error) => like.onerror?.({ message: e.message }));
	return like;
}

// `--experimental-transform-types`: workspace packages use TypeScript parameter properties.
const quickjsThread = () =>
	new Worker(new URL('./script-worker-node.fixture.ts', import.meta.url), {
		execArgv: ['--experimental-transform-types']
	});
/** A thread that never boots: the worst case of a stuck script engine. */
const stuckThread = () => new Worker('for (;;) {}', { eval: true });
/** Boots, then blocks forever inside its first tick. */
const wedgedThread = () =>
	new Worker(
		`const { parentPort } = require('node:worker_threads');
		parentPort.on('message', (m) => { if (m.kind === 'start') parentPort.postMessage({ kind: 'ready' }); else for (;;) {} });`,
		{ eval: true }
	);
/** A compromised script worker: answers its first tick with commands no script may issue. */
const hostileThread = (vessel: number) =>
	new Worker(
		`const { parentPort } = require('node:worker_threads');
		parentPort.on('message', (m) => {
			if (m.kind === 'start') parentPort.postMessage({ kind: 'ready' });
			else parentPort.postMessage({ kind: 'result', status: 'running', elapsedMs: 0, lines: [], commands: [
				{ type: 'load-vessel', design: {} },
				{ type: 'throttle', vessel: ${vessel + 1}, value: 1 },
				{ type: 'throttle', vessel: ${vessel}, value: 0.25 }
			] });
		});`,
		{ eval: true }
	);

async function setup(spawn: (vessel: () => number) => Worker, watchdogMs: number, bootMs = 10_000) {
	const posted: WorkerMessage[] = [];
	const threads: Worker[] = [];
	const dispatched: Command[] = [];
	let vessel = -1;
	let sim: Sim | undefined;
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
		spawnScriptWorker: () => {
			const thread = spawn(() => vessel);
			threads.push(thread);
			return adapt(thread);
		},
		scriptBudgetMs: 5_000,
		scriptFirstTickBudgetMs: 5_000,
		scriptWatchdogMs: watchdogMs,
		scriptBootTimeoutMs: bootMs,
		post: (m) => void posted.push(m),
		now: () => performance.now()
	});
	await host.start();
	host.handle({
		kind: 'command',
		id: 1,
		command: { type: 'load-vessel', design: referenceTwoStage() }
	});
	const loaded = posted.find((m) => m.kind === 'result');
	if (loaded?.kind !== 'result' || !loaded.result.ok) throw new Error('vessel not loaded');
	vessel = Number(loaded.result.vessel);
	dispatched.length = 0;
	return {
		host,
		posted,
		threads,
		dispatched,
		vessel,
		simTime: () => sim!.time,
		statuses: () => posted.flatMap((m) => (m.kind === 'script-status' ? [m.status] : [])),
		lines: () => posted.flatMap((m) => (m.kind === 'script-log' ? m.lines : []))
	};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 15_000): Promise<void> {
	for (let i = 0; i < ms / 10 && !cond(); i++) await sleep(10);
	expect(cond()).toBe(true);
}

/** Ticks the host every 16 ms like the Worker's interval until `done`; returns the longest `tick()`, ms. */
async function tickUntil(
	host: { tick(): void },
	done: () => boolean,
	ms = 15_000
): Promise<number> {
	let worst = 0;
	const limit = performance.now() + ms;
	while (!done() && performance.now() < limit) {
		const began = performance.now();
		host.tick();
		worst = Math.max(worst, performance.now() - began);
		await sleep(16);
	}
	expect(done()).toBe(true);
	return worst;
}

/**
 * Wall-clock bound on one `host.tick()` while a script thread misbehaves, ms: calibrated in the
 * same run as 20 times the worst of 20 ticks with no script (a sim step plus a snapshot post),
 * never below 500 ms (a preempted tick on a loaded machine). A script blocking the sim thread would add seconds (the indexOf case runs
 * ~3 s), so the bound stays meaningful on a loaded machine without being tuned to a fast one.
 */
async function tickBound(host: { tick(): void }): Promise<number> {
	let worst = 0;
	for (let i = 0; i < 20; i++) {
		const began = performance.now();
		host.tick();
		worst = Math.max(worst, performance.now() - began);
		await sleep(16);
	}
	return Math.max(500, worst * 20);
}

describe('sim host with a real script thread (plan 018, ADR 0031)', () => {
	it('runs a script end to end in another thread', async () => {
		const t = await setup(() => quickjsThread(), 5000);
		t.host.handle({
			kind: 'script-start',
			source: 'ship.throttle = 0.5; print("hello from a worker");',
			vessel: t.vessel
		});
		await until(() => t.statuses().includes('running'));
		await tickUntil(t.host, () => t.statuses().some((s) => s !== 'starting' && s !== 'running'));
		expect(t.posted.findLast((m) => m.kind === 'script-status')).toMatchObject({
			status: 'finished'
		});
		expect(t.lines()).toContain('hello from a worker');
		t.host.dispose();
	});

	it('a thread wedged inside a tick cannot delay sim ticks; the watchdog terminates it and the sim keeps running', async () => {
		const t = await setup(() => wedgedThread(), 150);
		const bound = await tickBound(t.host);
		t.host.handle({ kind: 'script-start', source: '', vessel: t.vessel });
		await until(() => t.statuses().includes('running'));
		const exited = new Promise<void>((resolve) => t.threads[0]!.on('exit', () => resolve()));
		const timeBefore = t.simTime();
		const worst = await tickUntil(t.host, () => t.statuses().includes('terminated'));
		expect(worst).toBeLessThan(bound);
		expect(t.posted.findLast((m) => m.kind === 'script-status')).toMatchObject({
			status: 'terminated',
			error: expect.stringContaining('stopped responding')
		});
		await exited; // terminate() really ended the thread
		// the sim carries on after the script Worker is gone
		const worstAfter = await tickUntil(t.host, () => t.simTime() > timeBefore + 0.5);
		expect(worstAfter).toBeLessThan(bound);
		t.host.dispose();
	});

	it('a Worker that never boots is failed after the boot timeout, sim ticks unaffected', async () => {
		const t = await setup(() => stuckThread(), 150, 200);
		const bound = await tickBound(t.host);
		t.host.handle({ kind: 'script-start', source: '', vessel: t.vessel });
		const worst = await tickUntil(t.host, () => t.statuses().includes('failed'));
		expect(worst).toBeLessThan(bound);
		expect(t.posted.findLast((m) => m.kind === 'script-status')?.error).toContain('did not start');
		t.host.dispose();
	});

	it('a QuickJS builtin that ignores the interrupt budget is stopped by terminating the Worker', async () => {
		// indexOf with a long needle runs ~3 s inside one native call: the 10 ms budget cannot interrupt it.
		const t = await setup(() => quickjsThread(), 150);
		const bound = await tickBound(t.host);
		t.host.handle({
			kind: 'script-start',
			source: `('a'.repeat(3e6) + 'b').indexOf('a'.repeat(2000) + 'c');`,
			vessel: t.vessel
		});
		await until(() => t.statuses().includes('running'));
		const began = performance.now();
		const worst = await tickUntil(t.host, () => t.statuses().includes('terminated'));
		expect(worst).toBeLessThan(bound);
		expect(performance.now() - began).toBeLessThan(2500); // watchdog 150 ms plus scheduling; the native call alone runs about 3 s
		await tickUntil(t.host, () => t.simTime() > 0.5);
		t.host.dispose();
	}, 20_000);

	it('commands a compromised script worker sends are limited to the script command set for its vessel', async () => {
		const t = await setup((vessel) => hostileThread(vessel()), 5000);
		t.host.handle({ kind: 'script-start', source: '', vessel: t.vessel });
		await until(() => t.statuses().includes('running'));
		await tickUntil(t.host, () => t.dispatched.length > 0);
		expect(t.dispatched).toEqual([{ type: 'throttle', vessel: t.vessel, value: 0.25 }]);
		expect(t.lines().filter((l) => l.includes('not allowed for scripts'))).toHaveLength(2);
		t.host.dispose();
	});
});
