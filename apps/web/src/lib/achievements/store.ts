/** Where the profile lives (ADR 0147 point 7): IndexedDB `orbital-profile`, store `profile`, one record. */
import { emptyProfile, type Profile } from './profile';

export interface ProfileStore {
	get(): Promise<Profile>;
	put(profile: Profile): Promise<void>;
}

export function memoryProfileStore(initial: Profile = emptyProfile()): ProfileStore {
	let current = structuredClone(initial);
	return {
		get: async () => structuredClone(current),
		put: async (p) => {
			current = structuredClone(p);
		}
	};
}

const DB = 'orbital-profile';
const STORE = 'profile';
const KEY = 'profile';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
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

function indexedDbProfileStore(): ProfileStore {
	let db: Promise<IDBDatabase> | null = null;
	const get = (): Promise<IDBDatabase> => (db ??= open());
	return {
		async get() {
			const d = await get();
			const p = await result(d.transaction(STORE).objectStore(STORE).get(KEY));
			return (p as Profile | undefined) ?? emptyProfile();
		},
		async put(profile) {
			const d = await get();
			await result(d.transaction(STORE, 'readwrite').objectStore(STORE).put(profile, KEY));
		}
	};
}

let shared: ProfileStore | null = null;

/** The page's profile store; memory when IndexedDB is missing (private windows, tests). */
export function profileStore(): ProfileStore {
	if (shared) return shared;
	shared = typeof indexedDB === 'undefined' ? memoryProfileStore() : indexedDbProfileStore();
	return shared;
}
