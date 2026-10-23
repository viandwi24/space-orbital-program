/**
 * The Library's thumbnail cache (plan 312): the card pictures kept in IndexedDB so the Hangar does
 * not redraw them every session. An entry is keyed by the blueprint, a version of its design (a hash
 * of the design the card builds, so any change to the blueprint or the parts it names draws again),
 * the system and its variant (plan 380: a blueprint may have its own design per system, as the
 * in-memory key does). Pure key logic here; the store is `thumbStore` over IndexedDB or memory.
 */

export interface ThumbRecord {
	key: string;
	url: string;
	at: number;
}

export interface ThumbStore {
	get(key: string): Promise<ThumbRecord | undefined>;
	put(record: ThumbRecord): Promise<void>;
}

/** A short stable hash of text (FNV-1a, 32 bits, in hex). */
export function hashText(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

/** The cache key of a blueprint picture: id, version of its design, system and variant. */
export const thumbKey = (
	id: string,
	design: unknown,
	system: { id: string; variant?: string | undefined }
): string => `${id}@${hashText(JSON.stringify(design))}:${system.id}:${system.variant ?? ''}`;

export function memoryThumbs(): ThumbStore {
	const map = new Map<string, ThumbRecord>();
	return {
		get: async (key) => map.get(key),
		put: async (r) => void map.set(r.key, r)
	};
}

const DB = 'orbital-thumbs';
const STORE = 'thumbs';

/** IndexedDB behind the same interface; a failure turns it into a miss, never an error. */
export function indexedDbThumbs(database = DB): ThumbStore {
	let db: Promise<IDBDatabase> | null = null;
	const open = (): Promise<IDBDatabase> =>
		(db ??= new Promise((resolve, reject) => {
			const request = indexedDB.open(database, 1);
			request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
		}));
	const done = <T>(r: IDBRequest<T>): Promise<T> =>
		new Promise((resolve, reject) => {
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
		});
	return {
		async get(key) {
			try {
				const store = (await open()).transaction(STORE, 'readonly').objectStore(STORE);
				return (await done(store.get(key))) as ThumbRecord | undefined;
			} catch {
				return undefined;
			}
		},
		async put(record) {
			try {
				const store = (await open()).transaction(STORE, 'readwrite').objectStore(STORE);
				await done(store.put(record));
			} catch {
				// storage pressure or a private window: the picture is redrawn next session
			}
		}
	};
}
