/**
 * IndexedDB adapters of `SaveStore` (ADR 0050) and `WorldStore` (ADR 0110). Their own database, so
 * the vessel library's schema is untouched. Version 2 (plan 077) adds the `worlds` store.
 */
import type { SaveStore, StoredSave } from './store';
import type { WorldStore } from './world-store';

export const SAVE_DB = 'orbital-saves';
const DB_VERSION = 2;
const META = 'meta';
const DATA = 'data';
const WORLDS = 'worlds';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(SAVE_DB, DB_VERSION);
		request.onupgradeneeded = (event) => {
			const db = request.result;
			if (event.oldVersion < 1) {
				db.createObjectStore(META, { keyPath: 'id' });
				db.createObjectStore(DATA); // key: the save id
			}
			if (event.oldVersion < 2) db.createObjectStore(WORLDS, { keyPath: 'id' });
		};
		request.onsuccess = () => {
			// Let a newer tab upgrade the schema instead of blocking it; this page reopens on next use.
			request.result.onversionchange = () => {
				request.result.close();
				shared = null;
			};
			resolve(request.result);
		};
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

let shared: Promise<IDBDatabase> | null = null;
/** One connection per page for both stores; a failed open is retried on the next call. */
const connect = (): Promise<IDBDatabase> =>
	(shared ??= open().catch((e) => {
		shared = null;
		throw e;
	}));

export function indexedDbSaveStore(): SaveStore {
	const get = connect;
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

export function indexedDbWorldStore(): WorldStore {
	const store = async (mode: IDBTransactionMode) =>
		(await connect()).transaction(WORLDS, mode).objectStore(WORLDS);
	const write = async (op: (s: IDBObjectStore) => void): Promise<void> => {
		const s = await store('readwrite');
		op(s);
		await committed(s.transaction);
	};
	return {
		list: async () => result((await store('readonly')).getAll()),
		get: async (id) => result((await store('readonly')).get(id)),
		put: (record) => write((s) => s.put(record)),
		delete: (id) => write((s) => s.delete(id))
	};
}

/** Close the shared connection (tests delete the database between cases). */
export async function closeSaveDb(): Promise<void> {
	const db = shared;
	shared = null;
	if (db) (await db.catch(() => null))?.close();
}

/** Asks the browser to keep saves through storage pressure; harmless when refused or missing. */
export async function requestSavePersistence(): Promise<boolean> {
	try {
		return (await navigator.storage?.persist?.()) ?? false;
	} catch {
		return false;
	}
}
