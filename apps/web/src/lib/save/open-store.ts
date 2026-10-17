/** The browser's save and world stores with a memory fallback, and the controller state the dialogs share. */
import { migrateLegacySaves } from './migrate-worlds';
import { indexedDbSaveStore, indexedDbWorldStore, requestSavePersistence } from './store-idb';
import { memoryStore, type SaveStore } from './store';
import { memoryWorldStore, type WorldStore } from './world-store';

/**
 * IndexedDB when it opens; otherwise memory for this session (`volatile` true, and the dialogs
 * say so). The probe is a real read, because `indexedDB` exists in private modes that then refuse
 * every request. Saves from before worlds existed are attached to the Legacy world on the way
 * (plan 077); a failed migration is retried on the next open and never blocks the saves.
 */
export async function openSaveStore(): Promise<{
	store: SaveStore;
	worlds: WorldStore;
	volatile: boolean;
}> {
	const memory = () => ({ store: memoryStore(), worlds: memoryWorldStore(), volatile: true });
	if (typeof indexedDB === 'undefined') return memory();
	const store = indexedDbSaveStore();
	const worlds = indexedDbWorldStore();
	try {
		await store.listMeta();
	} catch {
		return memory();
	}
	try {
		await migrateLegacySaves(store, worlds, () => Date.now());
	} catch (e) {
		console.warn('orbital: attaching old saves to the Legacy world failed; retried next time', e);
	}
	return { store, worlds, volatile: false };
}

export { requestSavePersistence };
