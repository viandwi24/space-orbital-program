/**
 * The bakes of other bodies in flight (plan 403, ADR 0361): which bodies near the camera get their
 * scaled-space map baked from their own surface, in what order, within what memory, and what is
 * dropped when the camera leaves. The policy is `BodyBakeManager`; this runs it against a baker
 * (a worker), a store (IndexedDB) and the scene's callbacks. A map found in the store is used at
 * once and nothing is baked.
 */
import type { BodyAppearance, BodyDefinition } from '@orbital/core';
import type { BakeSize } from './body-bake.ts';
import { bakeKey, packBake, unpackBake, type BakeStore } from './body-bake-cache.ts';
import { BAKE_FAR_PX, BAKE_NEAR_PX, BodyBakeManager, bakeBytes } from './body-bake-model.ts';
import { lookSeed } from './body-look.ts';
import type { Baker } from './body-baker.ts';

export interface BakeTarget {
	id: string;
	body: Pick<BodyDefinition, 'id' | 'radius' | 'terrain'>;
	look: BodyAppearance;
	/** The body's radius on screen, pixels. */
	px: number;
}

export interface BodyBakesOptions {
	baker: Baker;
	store?: BakeStore | undefined;
	/** The map size and the memory budget (`BODY_BAKE` of the preset); a null size bakes nothing. */
	size: BakeSize | null;
	budgetBytes: number;
	onReady(id: string, bytes: Uint8Array, size: BakeSize, from: 'baked' | 'cache'): void;
	onEvict(id: string): void;
}

export class BodyBakes {
	private manager: BodyBakeManager;
	private size: BakeSize | null;
	private running: string | null = null;
	private targets = new Map<string, BakeTarget>();
	private generation = 0;
	private disposed = false;
	/** The player is flying: no job starts and no finished map is taken until it stops (the owner's rule). */
	private held = false;
	private waiting: {
		id: string;
		bytes: Uint8Array;
		size: BakeSize;
		from: 'baked' | 'cache';
	} | null = null;

	constructor(private readonly options: BodyBakesOptions) {
		this.size = options.size;
		this.manager = this.make(options.size, options.budgetBytes);
	}

	private make(size: BakeSize | null, budget: number): BodyBakeManager {
		return new BodyBakeManager(budget, () => (size ? bakeBytes(size) : 0));
	}

	/** A change of preset: everything resident goes, what is wanted is baked again at the new size. */
	setPreset(size: BakeSize | null, budgetBytes: number): void {
		for (const id of this.manager.ready()) this.options.onEvict(id);
		if (this.running) this.options.baker.cancel(this.running);
		this.generation++;
		this.waiting = null;
		this.running = null;
		this.size = size;
		this.manager = this.make(size, budgetBytes);
	}

	/** Once a frame: the bodies and how big each is on screen. */
	frame(targets: readonly BakeTarget[], held = false): void {
		if (this.disposed || !this.size) return;
		this.held = held;
		if (!held && this.waiting) this.deliver(this.waiting);
		this.targets = new Map(targets.map((t) => [t.id, t]));
		// nearer is more pixels: the manager orders by a distance that grows with remoteness
		// a body is wanted from `BAKE_NEAR_PX` of radius and stays wanted until it is under `BAKE_FAR_PX`: the gap is
		// the hysteresis that keeps a body at the edge from being dropped and baked again
		const wanted = new Map<string, number>();
		for (const t of targets) {
			const was = this.manager.state(t.id) !== undefined;
			if (t.px >= (was ? BAKE_FAR_PX : BAKE_NEAR_PX)) wanted.set(t.id, 1 / t.px);
		}
		this.manager.update(wanted);
		if (this.running && !wanted.has(this.running)) this.options.baker.cancel(this.running);
		for (const id of this.manager.evictions()) {
			this.manager.evict(id);
			this.options.onEvict(id);
		}
		if (held) return;
		const job = this.manager.next();
		if (!job) return;
		for (const id of job.evict) this.options.onEvict(id);
		void this.run(job.id);
	}

	/** The resident bakes, by id. */
	ready(): string[] {
		return this.manager.ready();
	}

	private async run(id: string): Promise<void> {
		const target = this.targets.get(id);
		const size = this.size;
		if (!target || !size) {
			this.manager.fail(id);
			return;
		}
		const generation = this.generation;
		this.running = id;
		const { store } = this.options;
		const key = bakeKey(target.body, target.look, size);
		let bytes: Uint8Array | null | undefined;
		let from: 'baked' | 'cache' = 'cache';
		try {
			const stored = store ? await store.get(key) : undefined;
			bytes = stored ? await unpackBake(stored, size.width * size.height * 4) : undefined;
			if (!bytes) {
				from = 'baked';
				bytes = await this.options.baker.bake({
					id,
					body: target.body,
					look: target.look,
					seed: lookSeed(id),
					size
				});
				if (bytes && store) void packBake(bytes).then((packed) => store.put(key, packed));
			}
		} catch {
			bytes = null;
		}
		if (generation !== this.generation || this.disposed) return;
		if (!bytes) {
			this.running = null;
			this.manager.fail(id);
			return;
		}
		if (this.held) this.waiting = { id, bytes, size, from };
		else this.deliver({ id, bytes, size, from });
	}

	private deliver(r: {
		id: string;
		bytes: Uint8Array;
		size: BakeSize;
		from: 'baked' | 'cache';
	}): void {
		this.waiting = null;
		this.running = null;
		this.manager.done(r.id);
		this.options.onReady(r.id, r.bytes, r.size, r.from);
	}

	dispose(): void {
		this.disposed = true;
		if (this.running) this.options.baker.cancel(this.running);
		this.options.baker.dispose();
	}
}
