import { describe, expect, it } from 'vitest';
import type { ClientMessage } from './messages';
import { createSimClient, type WorkerLike } from './sim-client';

function fakeWorker() {
	const sent: ClientMessage[] = [];
	let terminated = false;
	const worker: WorkerLike = {
		postMessage: (m) => void sent.push(m),
		onmessage: null,
		onerror: null,
		terminate: () => void (terminated = true)
	};
	const emit = (data: unknown) => worker.onmessage?.({ data });
	return { worker, sent, emit, terminated: () => terminated };
}

const catalog = { plugins: ['stock'], parts: [], bodies: [], resources: [] };
const snapshot = { t: 1, vessels: [], bodies: [] };

describe('sim-client', () => {
	it('resolves ready with the catalog when the worker reports ready', async () => {
		const { worker, emit } = fakeWorker();
		const client = createSimClient(worker);
		emit({ kind: 'ready', ...catalog });
		expect(await client.ready).toEqual(catalog);
	});

	it('correlates command results by id, out of order', async () => {
		const { worker, sent, emit } = fakeWorker();
		const client = createSimClient(worker);
		const a = client.dispatch({ type: 'stage' });
		const b = client.dispatch({ type: 'warp', factor: 5 });
		expect(sent.map((m) => (m.kind === 'command' ? m.id : -1))).toEqual([1, 2]);
		emit({ kind: 'result', id: 2, result: { ok: false, reason: 'no' } });
		emit({ kind: 'result', id: 1, result: { ok: true } });
		expect(await a).toEqual({ ok: true });
		expect(await b).toEqual({ ok: false, reason: 'no' });
	});

	it('keeps the latest snapshot and fans it out until unsubscribed', () => {
		const { worker, emit } = fakeWorker();
		const client = createSimClient(worker);
		const seen: number[] = [];
		const off = client.onSnapshot((s) => seen.push(s.t));
		emit({ kind: 'snapshot', snapshot });
		off();
		emit({ kind: 'snapshot', snapshot: { ...snapshot, t: 2 } });
		expect(seen).toEqual([1]);
		expect(client.latest?.t).toBe(2);
	});

	it('rejects ready and refuses pending commands when the worker reports an error', async () => {
		const { worker, emit } = fakeWorker();
		const client = createSimClient(worker);
		const errors: string[] = [];
		client.onError((m) => errors.push(m));
		const pending = client.dispatch({ type: 'stage' });
		emit({ kind: 'error', message: 'boom' });
		await expect(client.ready).rejects.toThrow('boom');
		expect(await pending).toEqual({ ok: false, reason: 'boom' });
		expect(errors).toEqual(['boom']);
	});

	it('treats malformed worker messages as errors', () => {
		const { worker, emit } = fakeWorker();
		const client = createSimClient(worker);
		const errors: string[] = [];
		client.onError((m) => errors.push(m));
		emit({ kind: 'snapshot' });
		emit('garbage');
		expect(errors).toHaveLength(2);
	});

	it('dispose tells the worker, terminates it and refuses later commands', async () => {
		const { worker, sent, emit, terminated } = fakeWorker();
		const client = createSimClient(worker);
		const pending = client.dispatch({ type: 'stage' });
		client.dispose();
		expect(sent.at(-1)).toEqual({ kind: 'dispose' });
		expect(terminated()).toBe(true);
		expect((await pending).ok).toBe(false);
		expect((await client.dispatch({ type: 'stage' })).ok).toBe(false);
		emit({ kind: 'result', id: 1, result: { ok: true } }); // late message: ignored
	});

	it('sends script-start/stop and fans out script events until unsubscribed', () => {
		const { worker, sent, emit } = fakeWorker();
		const client = createSimClient(worker);
		const seen: string[] = [];
		const off = client.onScript((e) => seen.push(e.kind));
		client.startScript('print(1)', 4);
		client.stopScript();
		expect(sent).toEqual([
			{ kind: 'script-start', source: 'print(1)', vessel: 4 },
			{ kind: 'script-stop' }
		]);
		emit({ kind: 'script-status', status: 'running', lastMs: 0, maxMs: 0 });
		emit({ kind: 'script-log', lines: ['x'] });
		off();
		emit({ kind: 'script-log', lines: ['y'] });
		expect(seen).toEqual(['script-status', 'script-log']);
	});
});
