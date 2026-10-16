import { afterAll, beforeAll, expect, test } from 'bun:test';
import { scriptErrorLine } from '../src/index.ts';
import { newRig, type Rig } from './helpers.ts';

let rig: Rig;
beforeAll(async () => {
	rig = await newRig();
});
afterAll(() => rig.sim.dispose());

/** Run `source` for one tick and return what the runner says went wrong. */
async function fail(source: string): Promise<{ status: string; line: number | undefined }> {
	const runner = await rig.runner(source);
	runner.tick(rig.sim.snapshot());
	return { status: runner.status, line: runner.errorLine };
}

test('a runtime error reports the script line, not the wrapper line', async () => {
	expect(await fail('print(1);\nprint(2);\nnull.x;')).toEqual({ status: 'failed', line: 3 });
	expect(await fail('null.x;')).toEqual({ status: 'failed', line: 1 });
});

test('a syntax error reports its line', async () => {
	expect(await fail('print(1);\nlet a = ;')).toEqual({ status: 'failed', line: 2 });
});

test('an error inside a helper function points at the call in the script, not at the API prelude', async () => {
	const result = await fail('function g() {\n  ship.throttle = 5;\n}\ng();');
	expect(result).toEqual({ status: 'failed', line: 2 });
});

test('the error text names the script line, not the wrapper line', async () => {
	const runner = await rig.runner('print(1);\nprint(2);\nnull.x;');
	runner.tick(rig.sim.snapshot());
	expect(runner.error).toContain('at <anonymous> (line 3:');
	expect(runner.error).not.toContain('script.js');
});

test('a script that does not fail has no error line', async () => {
	expect(await fail('print(1);')).toEqual({ status: 'finished', line: undefined });
});

test('scriptErrorLine reads the first script.js frame and ignores the wrapper lines', () => {
	expect(scriptErrorLine('at set (prelude.js:41:12)\n    at g (script.js:4:7)')).toBe(2);
	expect(scriptErrorLine('at prelude.js:9:9')).toBeUndefined();
	expect(scriptErrorLine('at script.js:2:1')).toBeUndefined(); // inside the wrapper itself
	expect(scriptErrorLine(undefined)).toBeUndefined();
});
