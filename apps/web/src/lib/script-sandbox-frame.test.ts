import { describe, expect, it } from 'vitest';
import {
	createSandboxFrame,
	parseSandboxInit,
	type FrameEnv,
	type FrameWorker,
	type SandboxEvent
} from './script-sandbox-frame';

function setup(origin = 'null') {
	const parent = { name: 'parent' };
	const events: SandboxEvent[] = [];
	const workers: Array<
		FrameWorker & { sent: Array<{ message: unknown; transfer: Transferable[] }> }
	> = [];
	const sources: string[] = [];
	const env: FrameEnv = {
		origin,
		parent,
		postToParent: (event) => void events.push(event),
		createWorker: (source) => {
			sources.push(source);
			const worker = {
				onmessage: null,
				onerror: null,
				sent: [] as Array<{ message: unknown; transfer: Transferable[] }>,
				postMessage(message: unknown, transfer: Transferable[]) {
					worker.sent.push({ message, transfer });
				}
			};
			workers.push(worker);
			return worker;
		},
		probeScope: { origin }
	};
	const frame = createSandboxFrame(env);
	const { port1, port2 } = new MessageChannel();
	const init = () => ({
		kind: 'sandbox-init',
		workerSource: 'self.onmessage = () => {};',
		wasm: new ArrayBuffer(8),
		port: port2,
		probeUrl: 'https://game.example/robots.txt'
	});
	const done = () => {
		port1.close();
		port2.close();
	};
	return { frame, parent, events, workers, sources, init, done };
}

describe('sandbox frame', () => {
	it('starts the worker from the page text and hands over the port and the wasm bytes', async () => {
		const t = setup();
		t.frame.handle({ data: t.init(), source: t.parent });
		expect(t.sources).toEqual(['self.onmessage = () => {};']);
		const sent = t.workers[0]!.sent[0]!;
		expect(sent.message).toMatchObject({
			kind: 'init',
			probeUrl: 'https://game.example/robots.txt'
		});
		// Both are transferred, not copied: the iframe keeps nothing.
		expect(sent.transfer).toHaveLength(2);
		expect(t.events[0]).toEqual({ kind: 'sandbox-started' });
		await new Promise((r) => setTimeout(r, 10));
		expect(t.events.some((e) => e.kind === 'sandbox-report')).toBe(true);
		t.done();
	});

	it('refuses to run anything when its origin is not opaque (opened as a normal page)', () => {
		const t = setup('https://game.example');
		t.frame.handle({ data: t.init(), source: t.parent });
		expect(t.workers).toHaveLength(0);
		expect(t.events).toEqual([
			{ kind: 'sandbox-error', message: expect.stringContaining('game origin') }
		]);
		t.done();
	});

	it('ignores messages that do not come from its parent, and a second init', () => {
		const t = setup();
		t.frame.handle({ data: t.init(), source: { name: 'someone else' } });
		expect(t.workers).toHaveLength(0);
		t.frame.handle({ data: t.init(), source: t.parent });
		t.frame.handle({ data: t.init(), source: t.parent });
		expect(t.workers).toHaveLength(1);
		t.done();
	});

	it('relays the worker self-test report and its crashes, nothing else', () => {
		const t = setup();
		t.frame.handle({ data: t.init(), source: t.parent });
		const worker = t.workers[0]!;
		worker.onmessage?.(
			new MessageEvent('message', {
				data: { kind: 'report', report: { context: 'worker', probes: {} } }
			})
		);
		worker.onmessage?.(new MessageEvent('message', { data: { kind: 'steal', secret: 1 } }));
		worker.onerror?.({ message: 'boom' } as ErrorEvent);
		const kinds = t.events.map((e) => e.kind);
		expect(kinds.filter((k) => k === 'sandbox-report')).toHaveLength(1);
		expect(t.events.at(-1)).toEqual({
			kind: 'sandbox-error',
			message: 'script worker crashed: boom'
		});
		expect(JSON.stringify(t.events)).not.toContain('secret');
		t.done();
	});

	it('reports a worker that cannot be created', () => {
		const t = setup();
		const env2 = {
			origin: 'null',
			parent: t.parent,
			postToParent: (e: SandboxEvent) => void t.events.push(e),
			createWorker: () => {
				throw new Error('CSP says no');
			},
			probeScope: {}
		};
		createSandboxFrame(env2).handle({ data: t.init(), source: t.parent });
		expect(t.events.at(-1)).toEqual({
			kind: 'sandbox-error',
			message: expect.stringContaining('CSP says no')
		});
		t.done();
	});

	it('parseSandboxInit rejects malformed messages', () => {
		expect(parseSandboxInit(null)).toBeNull();
		expect(parseSandboxInit({ kind: 'sandbox-init' })).toBeNull();
		expect(parseSandboxInit({ kind: 'other' })).toBeNull();
		const { port1, port2 } = new MessageChannel();
		const base = { kind: 'sandbox-init', workerSource: 'x', wasm: new ArrayBuffer(1), port: port1 };
		expect(parseSandboxInit({ ...base, probeUrl: 1 })).toBeNull();
		expect(parseSandboxInit({ ...base, probeUrl: 'u' })).not.toBeNull();
		port1.close();
		port2.close();
	});
});
