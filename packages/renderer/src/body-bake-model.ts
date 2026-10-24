/**
 * What the scaled-space bakes of other bodies cost and how many stay (plan 403, ADR 0361): the map
 * size and the memory budget by preset, and the manager that decides which body is baked next and
 * which is dropped. Pure: it holds no textures and starts no work; the host tells it where the
 * bodies are, asks what to start and tells it what finished.
 */
import type { GraphicsPreset } from './presets.ts';
import type { BakeSize } from './body-bake.ts';

/**
 * The bake's map by preset: Low keeps the 512 x 256 palette (no terrain bake), Medium 1024 x 512,
 * High 2048 x 1024. The budget is the memory the resident bakes may hold, bytes, mips included
 * (the integrated GPUs share system memory, so Low and Medium are small).
 */
export const BODY_BAKE: Readonly<
	Record<GraphicsPreset, { size: BakeSize | null; budgetBytes: number }>
> = {
	low: { size: null, budgetBytes: 0 },
	medium: { size: { width: 1024, height: 512 }, budgetBytes: 24 * 1_048_576 },
	high: { size: { width: 2048, height: 1024 }, budgetBytes: 96 * 1_048_576 }
};

/** GPU bytes of an RGBA8 map with its mip chain. */
export const bakeBytes = (size: BakeSize): number =>
	Math.round(size.width * size.height * 4 * (4 / 3));

/** A body is baked when its radius on screen is over this many pixels (it is nearer than awake: `DRESS_NEAR_PX`). */
export const BAKE_NEAR_PX = 60;
/** A resident bake is let go once its body is under this many pixels (it is far) and the budget needs the room. */
export const BAKE_FAR_PX = 20;

export type BakeState = 'queued' | 'baking' | 'ready';

interface Entry {
	state: BakeState;
	/** The body's distance, or its pixel size reversed: nearer is smaller. */
	distance: number;
	bytes: number;
}

/**
 * The bake and evict policy. `update` is told, each frame or so, which bodies want a bake and how
 * far each is; `next` says which to start (nearest first, one at a time) or none when the budget
 * cannot take it without dropping a body still wanted; `done` and `fail` end a job; `evictions` lists the
 * ready bakes to drop to fit the budget, farthest first. A ready bake that is still wanted is never
 * baked again.
 */
export class BodyBakeManager {
	private readonly entries = new Map<string, Entry>();

	constructor(
		private readonly budgetBytes: number,
		private readonly bytesOf: (id: string) => number
	) {}

	/** The bodies that want a bake now, nearest first by `distance`; others leave the queue. */
	update(wanted: ReadonlyMap<string, number>): void {
		for (const [id, distance] of wanted) {
			const e = this.entries.get(id);
			if (e) e.distance = distance;
			else this.entries.set(id, { state: 'queued', distance, bytes: this.bytesOf(id) });
		}
		for (const [id, e] of [...this.entries]) {
			if (wanted.has(id)) continue;
			// not wanted: a queued job is dropped; a ready bake stays until the room is needed
			if (e.state === 'queued') this.entries.delete(id);
			else if (e.state === 'ready') e.distance = Infinity;
		}
	}

	get used(): number {
		let sum = 0;
		for (const e of this.entries.values()) if (e.state !== 'queued') sum += e.bytes;
		return sum;
	}

	private get busy(): boolean {
		for (const e of this.entries.values()) if (e.state === 'baking') return true;
		return false;
	}

	/** The ready bakes to drop for the budget, farthest first (and any the wanted set no longer holds, when over). */
	evictions(): string[] {
		const out: string[] = [];
		let used = this.used;
		const ready = [...this.entries].filter(([, e]) => e.state === 'ready');
		ready.sort((a, b) => b[1].distance - a[1].distance || (a[0] < b[0] ? -1 : 1));
		for (const [id, e] of ready) {
			if (used <= this.budgetBytes) break;
			out.push(id);
			used -= e.bytes;
		}
		return out;
	}

	/** Drops a ready bake; the host frees its texture. */
	evict(id: string): void {
		const e = this.entries.get(id);
		if (e?.state === 'ready') this.entries.delete(id);
	}

	/**
	 * The body to start baking now, with the ready bakes nobody wants dropped to make room (farthest
	 * first; a wanted bake is never dropped for another), or undefined: nothing queued, a job already running, or the budget
	 * cannot take the nearest queued one even after dropping every unwanted ready bake. The
	 * dropped bakes are gone from the manager's books at once, so `used` never passes the budget,
	 * the new job's bytes counted from the start; the host frees their textures.
	 */
	next(): { id: string; evict: string[] } | undefined {
		if (this.busy) return undefined;
		let best: [string, Entry] | undefined;
		for (const item of this.entries) {
			if (item[1].state !== 'queued') continue;
			if (
				!best ||
				item[1].distance < best[1].distance ||
				(item[1].distance === best[1].distance && item[0] < best[0])
			)
				best = item;
		}
		if (!best) return undefined;
		const [id, e] = best;
		// only a bake nobody wants may go for room: a body still in view is never dropped for another, or
		// two near bodies over a small budget would take turns baking and dropping (a stutter)
		const farther = [...this.entries]
			.filter(([, o]) => o.state === 'ready' && o.distance === Infinity)
			.sort((a, b) => b[1].distance - a[1].distance || (a[0] < b[0] ? -1 : 1));
		let used = this.used;
		const evict: string[] = [];
		for (const [other, o] of farther) {
			if (used + e.bytes <= this.budgetBytes) break;
			evict.push(other);
			used -= o.bytes;
		}
		if (used + e.bytes > this.budgetBytes) return undefined;
		for (const other of evict) this.entries.delete(other);
		e.state = 'baking';
		return { id, evict };
	}

	/** The running job finished: its bake is resident now (the farther ready ones go when over budget). */
	done(id: string): void {
		const e = this.entries.get(id);
		if (e) e.state = 'ready';
	}

	/** The running job failed or was cancelled: it leaves, and may be asked for again. */
	fail(id: string): void {
		this.entries.delete(id);
	}

	state(id: string): BakeState | undefined {
		return this.entries.get(id)?.state;
	}

	/** The resident bakes. */
	ready(): string[] {
		return [...this.entries]
			.filter(([, e]) => e.state === 'ready')
			.map(([id]) => id)
			.sort();
	}
}
