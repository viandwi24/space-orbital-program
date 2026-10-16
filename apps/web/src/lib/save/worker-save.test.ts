/** Plan 043: the Worker's init/save messages and the client's `save()` round trip. */
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import {
	parseClientMessage,
	parseWorkerMessage,
	type ClientMessage,
	type WorkerMessage
} from '../messages';
import { createSimClient, type WorkerLike } from '../sim-client';
import { createSaveRouter } from './worker-save';

describe('message parsing', () => {
	it('init (with or without a save) and save requests parse; junk does not', () => {
		expect(parseClientMessage({ kind: 'init' })).toEqual({ kind: 'init' });
		expect(parseClientMessage({ kind: 'init', save: { a: 1 } })).toEqual({
			kind: 'init',
			save: { a: 1 }
		});
		expect(parseClientMessage({ kind: 'save', id: 3 })).toEqual({ kind: 'save', id: 3 });
		expect(parseClientMessage({ kind: 'save' })).toBeNull();
		expect(parseWorkerMessage({ kind: 'saved', id: 1, save: {} })).not.toBeNull();
		expect(parseWorkerMessage({ kind: 'saved', id: 1 })).toBeNull();
		expect(parseWorkerMessage({ kind: 'save-error', id: 1, message: 'x' })).not.toBeNull();
		expect(parseWorkerMessage({ kind: 'save-error', id: 1 })).toBeNull();
	});
});

describe('save router', () => {
	const make = (sim: { save(): never } | undefined) => {
		const posted: WorkerMessage[] = [];
		const boots: unknown[] = [];
		const router = createSaveRouter({
			sim: () => sim,
			post: (m) => void posted.push(m),
			boot: (save) => void boots.push(save)
		});
		return { router, posted, boots };
	};

	it('boots the host once, with the save of the first init', () => {
		const { router, boots } = make(undefined);
		expect(router.handle({ kind: 'init', save: { s: 1 } })).toBe(true);
		expect(router.handle({ kind: 'init', save: { s: 2 } })).toBe(true);
		expect(boots).toEqual([{ s: 1 }]);
	});

	it('leaves other messages to the host', () => {
		const { router } = make(undefined);
		expect(router.handle({ kind: 'command', id: 1, command: {} })).toBe(false);
		expect(router.handle('junk')).toBe(false);
	});

	it('answers save with the sim data, or an error before the sim exists or when it throws', () => {
		const ok = make({ save: () => ({ time: 1 }) as never });
		ok.router.handle({ kind: 'save', id: 7 });
		expect(ok.posted).toEqual([{ kind: 'saved', id: 7, save: { time: 1 } }]);
		const early = make(undefined);
		early.router.handle({ kind: 'save', id: 8 });
		expect(early.posted[0]).toMatchObject({ kind: 'save-error', id: 8 });
		const broken = make({
			save: () => {
				throw new Error('boom');
			}
		});
		broken.router.handle({ kind: 'save', id: 9 });
		expect(broken.posted).toEqual([{ kind: 'save-error', id: 9, message: 'boom' }]);
	});
});

describe('client save()', () => {
	function fakeWorker() {
		const sent: ClientMessage[] = [];
		const worker: WorkerLike = {
			postMessage: (m) => void sent.push(m),
			onmessage: null,
			onerror: null,
			terminate: () => {}
		};
		return { worker, sent, emit: (data: unknown) => worker.onmessage?.({ data }) };
	}

	it('resolves with the worker data and rejects with its reason', async () => {
		const { worker, sent, emit } = fakeWorker();
		const client = createSimClient(worker);
		const good = client.save();
		const id = (sent.at(-1) as { id: number }).id;
		emit({ kind: 'saved', id, save: { time: 5 } });
		await expect(good).resolves.toEqual({ time: 5 });
		const bad = client.save();
		emit({ kind: 'save-error', id: (sent.at(-1) as { id: number }).id, message: 'no sim' });
		await expect(bad).rejects.toThrow('no sim');
	});

	it('rejects pending saves when the worker dies or the client is disposed', async () => {
		const a = fakeWorker();
		const client = createSimClient(a.worker);
		const pending = client.save();
		a.worker.onerror?.({ message: 'crashed' });
		await expect(pending).rejects.toThrow('crashed');
		const b = fakeWorker();
		const second = createSimClient(b.worker);
		const waiting = second.save();
		second.dispose();
		await expect(waiting).rejects.toThrow(/disposed/);
		await expect(second.save()).rejects.toThrow(/disposed/);
	});
});

describe('through a real sim', () => {
	it('a save taken by the router resumes in a second sim that continues identically', async () => {
		const options = {
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			maxFlightFrames: 1
		};
		const sim = await createSim(options);
		sim.dispatch({ type: 'load-vessel', design: referenceTwoStage() });
		for (let i = 0; i < 100; i++) sim.step(0.02);
		const posted: WorkerMessage[] = [];
		const router = createSaveRouter({
			sim: () => sim,
			post: (m) => void posted.push(m),
			boot: () => {}
		});
		router.handle({ kind: 'save', id: 1 });
		// The page gets the message by structured clone; JSON stands in for it here.
		const message = JSON.parse(JSON.stringify(posted[0])) as { save: unknown };
		const resumed = await createSim({ ...options, resume: message.save });
		for (let i = 0; i < 50; i++) {
			sim.step(0.02);
			resumed.step(0.02);
		}
		expect(JSON.stringify(resumed.snapshot().vessels[0]!.position)).toBe(
			JSON.stringify(sim.snapshot().vessels[0]!.position)
		);
	});
});
