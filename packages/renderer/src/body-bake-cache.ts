/**
 * The cache of finished body bakes (plan 403, ADR 0361): a revisit loads the map instead of baking it
 * again. The bytes are the RGBA8 map, gzipped (`CompressionStream`), in IndexedDB under a key that
 * names everything the map depends on (the body's terrain and radius, its look, the size, the bake's
 * version), so a change of any of them is a new key. KTX2 would be smaller on the GPU, but the
 * Basis encoder is not shipped (only the transcoder, ADR 0160): the cache keeps raw bytes (ADR 0361).
 */
import type { BodyAppearance, BodyDefinition } from '@orbital/core';
import { lookSeed } from './body-look.ts';
import type { BakeSize } from './body-bake.ts';

/** Bump when the bake's formula changes: every cached map is then another key. */
export const BAKE_VERSION = 1;

/** Where finished maps are kept: a host gives IndexedDB, a test a map. */
export interface BakeStore {
	get(key: string): Promise<Uint8Array | undefined>;
	put(key: string, bytes: Uint8Array): Promise<void>;
}

/** FNV-1a of a string as 8 hex digits. */
function hash(text: string): string {
	let a = 2166136261;
	for (let i = 0; i < text.length; i++) {
		a ^= text.charCodeAt(i);
		a = Math.imul(a, 16777619) >>> 0;
	}
	return a.toString(16).padStart(8, '0');
}

/** The key of a body's map: its id, then a hash of what the map is made from. */
export function bakeKey(
	body: Pick<BodyDefinition, 'id' | 'radius' | 'terrain'>,
	look: BodyAppearance,
	size: BakeSize
): string {
	const about = JSON.stringify([body.radius, body.terrain ?? null, look, size, BAKE_VERSION]);
	return `${body.id}:${lookSeed(body.id).toString(16)}:${size.width}x${size.height}:${hash(about)}`;
}

/** A finished map as stored. */
export async function packBake(bytes: Uint8Array): Promise<Uint8Array> {
	if (typeof CompressionStream === 'undefined') return bytes;
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A stored map back as RGBA8 bytes of `length`, or undefined when it does not fit (a damaged entry). */
export async function unpackBake(
	stored: Uint8Array,
	length: number
): Promise<Uint8Array | undefined> {
	const gz = stored.length >= 2 && stored[0] === 0x1f && stored[1] === 0x8b;
	let out = stored;
	if (gz) {
		if (typeof DecompressionStream === 'undefined') return undefined;
		try {
			const stream = new Blob([stored as BlobPart])
				.stream()
				.pipeThrough(new DecompressionStream('gzip'));
			out = new Uint8Array(await new Response(stream).arrayBuffer());
		} catch {
			return undefined;
		}
	}
	return out.length === length ? out : undefined;
}

/** An in-memory store (tests, no IndexedDB). */
export function memoryStore(): BakeStore & { readonly size: number } {
	const m = new Map<string, Uint8Array>();
	return {
		get: async (k) => m.get(k),
		put: async (k, v) => void m.set(k, v),
		get size() {
			return m.size;
		}
	};
}

const DB = 'orbital-body-bakes';
const TABLE = 'maps';

/** IndexedDB, or undefined where it is missing or refuses (a private window): then nothing is cached. */
export function indexedDbStore(): BakeStore | undefined {
	if (typeof indexedDB === 'undefined') return undefined;
	const open = (): Promise<IDBDatabase> =>
		new Promise((resolve, reject) => {
			const req = indexedDB.open(DB, 1);
			req.onupgradeneeded = () => req.result.createObjectStore(TABLE);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	let db: Promise<IDBDatabase> | undefined;
	const use = <T>(
		mode: IDBTransactionMode,
		run: (t: IDBObjectStore) => IDBRequest<T>
	): Promise<T> =>
		(db ??= open()).then(
			(d) =>
				new Promise<T>((resolve, reject) => {
					const req = run(d.transaction(TABLE, mode).objectStore(TABLE));
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				})
		);
	return {
		get: (key) =>
			use('readonly', (t) => t.get(key) as IDBRequest<Uint8Array | undefined>).catch(
				() => undefined
			),
		put: (key, bytes) =>
			use('readwrite', (t) => t.put(bytes, key)).then(
				() => undefined,
				() => undefined
			)
	};
}
