/** IndexedDB adapter of `LibraryStore` (ADR 0041); the logic lives in `library.ts`. */
import type { LibraryStore, StoredRecord } from './library';

const DB = 'orbital';
const STORE = 'library';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
		request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
	});
}

function done<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});
}

/** A store on the browser's IndexedDB. Rejects when it is unavailable; wrap it with `withFallback`. */
export function indexedDbStore(): LibraryStore {
	let db: Promise<IDBDatabase> | null = null;
	const get = (): Promise<IDBDatabase> => (db ??= open());
	const store = async (mode: IDBTransactionMode): Promise<IDBObjectStore> =>
		(await get()).transaction(STORE, mode).objectStore(STORE);
	return {
		list: async () => (await done((await store('readonly')).getAll())) as StoredRecord[],
		put: async (record) => void (await done((await store('readwrite')).put(record))),
		delete: async (id) => void (await done((await store('readwrite')).delete(id)))
	};
}

/** Asks the browser to keep the library through storage pressure; harmless when refused or missing. */
export async function requestPersistence(): Promise<boolean> {
	try {
		return (await navigator.storage?.persist?.()) ?? false;
	} catch {
		return false;
	}
}
