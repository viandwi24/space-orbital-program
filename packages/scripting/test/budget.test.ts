import { expect, test } from 'bun:test';
import type { TickResult } from '../src/index.ts';
import { newRig } from './helpers.ts';

const BUDGET_MS = 25;
/**
 * Wall-clock assertions in this file are hang detectors, not performance claims: what the tests
 * prove is deterministic (status, error text, ticks after the kill do no guest work, sim time
 * advances). The bound is far above the budget so machine load cannot trip it, and far below the
 * test timeout so a disabled interrupt (a spin that never ends) still fails the test.
 */
const HANG_MS = 2_000;

/** Steps the sim 100 times (2 s) around a script; returns per-iteration wall times. */
async function runAgainstSim(source: string, options = {}) {
	const rig = await newRig();
	const runner = await rig.runner(source, { budgetMs: BUDGET_MS, ...options });
	const t0 = rig.sim.time;
	const iterations: number[] = [];
	const results: TickResult[] = [];
	for (let i = 0; i < 100; i++) {
		const began = performance.now();
		results.push(rig.advance(runner));
		iterations.push(performance.now() - began);
	}
	const advanced = rig.sim.time - t0;
	rig.sim.dispose();
	return { runner, first: results[0]!, later: results.slice(1), iterations, advanced };
}

test('an infinite loop is terminated within the budget and the sim keeps stepping', async () => {
	const { runner, first, later, iterations, advanced } = await runAgainstSim('while (true) {}');
	expect(runner.status).toBe('terminated');
	expect(runner.error).toContain('time budget exceeded');
	expect(first.status).toBe('terminated');
	expect(first.elapsedMs).toBeGreaterThanOrEqual(BUDGET_MS - 2); // it ran until the deadline
	expect(first.elapsedMs).toBeLessThan(HANG_MS);
	// The sim kept stepping: 100 steps of 0.02 s, and after the kill the runner does no guest work.
	expect(advanced).toBeCloseTo(2, 6);
	expect(first.commands).toEqual([]);
	expect(later.every((r) => r.status === 'terminated' && r.elapsedMs === 0)).toBe(true);
	expect(later).toHaveLength(99);
	expect(Math.max(...iterations)).toBeLessThan(HANG_MS);
});

test('a promise-job spin (microtask loop) is terminated too', async () => {
	const { runner, first } = await runAgainstSim('while (true) { await Promise.resolve(); }');
	expect(runner.status).toBe('terminated');
	expect(first.elapsedMs).toBeLessThan(HANG_MS);
});

test('an infinite loop after some waiting is terminated on the tick it starts', async () => {
	const { runner } = await runAgainstSim('await wait(0.5); while (true) {}');
	expect(runner.status).toBe('terminated');
});

test('memory exhaustion terminates the script instead of the host', async () => {
	const { runner, first } = await runAgainstSim(
		'const a = []; while (true) { a.push(new Array(100000).fill(1)); }',
		{ memoryLimitBytes: 4 * 1024 * 1024, budgetMs: 30_000 }
	);
	expect(runner.status).toBe('terminated');
	expect(runner.error).toContain('memory limit');
	// the memory limit, not the (here huge) time budget, ended it; exhaustion itself takes ~1 s
	expect(first.elapsedMs).toBeLessThan(25_000);
}, 30_000);

test('runaway recursion is a catchable script error, not a host crash', async () => {
	// A generous budget: what is tested is the classification of a stack overflow, not how fast the
	// machine unwinds 256 KiB of frames (a 25 ms budget made this flaky under parallel load).
	const { runner } = await runAgainstSim('const f = () => f() + 1; f();', { budgetMs: 5_000 });
	expect(runner.status).toBe('failed');
	expect(runner.error).toMatch(/stack/i);
});

test('a script cannot swallow the interrupt and keep running', async () => {
	const { runner } = await runAgainstSim(
		'for (;;) { try { while (true) {} } catch (e) { /* ignored */ } }'
	);
	expect(runner.status).toBe('terminated');
});

test('a well-behaved script stays within its budget on every tick', async () => {
	// A generous budget: this proves a light script is never terminated, not how fast the machine is.
	const { runner, iterations } = await runAgainstSim(
		'let n = 0; while (true) { n += ship.speed; await nextTick(); }',
		{ budgetMs: HANG_MS }
	);
	expect(runner.status).toBe('running');
	expect(runner.error).toBeUndefined();
	expect(Math.max(...iterations)).toBeLessThan(HANG_MS);
});

test('firstTickBudgetMs gives only the first tick a larger budget (cold WASM, ADR 0031)', async () => {
	const rig = await newRig();
	// ~30 ms of work per tick: the first tick (5 s allowance) survives, the second (10 ms) does not.
	const busy = `
		const spin = () => { const end = Date.now() + 30; while (Date.now() < end) {} };
		spin(); await nextTick(); spin();
	`;
	const runner = await rig.runner(busy, { budgetMs: 10, firstTickBudgetMs: 5_000 });
	expect(rig.advance(runner).status).toBe('running');
	const second = rig.advance(runner);
	expect(second.status).toBe('terminated');
	expect(runner.error).toContain('10 ms');
	// without the option the first tick is held to budgetMs too
	const strict = await rig.runner('while (true) {}', { budgetMs: 10 });
	expect(rig.advance(strict).status).toBe('terminated');
	rig.sim.dispose();
});

/**
 * The budget is an interrupt poll inside the interpreter, not a hard bound: a single native
 * builtin (here a BigInt power, ~100 ms) runs to the end first. This is why the web client runs
 * the runner in a Worker it can terminate (ADR 0031); a long `indexOf` needle runs for seconds.
 */
test('a native builtin can overrun the budget before the interrupt is polled', async () => {
	const rig = await newRig();
	const runner = await rig.runner('(3n ** 3000000n).toString().length;', { budgetMs: 10 });
	const began = performance.now();
	const result = rig.advance(runner);
	const wall = performance.now() - began;
	expect(result.status).toBe('terminated');
	expect(wall).toBeGreaterThan(30); // documented limit: > 3x the budget before it stops
	rig.sim.dispose();
});
