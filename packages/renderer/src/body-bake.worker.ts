/**
 * The worker that bakes a body's scaled-space map (plan 403): the page asks with a body, its look
 * and a size, and gets the RGBA8 bytes back (transferred). It bakes in slices and listens between
 * them, so a body that is far again can be cancelled.
 */
import { bakeField, bakeRows, type BakeSize } from './body-bake.ts';
import type { BodyAppearance, BodyDefinition } from '@orbital/core';

export interface BakeRequest {
	type: 'bake';
	id: string;
	body: Pick<BodyDefinition, 'id' | 'radius' | 'terrain'>;
	look: BodyAppearance;
	seed: number;
	size: BakeSize;
}
export type BakeMessage = BakeRequest | { type: 'cancel'; id: string };
export type BakeReply =
	{ type: 'done'; id: string; bytes: Uint8Array } | { type: 'cancelled'; id: string };

const scope = self as unknown as {
	onmessage: ((e: MessageEvent<BakeMessage>) => void) | null;
	postMessage(message: BakeReply, transfer?: Transferable[]): void;
};

const cancelled = new Set<string>();
const queue: BakeRequest[] = [];
let running = false;
/** Rows between two looks at the inbox. */
const SLICE = 8;
const yieldToInbox = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function bake(job: BakeRequest): Promise<void> {
	const { width, height } = job.size;
	const field = bakeField(job.body);
	const out = new Uint8Array(width * height * 4);
	for (let j = 0; j < height; j += SLICE) {
		if (cancelled.has(job.id)) {
			cancelled.delete(job.id);
			scope.postMessage({ type: 'cancelled', id: job.id });
			return;
		}
		bakeRows(job.look, job.seed, field, job.size, out, j, j + SLICE);
		if ((j / SLICE) % 16 === 15) await yieldToInbox();
	}
	scope.postMessage({ type: 'done', id: job.id, bytes: out }, [out.buffer]);
}

async function drain(): Promise<void> {
	if (running) return;
	running = true;
	for (let job = queue.shift(); job; job = queue.shift()) await bake(job);
	running = false;
}

scope.onmessage = (e) => {
	const m = e.data;
	if (m.type === 'cancel') {
		const at = queue.findIndex((q) => q.id === m.id);
		if (at >= 0) {
			queue.splice(at, 1);
			scope.postMessage({ type: 'cancelled', id: m.id });
		} else cancelled.add(m.id);
		return;
	}
	queue.push(m);
	void drain();
};
