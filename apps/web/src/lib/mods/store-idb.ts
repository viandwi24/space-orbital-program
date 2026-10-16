/** IndexedDB adapter of `ModStore` (ADR 0057): database `orbital-mods`, store `mods`, key `id`. */
import { memoryModStore, ModStoreError, type ModRecord, type ModStore } from './store';

const DB = 'orbital-mods';
const STORE = 'mods';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
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

const committed = (tx: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
		tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
	});

const wrap = (e: unknown): ModStoreError =>
	e instanceof DOMException && e.name === 'QuotaExceededError'
		? new ModStoreError('The browser has no room left to store this mod.', 'quota')
		: new ModStoreError(e instanceof Error ? e.message : String(e), 'unavailable');

export function indexedDbModStore(): ModStore {
	let db: Promise<IDBDatabase> | null = null;
	const get = (): Promise<IDBDatabase> => (db ??= open());
	return {
		list: async () => {
			try {
				const all = await result<ModRecord[]>(
					(await get()).transaction(STORE, 'readonly').objectStore(STORE).getAll()
				);
				return all.sort((a, b) => a.order - b.order);
			} catch (e) {
				throw wrap(e);
			}
		},
		put: async (record) => {
			try {
				const tx = (await get()).transaction(STORE, 'readwrite');
				tx.objectStore(STORE).put(record);
				await committed(tx);
			} catch (e) {
				throw wrap(e);
			}
		},
		delete: async (id) => {
			try {
				const tx = (await get()).transaction(STORE, 'readwrite');
				tx.objectStore(STORE).delete(id);
				await committed(tx);
			} catch (e) {
				throw wrap(e);
			}
		}
	};
}

/** The store the page uses: IndexedDB, or memory (with `volatile` true) when it cannot be opened. */
export async function openModStore(): Promise<{ store: ModStore; volatile: boolean }> {
	try {
		if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
		const store = indexedDbModStore();
		await store.list(); // opens it now, so a failure falls back here
		return { store, volatile: false };
	} catch {
		return { store: memoryModStore(), volatile: true };
	}
}
