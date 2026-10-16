import { describe, expect, it } from 'vitest';
import {
	createScriptSandbox,
	SANDBOX_ATTRIBUTE,
	type SandboxFrameHandle,
	type SandboxStatus
} from './script-sandbox';
import type { SandboxInit } from './script-sandbox-frame';
import type { ContainmentReport } from './script-sandbox-probe';

const report = (
	context: 'frame' | 'worker',
	reach: 'blocked' | 'reachable'
): ContainmentReport => ({
	context,
	origin: 'null',
	opaque: true,
	probes: { fetch: reach, indexedDB: 'blocked' },
	target: 'u',
	violations: 0
});

/** An iframe double: what the page posts, and the events the frame would send back. */
function fakeFrame() {
	const posted: Array<{ message: SandboxInit; transfer: Transferable[] }> = [];
	let listener: ((data: unknown) => void) | null = null;
	let removed = false;
	let load!: () => void;
	let failLoad!: (e: Error) => void;
	const loaded = new Promise<void>((resolve, reject) => {
		load = resolve;
		failLoad = reject;
	});
	const handle: SandboxFrameHandle = {
		loaded,
		post: (message, transfer) => void posted.push({ message, transfer }),
		onEvent: (l) => void (listener = l),
		remove: () => void (removed = true)
	};
	return {
		handle,
		posted,
		load,
		failLoad,
		emit: (data: unknown) => listener?.(data),
		removed: () => removed
	};
}

function setup(startTimeoutMs = 1000) {
	const frames: ReturnType<typeof fakeFrame>[] = [];
	let assetLoads = 0;
	const sandbox = createScriptSandbox({
		createFrame: (document) => {
			const frame = fakeFrame();
			frames.push(Object.assign(frame, { document }));
			return frame.handle;
		},
		loadAssets: async () => {
			assetLoads += 1;
			return { workerSource: 'worker()', wasm: new ArrayBuffer(16), document: '<html></html>' };
		},
		probeUrl: 'https://game.example/robots.txt',
		startTimeoutMs
	});
	const seen: SandboxStatus[] = [];
	sandbox.onStatus((s) => void seen.push(s));
	return { sandbox, frames, seen, assetLoads: () => assetLoads };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('script sandbox (page side)', () => {
	it('uses an iframe sandbox attribute that never grants the game origin', () => {
		expect(SANDBOX_ATTRIBUTE).toBe('allow-scripts');
		expect(SANDBOX_ATTRIBUTE).not.toContain('same-origin');
	});

	it('opens a frame, sends it the Worker text, a copy of the wasm and a port, and returns the other port', async () => {
		const t = setup();
		const opening = t.sandbox.open();
		await tick();
		const frame = t.frames[0]!;
		frame.load();
		await tick();
		const { message, transfer } = frame.posted[0]!;
		// Field by field: a MessagePort inside an object makes the deep matchers recurse.
		expect(message.kind).toBe('sandbox-init');
		expect(message.workerSource).toBe('worker()');
		expect(message.probeUrl).toBe('https://game.example/robots.txt');
		expect(message.wasm.byteLength).toBe(16);
		expect(transfer.includes(message.port)).toBe(true);
		expect(transfer.includes(message.wasm)).toBe(true);
		frame.emit({ kind: 'sandbox-started' });
		const port = await opening;
		expect(typeof port.postMessage).toBe('function');
		// The channel really connects the two ends.
		const heard = new Promise((resolve) => (message.port.onmessage = (e) => resolve(e.data)));
		port.postMessage({ hello: 1 });
		expect(await heard).toEqual({ hello: 1 });
		port.close();
		message.port.close();
		expect(t.sandbox.status.state).toBe('started');
	});

	it('each Run gets a fresh iframe and the previous one is removed; assets load once', async () => {
		const t = setup();
		for (let i = 0; i < 2; i++) {
			const opening = t.sandbox.open();
			await tick();
			t.frames[i]!.load();
			await tick();
			t.frames[i]!.emit({ kind: 'sandbox-started' });
			(await opening).close();
			t.frames[i]!.posted[0]!.message.port.close();
		}
		expect(t.frames).toHaveLength(2);
		expect(t.frames[0]!.removed()).toBe(true);
		expect(t.frames[1]!.removed()).toBe(false);
		expect(t.assetLoads()).toBe(1);
	});

	it('close() removes the frame, which is what kills a stuck Worker', async () => {
		const t = setup();
		const opening = t.sandbox.open();
		await tick();
		t.frames[0]!.load();
		await tick();
		t.frames[0]!.emit({ kind: 'sandbox-started' });
		(await opening).close();
		t.frames[0]!.posted[0]!.message.port.close();
		t.sandbox.close();
		t.sandbox.close();
		expect(t.frames[0]!.removed()).toBe(true);
		expect(t.sandbox.status.state).toBe('none');
	});

	it('reports a frame that does not answer, and removes it', async () => {
		const t = setup(20);
		const opening = t.sandbox.open();
		await tick();
		t.frames[0]!.load();
		await expect(opening).rejects.toThrow('did not start');
		expect(t.frames[0]!.removed()).toBe(true);
		expect(t.sandbox.status).toMatchObject({
			state: 'failed',
			error: 'the script sandbox did not start'
		});
		t.frames[0]!.posted[0]!.message.port.close();
	});

	it('reports an error from the frame (for example when it is not sandboxed)', async () => {
		const t = setup();
		const opening = t.sandbox.open();
		await tick();
		t.frames[0]!.load();
		await tick();
		t.frames[0]!.emit({ kind: 'sandbox-error', message: 'the sandbox frame has the game origin' });
		await expect(opening).rejects.toThrow('game origin');
		expect(t.sandbox.status.state).toBe('failed');
		expect(t.frames[0]!.removed()).toBe(true);
		t.frames[0]!.posted[0]!.message.port.close();
	});

	it('reports a frame that fails to load, and a failed asset load can be retried', async () => {
		let attempts = 0;
		const frames: ReturnType<typeof fakeFrame>[] = [];
		const sandbox = createScriptSandbox({
			createFrame: () => {
				const f = fakeFrame();
				frames.push(f);
				return f.handle;
			},
			loadAssets: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error('worker bundle: HTTP 404 (run the web build)');
				return { workerSource: 'w', wasm: new ArrayBuffer(1), document: 'd' };
			},
			probeUrl: 'u'
		});
		await expect(sandbox.open()).rejects.toThrow('HTTP 404');
		expect(sandbox.status).toMatchObject({ state: 'failed' });
		const second = sandbox.open();
		await tick();
		frames[0]!.failLoad(new Error('the sandbox page failed to load'));
		await expect(second).rejects.toThrow('failed to load');
		expect(attempts).toBe(2);
	});

	it('is contained only when both contexts reported and everything is blocked', async () => {
		const t = setup();
		const opening = t.sandbox.open();
		await tick();
		const frame = t.frames[0]!;
		frame.load();
		await tick();
		frame.emit({ kind: 'sandbox-started' });
		(await opening).close();
		frame.posted[0]!.message.port.close();
		expect(t.sandbox.status.contained).toBe(false);
		frame.emit({ kind: 'sandbox-report', report: report('frame', 'blocked') });
		expect(t.sandbox.status.contained).toBe(false);
		frame.emit({ kind: 'sandbox-report', report: report('worker', 'blocked') });
		expect(t.sandbox.status.contained).toBe(true);
		frame.emit({ kind: 'sandbox-report', report: report('worker', 'reachable') });
		expect(t.sandbox.status.contained).toBe(false);
		expect(t.sandbox.status.reports).toHaveLength(2);
	});

	it('ignores malformed events from the frame', async () => {
		const t = setup();
		const opening = t.sandbox.open();
		await tick();
		const frame = t.frames[0]!;
		frame.load();
		await tick();
		frame.emit('nonsense');
		frame.emit({ kind: 'sandbox-report', report: { context: 'x' } });
		frame.emit({ kind: 'sandbox-started' });
		(await opening).close();
		frame.posted[0]!.message.port.close();
		expect(t.sandbox.status.reports).toEqual([]);
	});
});
