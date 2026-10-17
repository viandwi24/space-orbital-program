/** Plan 058: the syntax check compiles in the sandbox's engine and never runs the script. */
import { expect, test } from 'bun:test';
import { getQuickJS } from 'quickjs-emscripten';
import { checkScriptSyntax } from '../src/index.ts';
import { newRig } from './helpers.ts';

const check = async (source: string) => checkScriptSyntax(await getQuickJS(), source);

test('valid scripts pass, including top-level await and the sample', async () => {
	expect(await check('')).toEqual({ ok: true });
	expect(await check('ship.throttle = 1;\nawait wait(5);\nprint(ship.altitude);')).toEqual({
		ok: true
	});
	const { ascentScript } = await import('../src/index.ts');
	expect(await check(ascentScript)).toEqual({ ok: true });
});

test('a missing bracket, a stray brace, a bad await and an unterminated string report the player line', async () => {
	const cases: Array<[string, number]> = [
		['print(1);\nprint(2);\nif (x) {\n  print(3);\n', 5],
		['print(1);\nprint(2);\n}', 3],
		['print(1);\nlet a = ;', 2],
		['print(1);\nfunction f() {\n  await wait(1);\n}', 3],
		['print(1);\nprint("open);\nprint(3);', 2]
	];
	for (const [source, line] of cases) {
		const result = await check(source);
		expect(result.ok, source).toBe(false);
		if (!result.ok) {
			expect(result.line, source).toBe(line);
			expect(result.message.length).toBeGreaterThan(3);
			expect(result.column).toBeGreaterThanOrEqual(1);
		}
	}
});

test('the runner reports the same line for the same mistake', async () => {
	const rig = await newRig();
	try {
		for (const source of ['print(1);\nlet a = ;', 'print(1);\nprint(2);\n}', 'f(1,\nlet b = ;']) {
			const result = await check(source);
			const runner = await rig.runner(source);
			runner.tick(rig.sim.snapshot());
			expect(result.ok).toBe(false);
			expect(runner.status).toBe('failed');
			if (!result.ok) expect(result.line).toBe(runner.errorLine);
		}
	} finally {
		rig.sim.dispose();
	}
});

test('the script is never executed: no output, and an endless loop returns at once', async () => {
	const rig = await newRig();
	try {
		const started = performance.now();
		expect(await check('print(1);\nwhile (true) {}')).toEqual({ ok: true });
		expect(await check('while (true) {}\nlet = ;')).toMatchObject({ ok: false, line: 2 });
		expect(performance.now() - started).toBeLessThan(1000);
		// Nothing ran: a runner created afterwards in the same module has no output of the checks.
		const runner = await rig.runner('print("only this");');
		runner.tick(rig.sim.snapshot());
		expect(runner.logs).toEqual(['only this']);
	} finally {
		rig.sim.dispose();
	}
});

test('a check leaves nothing behind: many checks in a row stay fast and valid', async () => {
	const QuickJS = await getQuickJS();
	for (let i = 0; i < 200; i++) {
		expect(checkScriptSyntax(QuickJS, `const a${i} = ${i};`)).toEqual({ ok: true });
	}
});
