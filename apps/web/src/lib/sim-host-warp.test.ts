/** Plan 032, ADR 0039: time warp while a script runs (a real sim, the real runner, an in-process script Worker). */
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createScriptRunner } from '@orbital/scripting';
import { createSim, type Sim } from '@orbital/sim';
import type { Command } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import type { WorkerMessage } from './messages';
import { createInProcessScriptWorker } from './script-worker-core';
import { createSimHost, HELD_REASON, WARP_PENDING_MS } from './sim-host';

const HOME_RADIUS = 600_000;
const HOME_MU = 3.5316e12;

type Placement = { altitude: number; speedFactor: number };

/** A host over a real sim with the two-stage vessel in a circular orbit (or at `placement`). */
async function setup(placement: Placement = { altitude: 100_000, speedFactor: 1 }) {
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
		scriptBudgetMs: 5_000,
		scriptFirstTickBudgetMs: 5_000,
		scriptFuelPolls: Infinity,
		spawnScriptWorker: () => createInProcessScriptWorker(createScriptRunner, hostNow),
		post: (m) => void posted.push(m),
		now: hostNow
	});
	await host.start();
	const r = HOME_RADIUS + placement.altitude;
	host.handle({
		kind: 'command',
		id: 1,
		command: {
			type: 'load-vessel',
			design: referenceTwoStage(),
			placement: {
				kind: 'state',
				position: { x: r, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -Math.sqrt(HOME_MU / r) * placement.speedFactor }
			}
		}
	});
	const loaded = posted.find((m) => m.kind === 'result');
	const vessel = loaded?.kind === 'result' && loaded.result.ok ? loaded.result.vessel : undefined;
	if (vessel === undefined) throw new Error('vessel not loaded');
	dispatched.length = 0;
	let nextId = 100;
	const t = {
		host,
		posted,
		dispatched,
		vessel: Number(vessel),
		sim: () => sim!,
		mode: () => sim!.snapshot().vessels.find((v) => Number(v.id) === Number(vessel))?.mode,
		tick: (n = 1) => {
			for (let i = 0; i < n; i++) {
				skew += 20;
				host.tick();
			}
		},
		/** Skip wall time without stepping (for the pending timeout). */
		skip: (ms: number) => void (skew += ms),
		lines: () => posted.flatMap((m) => (m.kind === 'script-log' ? m.lines : [])),
		statuses: () =>
			posted.filter(
				(m): m is Extract<WorkerMessage, { kind: 'script-status' }> => m.kind === 'script-status'
			),
		/** The page asks for a warp; returns a getter for the answer (undefined while pending). */
		pageWarp: (factor: number) => {
			const id = nextId++;
			host.handle({ kind: 'command', id, command: { type: 'warp', factor } });
			return () => {
				const m = posted.find((p) => p.kind === 'result' && p.id === id);
				return m?.kind === 'result' ? m.result : undefined;
			};
		},
		async run(source: string) {
			host.handle({ kind: 'script-start', source, vessel: Number(vessel) });
			for (let i = 0; i < 500 && !t.statuses().some((s) => s.status === 'running'); i++) {
				await new Promise((res) => setTimeout(res, 10));
			}
			expect(t.statuses().some((s) => s.status === 'running')).toBe(true);
		}
	};
	return t;
}

/** A coasting attitude loop: a new, tiny, non-zero demand every tick (what a PD loop does). */
const WIGGLE = `let n = 0; while (true) { ship.attitude = { pitch: 0.001 + 1e-6 * n++ }; await nextTick(); }`;

describe('time warp while a script runs (ADR 0039)', () => {
	it('control: a wiggling attitude keeps the vessel in flight; physics warp needs no rails (plan 206)', async () => {
		const t = await setup();
		expect(t.mode()).toBe('on-rails');
		await t.run(WIGGLE);
		t.tick(400); // 8 s of sim time: well past the 2 s idle time
		expect(t.mode()).toBe('flight');
		const verdict = t.sim().dispatch({ type: 'warp', factor: 10 });
		expect(verdict).toEqual({ ok: true, granted: 10 });
		expect(t.mode()).toBe('flight');
		t.host.dispose();
	});

	it('a page warp request waits for the rails and is then accepted; sim time runs at the factor; the script keeps running', async () => {
		const t = await setup();
		await t.run(WIGGLE);
		t.tick(20);
		expect(t.mode()).toBe('flight');
		const answer = t.pageWarp(50); // rails warp (plan 206): the attitude is held first
		expect(answer()).toBeUndefined(); // pending: the vessel is still in flight
		for (let i = 0; i < 400 && answer() === undefined; i++) t.tick();
		expect(answer()).toEqual({ ok: true, granted: 50 });
		expect(t.mode()).toBe('on-rails');
		const before = t.sim().time;
		t.tick(50);
		const gained = t.sim().time - before;
		// 50 ticks of 20 ms at 50x (the host clamps one step to 0.1 s of wall time)
		expect(gained).toBeGreaterThan(40);
		expect(gained).toBeLessThan(60);
		expect(t.statuses().at(-1)?.status).toBe('running');
		// the sim never saw another non-zero attitude after the request
		const after = t.dispatched.slice(t.dispatched.findIndex((c) => c.type === 'warp'));
		expect(after.filter((c) => c.type === 'attitude' && c.pitch !== 0)).toEqual([]);
		// ... and the script was told why
		expect(t.lines().some((l) => l.includes(HELD_REASON))).toBe(true);
		t.host.dispose();
	});

	it('the script learns that its attitude was held (ship.refusals)', async () => {
		const t = await setup();
		await t.run(`
			let n = 0;
			while (true) {
				ship.attitude = { pitch: 0.001 + 1e-6 * n++ };
				await nextTick();
				if (ship.refusals.length > 0) { print('refused: ' + ship.refusals[0].reason.slice(0, 4)); break; }
			}
		`);
		t.tick(30);
		const answer = t.pageWarp(50);
		for (let i = 0; i < 400 && answer() === undefined; i++) t.tick();
		t.tick(5);
		expect(t.lines().filter((l) => l.startsWith('refused:'))).toEqual(['refused: held']);
		t.host.dispose();
	});

	it('a burning script (throttle above 0) gets physics warp at once, with the reason (plan 206)', async () => {
		const t = await setup();
		await t.run(`ship.throttle = 1; stage(); while (true) await nextTick();`);
		t.tick(10);
		const answer = t.pageWarp(50);
		expect(answer()).toEqual({ ok: true, granted: 10, limit: 'Max 10× — engine running' });
		expect(t.mode()).toBe('flight');
		t.host.dispose();
	});

	it('warp 1 gives the held attitude back and the vessel wakes into it', async () => {
		const t = await setup();
		await t.run(WIGGLE);
		t.tick(20);
		const answer = t.pageWarp(50);
		for (let i = 0; i < 400 && answer() === undefined; i++) t.tick();
		t.tick(10);
		expect(t.mode()).toBe('on-rails');
		t.dispatched.length = 0;
		const back = t.pageWarp(1);
		expect(back()).toEqual({ ok: true, granted: 1 });
		const restored = t.dispatched.filter((c) => c.type === 'attitude');
		expect(restored.length).toBeGreaterThanOrEqual(1);
		expect(restored.at(-1)?.type).toBe('attitude');
		expect((restored.at(-1) as { pitch: number }).pitch).toBeGreaterThan(0.001);
		t.tick(5);
		expect(t.mode()).toBe('flight'); // the script's demand applies again at 1x
		t.host.dispose();
	});

	it('in the air a rails request is clamped to physics warp with the reason, and the hold ends (plan 206)', async () => {
		// 10 km up, slow: a suborbital vessel in the air never qualifies for the rails
		const t = await setup({ altitude: 10_000, speedFactor: 0.3 });
		await t.run(WIGGLE);
		t.tick(10);
		const answer = t.pageWarp(50);
		t.tick(2);
		expect(answer()).toEqual({ ok: true, granted: 10, limit: 'Max 10× — in the atmosphere' });
		void WARP_PENDING_MS;
		// the hold is over: the script's attitude reaches the sim again
		t.dispatched.length = 0;
		t.tick(5);
		expect(t.dispatched.some((c) => c.type === 'attitude' && c.pitch !== 0)).toBe(true);
		t.host.dispose();
	});

	it('stopping the script answers a pending request (nothing hangs)', async () => {
		const t = await setup();
		await t.run(WIGGLE);
		t.tick(10);
		const answer = t.pageWarp(50);
		expect(answer()).toBeUndefined();
		t.host.handle({ kind: 'script-stop' });
		expect(answer()).toBeDefined();
		t.host.dispose();
	});

	it("a script's warp(f) resolves its promise with the verdict, and warp(1) returns to real time", async () => {
		const t = await setup();
		await t.run(`
			const a = await warp(10);
			print('a ' + JSON.stringify(a));
			const t0 = time();
			await wait(30);
			print('waited ' + (time() - t0 >= 30));
			const b = await warp(1);
			print('b ' + JSON.stringify(b));
		`);
		// the script starts after the first tick; the vessel is on rails, so warp is direct
		t.tick(3);
		expect(t.sim().time).toBeGreaterThan(0);
		t.tick(300); // wait(30) at 10x
		expect(t.lines()).toContain('a {"ok":true}');
		expect(t.lines()).toContain('waited true');
		expect(t.lines()).toContain('b {"ok":true}');
		t.host.dispose();
	});

	it('the guide example: a coasting script with an attitude loop warps towards a burn and returns to real time in time', async () => {
		const t = await setup();
		await t.run(`
			let n = 0;
			const burnAt = time() + 600;
			print('burn at ' + burnAt);
			while (burnAt - time() > 120) {
				ship.attitude = { pitch: 0.001 + 1e-6 * n++ };
				const factor = Math.max(1, Math.min(100, Math.floor((burnAt - time() - 60) / 2)));
				await warp(factor);
				await nextTick();
			}
			const back = await warp(1);
			print('back ' + JSON.stringify(back) + ' at ' + time());
		`);
		for (let i = 0; i < 3000 && !t.lines().some((l) => l.startsWith('back')); i++) t.tick();
		const burn = Number(
			t
				.lines()
				.find((l) => l.startsWith('burn at'))!
				.slice(8)
		);
		const back = t.lines().find((l) => l.startsWith('back'))!;
		expect(back).toContain('{"ok":true}');
		const at = Number(back.slice(back.lastIndexOf(' ') + 1));
		expect(at).toBeGreaterThan(burn - 125);
		expect(at).toBeLessThan(burn - 100);
		expect(t.statuses().at(-1)?.status).toMatch(/running|finished/);
		t.host.dispose();
	});
});
