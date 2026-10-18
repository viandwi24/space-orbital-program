/**
 * The page's side of the planning Worker (plan 118, ADR 0163 point 1): started on first use,
 * answers cached by request (its kind, the snapshot time and the inputs are all in it).
 */
import type { PlanMessage, PlanReply, PlanRequest, PlanResults } from './protocol';

/** Answers kept, oldest dropped first. */
export const PLAN_CACHE = 32;

export interface PlanWorkerLike {
	postMessage(message: PlanMessage): void;
	onmessage: ((e: MessageEvent<PlanReply>) => void) | null;
	terminate(): void;
}

export interface Planner {
	plan<K extends PlanRequest['kind']>(
		request: Extract<PlanRequest, { kind: K }>
	): Promise<PlanResults[K]>;
	dispose(): void;
}

const startWorker = (): PlanWorkerLike =>
	new Worker(new URL('./planning.worker.ts', import.meta.url), {
		type: 'module'
	}) as unknown as PlanWorkerLike;

export function createPlanner(start: () => PlanWorkerLike = startWorker): Planner {
	let worker: PlanWorkerLike | null = null;
	let next = 1;
	const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
	const cache = new Map<string, Promise<unknown>>();
	const ensure = (): PlanWorkerLike => {
		if (worker) return worker;
		worker = start();
		worker.onmessage = (e) => {
			const reply = e.data;
			const p = pending.get(reply.id);
			if (!p) return;
			pending.delete(reply.id);
			if (reply.ok) p.resolve(reply.result);
			else p.reject(new Error(reply.error));
		};
		return worker;
	};
	return {
		plan(request) {
			const key = JSON.stringify(request);
			const hit = cache.get(key);
			if (hit) return hit as never;
			const id = next++;
			const answer = new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				ensure().postMessage({ id, request });
			});
			// a failed answer is not kept: the next ask tries again
			answer.catch(() => cache.delete(key));
			cache.set(key, answer);
			while (cache.size > PLAN_CACHE) cache.delete(cache.keys().next().value!);
			return answer as never;
		},
		dispose() {
			worker?.terminate();
			worker = null;
			for (const p of pending.values()) p.reject(new Error('planner disposed'));
			pending.clear();
			cache.clear();
		}
	};
}
