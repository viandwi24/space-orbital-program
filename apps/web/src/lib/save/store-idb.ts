/** IndexedDB adapter of `SaveStore` (ADR 0050). Its own database, so the vessel library's schema is untouched. */
import type { SaveStore, StoredSave } from './store';

const DB = 'orbital-saves';
const META = 'meta';
const DATA = 'data';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(META, { keyPath: 'id' });
			request.result.createObjectStore(DATA); // key: the save id
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
		request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
	});
}

const result = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});

/** Resolves when the transaction committed; a quota failure arrives as its abort error. */
const committed = (tx: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
		tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
	});

export function indexedDbSaveStore(): SaveStore {
	let db: Promise<IDBDatabase> | null = null;
	const get = (): Promise<IDBDatabase> => (db ??= open());
	return {
		listMeta: async () =>
			result((await get()).transaction(META, 'readonly').objectStore(META).getAll()),
		get: async (id) => {
			const tx = (await get()).transaction([META, DATA], 'readonly');
			const meta = await result(tx.objectStore(META).get(id));
			if (!meta) return undefined;
			const data = await result(tx.objectStore(DATA).get(id));
			return { meta, data } as StoredSave;
		},
		put: async (save) => {
			const tx = (await get()).transaction([META, DATA], 'readwrite');
			tx.objectStore(META).put(save.meta);
			tx.objectStore(DATA).put(save.data, save.meta.id);
			await committed(tx);
		},
		delete: async (id) => {
			const tx = (await get()).transaction([META, DATA], 'readwrite');
			tx.objectStore(META).delete(id);
			tx.objectStore(DATA).delete(id);
			await committed(tx);
		}
	};
}

/** Asks the browser to keep saves through storage pressure; harmless when refused or missing. */
export async function requestSavePersistence(): Promise<boolean> {
	try {
		return (await navigator.storage?.persist?.()) ?? false;
	} catch {
		return false;
	}
}
