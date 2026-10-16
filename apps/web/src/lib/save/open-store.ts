/** The browser's save store with a memory fallback, and the controller state the dialogs share. */
import { indexedDbSaveStore, requestSavePersistence } from './store-idb';
import { memoryStore, type SaveStore } from './store';

/**
 * IndexedDB when it opens; otherwise memory for this session (`volatile` true, and the dialogs
 * say so). The probe is a real read, because `indexedDB` exists in private modes that then refuse
 * every request.
 */
export async function openSaveStore(): Promise<{ store: SaveStore; volatile: boolean }> {
	if (typeof indexedDB === 'undefined') return { store: memoryStore(), volatile: true };
	const idb = indexedDbSaveStore();
	try {
		await idb.listMeta();
		return { store: idb, volatile: false };
	} catch {
		return { store: memoryStore(), volatile: true };
	}
}

export { requestSavePersistence };
