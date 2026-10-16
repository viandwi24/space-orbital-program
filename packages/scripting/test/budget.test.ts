import { expect, test } from 'bun:test';
import { newRig } from './helpers.ts';

const BUDGET_MS = 25;
/** Generous wall-clock slack over the budget for a loaded CI machine. */
const SLACK_MS = 250;

/** Steps the sim 100 times (2 s) around a script; returns per-iteration wall times. */
async function runAgainstSim(source: string, options = {}) {
	const rig = await newRig();
	const runner = await rig.runner(source, { budgetMs: BUDGET_MS, ...options });
	const t0 = rig.sim.time;
	const iterations: number[] = [];
	let first;
	for (let i = 0; i < 100; i++) {
		const began = performance.now();
		const r = rig.advance(runner);
		iterations.push(performance.now() - began);
		first ??= r;
	}
	const advanced = rig.sim.time - t0;
	rig.sim.dispose();
	return { runner, first: first!, iterations, advanced };
}

test('an infinite loop is terminated within the budget and the sim keeps stepping', async () => {
	const { runner, first, iterations, advanced } = await runAgainstSim('while (true) {}');
	expect(runner.status).toBe('terminated');
	expect(runner.error).toContain('time budget exceeded');
	expect(first.status).toBe('terminated');
	expect(first.elapsedMs).toBeGreaterThanOrEqual(BUDGET_MS - 2);
	expect(first.elapsedMs).toBeLessThan(BUDGET_MS + SLACK_MS);
	// The sim kept stepping: 100 steps of 0.02 s, and after the kill no iteration is slow.
	expect(advanced).toBeCloseTo(2, 6);
	expect(Math.max(...iterations.slice(1))).toBeLessThan(BUDGET_MS);
	expect(Math.max(...iterations)).toBeLessThan(BUDGET_MS + SLACK_MS);
});

test('a promise-job spin (microtask loop) is terminated too', async () => {
	const { runner, first } = await runAgainstSim('while (true) { await Promise.resolve(); }');
	expect(runner.status).toBe('terminated');
	expect(first.elapsedMs).toBeLessThan(BUDGET_MS + SLACK_MS);
});

test('an infinite loop after some waiting is terminated on the tick it starts', async () => {
	const { runner } = await runAgainstSim('await wait(0.5); while (true) {}');
	expect(runner.status).toBe('terminated');
});

test('memory exhaustion terminates the script instead of the host', async () => {
	const { runner, first } = await runAgainstSim(
		'const a = []; while (true) { a.push(new Array(10000).fill(1)); }',
		{ memoryLimitBytes: 4 * 1024 * 1024, budgetMs: 2_000 }
	);
	expect(runner.status).toBe('terminated');
	expect(runner.error).toContain('memory limit');
	expect(first.elapsedMs).toBeLessThan(2_000);
});

test('runaway recursion is a catchable script error, not a host crash', async () => {
	const { runner } = await runAgainstSim('const f = () => f() + 1; f();');
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
	const { runner, iterations } = await runAgainstSim(
		'let n = 0; while (true) { n += ship.speed; await nextTick(); }'
	);
	expect(runner.status).toBe('running');
	expect(Math.max(...iterations)).toBeLessThan(BUDGET_MS);
});
