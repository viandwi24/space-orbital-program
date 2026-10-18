/**
 * The DE440 asset on the page (plan 125, ADR 0122 point 7): an n-body world of the 1:1 Sol system
 * fetches it once from `/ephemeris/`, checks its size and SHA-256, keeps it in IndexedDB, and hands
 * the un-gzipped bytes to the sim Worker. Any other world never fetches it.
 */
import type { WorldInfo } from '@orbital/core';

/** The shipped asset: JPL DE440 (NAIF de440s.bsp) for 2000 to 2100, packed by `tools/pack-de440.ts`. */
export const DE440_ASSET = {
	path: '/ephemeris/de440-2000-2100.bin.gz',
	bytes: 7_499_061,
	sha256: '4e44f260c9f756356733571e27d7b8cef7cde16ce12eb126024996745296bfe0'
} as const;

/** Whether a world's bodies follow DE440: n-body gravity in the 1:1 Sol system. */
export const needsEphemeris = (
	info: Pick<WorldInfo, 'gravityModel' | 'systemId' | 'variant'> | undefined
): boolean => info?.gravityModel === 'n-body' && info.systemId === 'sol' && info.variant === '1:1';

export interface EphemerisCache {
	get(sha256: string): Promise<ArrayBuffer | undefined>;
	put(sha256: string, gz: ArrayBuffer): Promise<void>;
}

export interface EphemerisDeps {
	fetch(
		path: string
	): Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
	cache: EphemerisCache;
	digest(data: ArrayBuffer): Promise<string>;
	gunzip(gz: ArrayBuffer): Promise<ArrayBuffer>;
}

/** The un-gzipped asset: from the cache, else fetched and checked (size, SHA-256) and cached. */
export async function loadEphemeris(
	deps: EphemerisDeps = browserEphemerisDeps(),
	asset: { path: string; bytes: number; sha256: string } = DE440_ASSET
): Promise<ArrayBuffer> {
	let gz = await deps.cache.get(asset.sha256).catch(() => undefined);
	if (!gz || (await deps.digest(gz)) !== asset.sha256) {
		const res = await deps.fetch(asset.path);
		if (!res.ok) throw new Error(`the ephemeris could not be downloaded (HTTP ${res.status})`);
		gz = await res.arrayBuffer();
		if (gz.byteLength !== asset.bytes) {
			throw new Error(`the ephemeris has ${gz.byteLength} bytes, expected ${asset.bytes}`);
		}
		if ((await deps.digest(gz)) !== asset.sha256)
			throw new Error('the ephemeris failed its checksum');
		await deps.cache.put(asset.sha256, gz).catch(() => undefined);
	}
	return deps.gunzip(gz);
}

const hex = (buf: ArrayBuffer): string =>
	[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** IndexedDB (database `orbital-ephemeris`), SubtleCrypto and DecompressionStream. */
export function browserEphemerisDeps(): EphemerisDeps {
	const open = (): Promise<IDBDatabase> =>
		new Promise((resolve, reject) => {
			const request = indexedDB.open('orbital-ephemeris', 1);
			request.onupgradeneeded = () => request.result.createObjectStore('assets');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
		});
	const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
		open().then(
			(db) =>
				new Promise<T>((resolve, reject) => {
					const request = f(db.transaction('assets', mode).objectStore('assets'));
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
				})
		);
	return {
		fetch: (path) => fetch(path),
		cache: {
			get: (sha) => run('readonly', (s) => s.get(sha) as IDBRequest<ArrayBuffer | undefined>),
			put: (sha, gz) => run('readwrite', (s) => s.put(gz, sha)).then(() => undefined)
		},
		digest: async (data) => hex(await crypto.subtle.digest('SHA-256', data)),
		gunzip: (gz) =>
			new Response(
				new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))
			).arrayBuffer()
	};
}
