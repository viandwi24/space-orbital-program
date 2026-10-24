/**
 * Runs the body bakes (plan 403): in a worker where there is one, else in slices on the page's own
 * thread (a test, a host with no workers). One bake at a time, as the manager asks.
 */
import { bakeField, bakeRows, type BakeSize } from './body-bake.ts';
import type { BakeMessage, BakeReply, BakeRequest } from './body-bake.worker.ts';

export type BakeJob = Omit<BakeRequest, 'type'>;

export interface Baker {
	/** The map's RGBA8 bytes, or null when the job was cancelled. */
	bake(job: BakeJob): Promise<Uint8Array | null>;
	cancel(id: string): void;
	dispose(): void;
}

/** Slices on this thread: `rows` rows, then a turn for the page. */
export function inlineBaker(rows = 4): Baker {
	const stopped = new Set<string>();
	return {
		async bake(job) {
			const { width, height } = job.size;
			const field = bakeField(job.body);
			const out = new Uint8Array(width * height * 4);
			for (let j = 0; j < height; j += rows) {
				if (stopped.delete(job.id)) return null;
				bakeRows(job.look, job.seed, field, job.size, out, j, j + rows);
				if ((j / rows) % 8 === 7) await new Promise((r) => setTimeout(r, 0));
			}
			return out;
		},
		cancel: (id) => void stopped.add(id),
		dispose: () => stopped.clear()
	};
}

/** The worker, or the inline baker where `Worker` is missing or refuses to start. */
export function createBaker(): Baker {
	if (typeof Worker === 'undefined') return inlineBaker();
	let worker: Worker;
	try {
		worker = new Worker(new URL('./body-bake.worker.ts', import.meta.url), { type: 'module' });
	} catch {
		return inlineBaker();
	}
	const waiting = new Map<string, (bytes: Uint8Array | null) => void>();
	worker.onmessage = (e: MessageEvent<BakeReply>) => {
		const m = e.data;
		const done = waiting.get(m.id);
		waiting.delete(m.id);
		done?.(m.type === 'done' ? m.bytes : null);
	};
	worker.onerror = () => {
		for (const done of waiting.values()) done(null);
		waiting.clear();
	};
	const send = (m: BakeMessage): void => worker.postMessage(m);
	return {
		bake: (job) =>
			new Promise((resolve) => {
				waiting.set(job.id, resolve);
				send({ type: 'bake', ...job });
			}),
		cancel: (id) => send({ type: 'cancel', id }),
		dispose: () => {
			worker.terminate();
			for (const done of waiting.values()) done(null);
			waiting.clear();
		}
	};
}

export type { BakeSize };
