/**
 * The biome maps a world's renderer generates, kept in IndexedDB (plan 364, ADR 0306 point 4): a
 * 1024 map is about half a second of noise on the main thread at every world load, and its bytes
 * (2 MB) read back in a few milliseconds. Stored per world (`catalogKey`) after the first load and
 * handed to core's cache before the renderer is built; core's key carries the generator's version,
 * so an old copy is never read for a new generator.
 */
import { exportPlanetMaps, importPlanetMaps, type PlanetMap } from '@orbital/core';

export interface PlanetMapStore {
	get(world: string): Promise<{ key: string; map: PlanetMap }[] | undefined>;
	put(world: string, maps: { key: string; map: PlanetMap }[]): Promise<void>;
}

/** Hands the world's stored maps to core; how many it took (0 without a store or a copy). */
export async function primePlanetMaps(world: string, store = browserStore()): Promise<number> {
	if (!store) return 0;
	// a store that never answers must not hold the load (plan 388): the maps are made again
	const maps = await Promise.race([
		store.get(world).catch(() => undefined),
		new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3_000))
	]);
	return maps ? importPlanetMaps(maps) : 0;
}

/** Stores every map core holds now, for the next load of the world (once the renderer made them). */
export async function storePlanetMaps(world: string, store = browserStore()): Promise<void> {
	if (!store) return;
	const maps = exportPlanetMaps();
	if (maps.length > 0) await store.put(world, maps).catch(() => undefined);
}

/** IndexedDB (database `orbital-bakes`, store `planet-maps`), or null where there is none. */
export function browserStore(): PlanetMapStore | null {
	if (typeof indexedDB === 'undefined') return null;
	const open = (): Promise<IDBDatabase> =>
		new Promise((resolve, reject) => {
			const request = indexedDB.open('orbital-bakes', 1);
			request.onupgradeneeded = () => request.result.createObjectStore('planet-maps');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
		});
	const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
		open().then(
			(db) =>
				new Promise<T>((resolve, reject) => {
					const request = f(db.transaction('planet-maps', mode).objectStore('planet-maps'));
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
				})
		);
	return {
		get: (world) =>
			run(
				'readonly',
				(s) => s.get(world) as IDBRequest<{ key: string; map: PlanetMap }[] | undefined>
			),
		put: (world, maps) => run('readwrite', (s) => s.put(maps, world)).then(() => undefined)
	};
}
