import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';

/**
 * The two bundles the sandbox iframe runs (scripts/build-sandbox.ts), built for real and executed
 * as classic scripts, the way the iframe runs them (no `import.meta`, no module system).
 */
const webRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (name: string): string => readFileSync(`${webRoot}static/sandbox/${name}`, 'utf8');

let sim: Sim;
let vessel: number;
beforeAll(async () => {
	execFileSync('bun', ['scripts/build-sandbox.ts'], {
		cwd: webRoot,
		stdio: 'pipe',
		timeout: 60_000
	});
	sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1
	});
	const loaded = sim.dispatch({ type: 'load-vessel', design: referenceTwoStage() });
	if (!loaded.ok) throw new Error(loaded.reason);
	vessel = Number(loaded.vessel);
}, 90_000);
afterAll(() => sim?.dispose());

const nextMessage = (port: MessagePort): Promise<unknown> =>
	new Promise((resolve) => {
		port.onmessage = (event) => resolve(event.data);
	});

describe('sandbox bundles', () => {
	it('the Worker bundle is a classic, self-contained script', () => {
		const code = read('script-sandbox-worker.js');
		// A blob Worker cannot resolve imports, and `import.meta` is a syntax error outside a module.
		expect(code).not.toMatch(/\bimport\.meta\b/);
		expect(code).not.toMatch(/^\s*(import|export)\s/m);
		expect(() => new Function('self', code)).not.toThrow();
	});

	it('the iframe bootstrap can be inlined in a script element', () => {
		const code = read('script-sandbox-frame-main.js');
		expect(code).not.toMatch(/<\/script|<!--/i);
		expect(code.length).toBeLessThan(20_000);
	});

	it('the Worker bundle boots QuickJS from the bytes it is given and runs a script over the port', async () => {
		const code = read('script-sandbox-worker.js');
		const posted: unknown[] = [];
		const scope: {
			onmessage: ((e: { data: unknown }) => void) | null;
			postMessage(m: unknown): void;
		} = {
			onmessage: null,
			postMessage: (m) => void posted.push(m)
		};
		new Function('self', code)(scope);
		expect(scope.onmessage).toBeTypeOf('function');

		const wasmPath = createRequire(import.meta.url).resolve(
			'@jitl/quickjs-wasmfile-release-sync/wasm'
		);
		const bytes = readFileSync(wasmPath);
		const wasm = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
		const { port1, port2 } = new MessageChannel();
		scope.onmessage?.({
			data: { kind: 'init', port: port2, wasm, probeUrl: 'https://game.example/robots.txt' }
		});

		const ready = nextMessage(port1);
		port1.postMessage({
			kind: 'start',
			source: "print('sandboxed'); ship.throttle = 0.5;",
			vessel,
			budgetMs: 5_000,
			firstTickBudgetMs: 5_000,
			env: {
				bodies: sim.registries.bodies.list(),
				parts: sim.registries.parts.list(),
				resources: sim.registries.resources.list()
			}
		});
		expect(await ready).toEqual({ kind: 'ready' });
		const result = nextMessage(port1);
		port1.postMessage({ kind: 'tick', snapshot: sim.snapshot() });
		const answer = (await result) as {
			kind: string;
			commands: Array<{ type: string; value?: number }>;
			lines: string[];
		};
		expect(answer.kind).toBe('result');
		expect(answer.lines).toEqual(['sandboxed']);
		expect(answer.commands.map((c) => [c.type, c.value])).toEqual([['throttle', 0.5]]);

		// The self-test report goes to the iframe (self.postMessage), never over the port.
		await new Promise((r) => setTimeout(r, 50));
		expect(posted).toContainEqual({
			kind: 'report',
			report: expect.objectContaining({
				context: 'worker',
				target: 'https://game.example/robots.txt'
			})
		});
		port1.close();
		port2.close();
	}, 30_000);

	it('the Worker ignores everything but one init, and a bad one', () => {
		const code = read('script-sandbox-worker.js');
		const posted: unknown[] = [];
		const scope: {
			onmessage: ((e: { data: unknown }) => void) | null;
			postMessage(m: unknown): void;
		} = {
			onmessage: null,
			postMessage: (m) => void posted.push(m)
		};
		new Function('self', code)(scope);
		scope.onmessage?.({ data: { kind: 'init' } });
		scope.onmessage?.({ data: 'nonsense' });
		scope.onmessage?.({ data: { kind: 'start', source: 'x' } });
		expect(posted).toEqual([]);
	});
});
